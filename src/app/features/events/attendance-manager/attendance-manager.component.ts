import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Tooltip } from 'primeng/tooltip';
import { firstValueFrom, forkJoin } from 'rxjs';
import { AttendanceStatusesService } from '../../../api/api/attendance-statuses.service';
import { EventsService } from '../../../api/api/events.service';
import { TeamsService } from '../../../api/api/teams.service';
import { AttendanceStatus } from '../../../api/model/attendance-status';
import { Event } from '../../../api/model/event';
import { RsvpStatusEnum } from '../../../api/model/rsvp-status-enum';
import { Team } from '../../../api/model/team';

interface AttendanceRow {
  member_id: number;
  fullname: string;
  status_code: string;
  saving: boolean;
}

const STATUS_ICONS: Record<string, string> = {
  unknown: 'pi-question-circle',
  present: 'pi-check-circle',
  absent: 'pi-times-circle',
  late: 'pi-clock',
  excused: 'pi-shield',
};

const FALLBACK_ICON = 'pi-circle';

const SAVE_DEBOUNCE_MS = 300;

@Component({
  selector: 'app-attendance-manager',
  imports: [CommonModule, RouterLink, Button, Tooltip, TranslocoPipe],
  templateUrl: './attendance-manager.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AttendanceManagerComponent implements OnInit, OnDestroy {
  readonly event = input.required<Event>();
  readonly team = input.required<Team>();
  /**
   * Per-member RSVP availability, keyed by member id. When a member has declared
   * a status it is shown (muted) next to their name. Optional — empty by default.
   */
  readonly rsvpByMember = input<Map<number, RsvpStatusEnum>>(new Map());

  private readonly eventsService = inject(EventsService);
  private readonly teamsService = inject(TeamsService);
  private readonly statusesService = inject(AttendanceStatusesService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly statuses = signal<AttendanceStatus[]>([]);
  protected readonly rows = signal<AttendanceRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly noStatuses = signal(false);

  private readonly pendingTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private readonly originalStatusByMember = new Map<number, string>();

  protected readonly orderedStatuses = computed(() =>
    [...this.statuses()]
      .filter((s) => s.is_active)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
  );

  protected readonly defaultStatusCode = computed<string | null>(() => {
    const list = this.orderedStatuses();
    if (list.length === 0) return null;
    return list.find((s) => s.is_default)?.code ?? list[0].code;
  });

  protected statusIcon(code: string): string {
    return STATUS_ICONS[code] ?? FALLBACK_ICON;
  }

  /** The member's RSVP status, or null when they haven't responded. */
  protected rsvpFor(memberId: number): RsvpStatusEnum | null {
    return this.rsvpByMember().get(memberId) ?? null;
  }

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    for (const timer of this.pendingTimers.values()) clearTimeout(timer);
    this.pendingTimers.clear();
  }

  private load(): void {
    this.loading.set(true);
    forkJoin({
      attendances: this.eventsService.eventsAttendanceList({ eventPk: this.event().id }),
      statuses: this.statusesService.attendanceStatusesList(),
      memberships: this.teamsService.teamsMembershipsList({ teamPk: this.team().id }),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ attendances, statuses, memberships }) => {
          const statusList = statuses.results ?? [];
          this.statuses.set(statusList);
          if (statusList.length === 0) {
            this.noStatuses.set(true);
            this.loading.set(false);
            return;
          }
          const fallback = this.defaultStatusCode();
          if (fallback === null) {
            this.loading.set(false);
            return;
          }
          const nameByMemberId = new Map<number, string>();
          for (const m of memberships) {
            nameByMemberId.set(m.member, m.member_fullname);
          }
          const statusByMemberId = new Map<number, string>();
          for (const a of attendances.results ?? []) {
            statusByMemberId.set(a.member, a.status_code);
            if (a.member_fullname && !nameByMemberId.has(a.member)) {
              nameByMemberId.set(a.member, a.member_fullname);
            }
          }
          const rows: AttendanceRow[] = (this.event().members ?? []).map((memberId) => ({
            member_id: memberId,
            fullname: nameByMemberId.get(memberId) ?? `#${memberId}`,
            status_code: statusByMemberId.get(memberId) ?? fallback,
            saving: false,
          }));
          this.rows.set(rows);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  protected onSelect(memberId: number, code: string): void {
    const current = this.rows().find((r) => r.member_id === memberId);
    if (!current || current.status_code === code) return;

    if (!this.originalStatusByMember.has(memberId)) {
      this.originalStatusByMember.set(memberId, current.status_code);
    }

    this.rows.update((rs) =>
      rs.map((r) => (r.member_id === memberId ? { ...r, status_code: code, saving: true } : r)),
    );

    const existing = this.pendingTimers.get(memberId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.pendingTimers.delete(memberId);
      const latest = this.rows().find((r) => r.member_id === memberId);
      if (!latest) return;
      this.persistAttendance(memberId, latest.status_code);
    }, SAVE_DEBOUNCE_MS);
    this.pendingTimers.set(memberId, timer);
  }

  private persistAttendance(memberId: number, code: string): void {
    firstValueFrom(
      this.eventsService.eventsAttendanceBulkCreate({
        eventPk: this.event().id,
        attendanceBulk: { attendances: [{ member_id: memberId, status_code: code }] },
      }),
    )
      .then(() => {
        this.originalStatusByMember.delete(memberId);
        this.rows.update((rs) =>
          rs.map((r) => (r.member_id === memberId ? { ...r, saving: false } : r)),
        );
      })
      .catch((err: HttpErrorResponse) => {
        const previous = this.originalStatusByMember.get(memberId);
        this.originalStatusByMember.delete(memberId);
        this.rows.update((rs) =>
          rs.map((r) =>
            r.member_id === memberId
              ? { ...r, status_code: previous ?? r.status_code, saving: false }
              : r,
          ),
        );
        const detail = (err?.error as { detail?: string } | null)?.detail;
        this.messageService.add({
          severity: 'error',
          summary: this.transloco.translate('common.error'),
          detail: detail ?? this.transloco.translate('events.attendance.save_error'),
        });
      });
  }
}
