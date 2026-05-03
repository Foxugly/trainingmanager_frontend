import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Message } from 'primeng/message';
import { Select } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { forkJoin } from 'rxjs';
import { AttendanceStatusesService } from '../../../api/api/attendance-statuses.service';
import { EventsService } from '../../../api/api/events.service';
import { ProgramsService } from '../../../api/api/programs.service';
import { TeamsService } from '../../../api/api/teams.service';
import { Attendance } from '../../../api/model/attendance';
import { AttendanceBulk } from '../../../api/model/attendance-bulk';
import { AttendanceStatus } from '../../../api/model/attendance-status';
import { Event } from '../../../api/model/event';
import { Team } from '../../../api/model/team';
import { AuthService } from '../../../core/auth/auth.service';
import { TeamRole, computeTeamRole } from '../../teams/teams-list/teams-list.component';

interface AttendanceRow {
  member_id: number;
  fullname: string;
  status_code: string;
  fieldError: string | null;
}

interface FieldErrors {
  [field: string]: string[];
}

@Component({
  selector: 'app-events-attendance',
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    Button,
    Message,
    Select,
    TableModule,
    TranslocoPipe,
  ],
  templateUrl: './events-attendance.component.html',
  styleUrl: './events-attendance.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventsAttendanceComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly eventsService = inject(EventsService);
  private readonly programsService = inject(ProgramsService);
  private readonly teamsService = inject(TeamsService);
  private readonly statusesService = inject(AttendanceStatusesService);
  private readonly authService = inject(AuthService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly eventId = signal<number | null>(null);
  protected readonly event = signal<Event | null>(null);
  protected readonly team = signal<Team | null>(null);
  protected readonly statuses = signal<AttendanceStatus[]>([]);
  protected readonly rows = signal<AttendanceRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly notFound = signal(false);
  protected readonly noStatuses = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly currentUserRole = computed<TeamRole | null>(() => {
    const t = this.team();
    const userId = this.authService.currentUser()?.id;
    if (!t || userId == null) return null;
    return computeTeamRole(t, userId);
  });

  protected readonly canManage = computed(() => {
    const role = this.currentUserRole();
    return role === 'owner' || role === 'manager';
  });

  protected readonly permissionDenied = computed(() => {
    return this.team() !== null && !this.canManage();
  });

  protected readonly defaultStatusCode = computed<string | null>(() => {
    const list = this.statuses();
    if (list.length === 0) return null;
    const flagged = list.find((s) => s.is_default);
    if (flagged) return flagged.code;
    const sorted = [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return sorted[0]?.code ?? null;
  });

  constructor() {
    effect(() => {
      if (this.permissionDenied()) {
        const id = this.eventId();
        if (id !== null) {
          this.router.navigate(['/events', id]);
        }
      }
    });
  }

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    const id = idParam ? Number(idParam) : NaN;
    if (!Number.isFinite(id)) {
      this.notFound.set(true);
      return;
    }
    this.eventId.set(id);
    this.loadAll(id);
  }

  private loadAll(eventId: number): void {
    this.loading.set(true);
    forkJoin({
      event: this.eventsService.eventsRetrieve(eventId),
      attendances: this.eventsService.eventsAttendanceList(eventId),
      statuses: this.statusesService.attendanceStatusesList(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ event, attendances, statuses }) => {
          this.event.set(event);
          const statusList = statuses.results ?? [];
          this.statuses.set(statusList);
          if (statusList.length === 0) {
            this.noStatuses.set(true);
            this.loading.set(false);
            return;
          }
          this.loadTeamAndBuildRows(event, attendances.results ?? []);
        },
        error: () => {
          this.notFound.set(true);
          this.loading.set(false);
        },
      });
  }

  private loadTeamAndBuildRows(event: Event, attendances: Attendance[]): void {
    const programId = event.refer_program?.id;
    if (programId == null) {
      this.loading.set(false);
      return;
    }
    this.programsService
      .programsRetrieve(programId, true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (program) => {
          const teamId = program.team?.id;
          if (teamId == null) {
            this.loading.set(false);
            return;
          }
          forkJoin({
            team: this.teamsService.teamsRetrieve(teamId),
            memberships: this.teamsService.teamsMembershipsList(teamId),
          })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: ({ team, memberships }) => {
                this.team.set(team);
                this.buildRows(event, attendances, memberships);
                this.loading.set(false);
              },
              error: () => this.loading.set(false),
            });
        },
        error: () => this.loading.set(false),
      });
  }

  private buildRows(
    event: Event,
    attendances: Attendance[],
    memberships: { member: number; member_fullname: string }[],
  ): void {
    const nameByMemberId = new Map<number, string>();
    for (const m of memberships) {
      nameByMemberId.set(m.member, m.member_fullname);
    }
    for (const a of attendances) {
      if (a.member_fullname && !nameByMemberId.has(a.member)) {
        nameByMemberId.set(a.member, a.member_fullname);
      }
    }
    const statusByMemberId = new Map<number, string>();
    for (const a of attendances) {
      statusByMemberId.set(a.member, a.status_code);
    }
    const fallback = this.defaultStatusCode();
    if (fallback === null) return;

    const rows: AttendanceRow[] = (event.members ?? []).map((memberId) => ({
      member_id: memberId,
      fullname: nameByMemberId.get(memberId) ?? `#${memberId}`,
      status_code: statusByMemberId.get(memberId) ?? fallback,
      fieldError: null,
    }));
    this.rows.set(rows);
  }

  protected updateRowStatus(memberId: number, statusCode: string): void {
    this.rows.update((rs) =>
      rs.map((r) => (r.member_id === memberId ? { ...r, status_code: statusCode, fieldError: null } : r)),
    );
  }

  protected save(): void {
    const id = this.eventId();
    if (id === null) return;
    const rows = this.rows();
    if (rows.length === 0) return;

    this.saving.set(true);
    this.errorMessage.set(null);
    this.rows.update((rs) => rs.map((r) => ({ ...r, fieldError: null })));

    const payload: AttendanceBulk = {
      attendances: rows.map((r) => ({ member_id: r.member_id, status_code: r.status_code })),
    };
    this.eventsService
      .eventsAttendanceBulkCreate(id, payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate('events.attendance.saved'),
          });
          this.router.navigate(['/events', id]);
        },
        error: (err: HttpErrorResponse) => {
          this.applyServerError(err);
          this.saving.set(false);
        },
      });
  }

  private applyServerError(err: HttpErrorResponse): void {
    const body = err?.error as
      | {
          code?: string;
          detail?: string;
          fields?: FieldErrors;
          attendances?: Array<FieldErrors | null> | FieldErrors;
        }
      | null
      | undefined;

    if (body?.attendances && Array.isArray(body.attendances)) {
      const perRow = body.attendances;
      this.rows.update((rs) =>
        rs.map((r, idx) => {
          const itemErr = perRow[idx];
          if (itemErr && typeof itemErr === 'object' && Object.keys(itemErr).length > 0) {
            const messages = Object.entries(itemErr)
              .flatMap(([k, v]) => (Array.isArray(v) ? v.map((m) => `${k}: ${m}`) : []));
            return { ...r, fieldError: messages.join(' · ') || 'events.attendance.save_error' };
          }
          return r;
        }),
      );
      return;
    }

    if (body?.fields && Object.keys(body.fields).length > 0) {
      this.errorMessage.set(
        Object.entries(body.fields)
          .map(([k, v]) => `${k}: ${v.join(', ')}`)
          .join(' · '),
      );
      return;
    }

    this.errorMessage.set(body?.detail ?? 'events.attendance.save_error');
  }
}
