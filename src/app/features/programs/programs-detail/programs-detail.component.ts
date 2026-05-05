import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { EventsService } from '../../../api/api/events.service';
import { ProgramsService } from '../../../api/api/programs.service';
import { TeamsService } from '../../../api/api/teams.service';
import { Event } from '../../../api/model/event';
import { Program } from '../../../api/model/program';
import { Team } from '../../../api/model/team';
import { AuthService } from '../../../core/auth/auth.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { TeamRole, computeTeamRole } from '../../teams/teams-list/teams-list.component';
import {
  GenerateEventsDialogComponent,
  GenerateEventsResult,
} from '../generate-events-dialog/generate-events-dialog.component';
import { DetailHeaderComponent } from '../../../shared/ui/detail-header/detail-header.component';

const HEX_RE = /^#([0-9a-f]{6}|[0-9a-f]{3})$/i;

function normalizeHex(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!HEX_RE.test(v)) return null;
  if (v.length === 4) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`.toUpperCase();
  }
  return v.toUpperCase();
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function startOfWeekMonday(d: Date): Date {
  const x = startOfDay(d);
  const dow = x.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  x.setDate(x.getDate() + offset);
  return x;
}

function endOfWeekMonday(d: Date): Date {
  const x = startOfWeekMonday(d);
  x.setDate(x.getDate() + 6);
  return x;
}

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function eventDateAsDate(e: Event): Date | null {
  if (!e.date) return null;
  const [y, m, d] = e.date.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

@Component({
  selector: 'app-programs-detail',
  imports: [
    CommonModule,
    RouterLink,
    Button,
    ConfirmDialog,
    GenerateEventsDialogComponent,
    TranslocoPipe,
    DetailHeaderComponent,
  ],
  templateUrl: './programs-detail.component.html',
  styleUrl: './programs-detail.component.scss',
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgramsDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly programsService = inject(ProgramsService);
  private readonly teamsService = inject(TeamsService);
  private readonly eventsService = inject(EventsService);
  private readonly authService = inject(AuthService);
  private readonly languageService = inject(LanguageService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly programId = signal<number | null>(null);
  protected readonly program = signal<Program | null>(null);
  protected readonly team = signal<Team | null>(null);
  protected readonly loading = signal(false);
  protected readonly notFound = signal(false);
  protected readonly archiving = signal(false);

  protected readonly events = signal<Event[]>([]);
  protected readonly loadingEvents = signal(false);
  protected readonly currentMonth = signal<Date>(startOfMonth(new Date()));

  protected readonly showGenerateDialog = signal(false);
  protected readonly lastGenerationResult = signal<GenerateEventsResult | null>(null);

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

  protected readonly canGenerate = this.canManage;

  protected readonly isArchived = computed(() => this.program()?.is_active === false);

  protected readonly monthStart = computed(() => startOfMonth(this.currentMonth()));
  protected readonly monthEnd = computed(() => endOfMonth(this.currentMonth()));
  protected readonly gridStart = computed(() => startOfWeekMonday(this.monthStart()));
  protected readonly gridEnd = computed(() => endOfWeekMonday(this.monthEnd()));

  protected readonly daysInGrid = computed<Date[]>(() => {
    const out: Date[] = [];
    const cursor = new Date(this.gridStart());
    const end = this.gridEnd();
    while (cursor <= end) {
      out.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  });

  protected readonly weekDayLabels = computed<string[]>(() => {
    const lang = this.languageService.activeLang();
    const fmt = new Intl.DateTimeFormat(lang, { weekday: 'short' });
    // Monday-based (2026-01-05 was a Monday)
    const ref = new Date(2026, 0, 5);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(ref);
      d.setDate(d.getDate() + i);
      return fmt.format(d);
    });
  });

  protected readonly monthLabel = computed<string>(() => {
    const lang = this.languageService.activeLang();
    return new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric' }).format(
      this.currentMonth(),
    );
  });

  protected readonly eventsByDay = computed<Map<string, Event[]>>(() => {
    const map = new Map<string, Event[]>();
    const start = this.gridStart().getTime();
    const end = this.gridEnd().getTime();
    for (const e of this.events()) {
      const d = eventDateAsDate(e);
      if (d === null) continue;
      const t = d.getTime();
      if (t < start || t > end) continue;
      const key = dayKey(d);
      const arr = map.get(key);
      if (arr) {
        arr.push(e);
      } else {
        map.set(key, [e]);
      }
    }
    return map;
  });

  protected readonly eventsForMonth = computed<Event[]>(() => {
    const monthStart = this.monthStart().getTime();
    const monthEnd = this.monthEnd().getTime();
    return this.events()
      .filter((e) => {
        const d = eventDateAsDate(e);
        if (d === null) return false;
        const t = d.getTime();
        return t >= monthStart && t <= monthEnd;
      })
      .sort((a, b) => {
        const da = eventDateAsDate(a)!.getTime();
        const db = eventDateAsDate(b)!.getTime();
        if (da !== db) return da - db;
        return (a.hour_start ?? '').localeCompare(b.hour_start ?? '');
      });
  });

  protected readonly eventsByDateAsc = computed<Event[]>(() => {
    return [...this.events()].sort((a, b) => {
      const da = eventDateAsDate(a);
      const db = eventDateAsDate(b);
      if (da === null && db === null) return 0;
      if (da === null) return 1;
      if (db === null) return -1;
      if (da.getTime() !== db.getTime()) return da.getTime() - db.getTime();
      return (a.hour_start ?? '').localeCompare(b.hour_start ?? '');
    });
  });

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    const id = idParam ? Number(idParam) : NaN;
    if (!Number.isFinite(id)) {
      this.notFound.set(true);
      return;
    }
    this.programId.set(id);
    this.loadProgram(id);
  }

  protected loadProgram(id: number): void {
    this.loading.set(true);
    this.programsService
      .programsRetrieve(id, true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (p) => {
          this.program.set(p);
          this.loading.set(false);
          if (p.team?.id != null) {
            this.loadTeam(p.team.id);
          }
          this.initCalendarMonth(p);
          this.loadEvents(id);
        },
        error: () => {
          this.notFound.set(true);
          this.loading.set(false);
        },
      });
  }

  private loadTeam(teamId: number): void {
    this.teamsService
      .teamsRetrieve(teamId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (t) => this.team.set(t),
      });
  }

  private initCalendarMonth(p: Program): void {
    if (p.date_start) {
      const [y, m] = p.date_start.split('-').map(Number);
      if (Number.isFinite(y) && Number.isFinite(m)) {
        this.currentMonth.set(new Date(y, m - 1, 1));
        return;
      }
    }
    this.currentMonth.set(startOfMonth(new Date()));
  }

  private loadEvents(programId: number): void {
    this.loadingEvents.set(true);
    this.eventsService
      .eventsList(undefined, undefined, '-date', 1, programId, undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.events.set(res.results ?? []);
          this.loadingEvents.set(false);
        },
        error: () => {
          this.events.set([]);
          this.loadingEvents.set(false);
        },
      });
  }

  protected previousMonth(): void {
    const d = this.currentMonth();
    this.currentMonth.set(new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }

  protected nextMonth(): void {
    const d = this.currentMonth();
    this.currentMonth.set(new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }

  protected goToProgramStart(): void {
    const p = this.program();
    if (p) this.initCalendarMonth(p);
  }

  protected isSameMonth(d: Date, ref: Date): boolean {
    return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
  }

  protected isToday(d: Date): boolean {
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  }

  protected eventBgColor(e: Event): string {
    const hex = normalizeHex(e.color);
    if (hex) return `${hex}33`;
    return '#E0E7FF';
  }

  protected eventTextColor(e: Event): string {
    const hex = normalizeHex(e.color);
    return hex ?? '#3730A3';
  }

  protected dayKey(d: Date): string {
    return dayKey(d);
  }

  protected openGenerateDialog(): void {
    this.lastGenerationResult.set(null);
    this.showGenerateDialog.set(true);
  }

  protected onGenerated(result: GenerateEventsResult): void {
    this.lastGenerationResult.set(result);
    const id = this.programId();
    if (id != null) {
      this.loadProgram(id);
      this.loadEvents(id);
    }
  }

  protected confirmArchive(): void {
    const id = this.programId();
    if (id === null) return;
    this.confirmationService.confirm({
      header: this.transloco.translate('programs.actions.archive_confirm_title'),
      message: this.transloco.translate('programs.actions.archive_confirm_message'),
      acceptLabel: this.transloco.translate('programs.actions.archive'),
      rejectLabel: this.transloco.translate('common.cancel'),
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.archive(id),
    });
  }

  private archive(id: number): void {
    this.archiving.set(true);
    this.programsService
      .programsPartialUpdate(id, undefined, { is_active: false })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.program.set(updated);
          this.archiving.set(false);
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate('programs.actions.archived'),
          });
          this.router.navigate(['/programs']);
        },
        error: () => {
          this.archiving.set(false);
          this.messageService.add({
            severity: 'error',
            summary: this.transloco.translate('common.error'),
            detail: this.transloco.translate('programs.errors.unknown'),
          });
        },
      });
  }

  protected restore(): void {
    const id = this.programId();
    if (id === null) return;
    this.archiving.set(true);
    this.programsService
      .programsPartialUpdate(id, true, { is_active: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.program.set(updated);
          this.archiving.set(false);
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate('programs.actions.restored'),
          });
        },
        error: () => {
          this.archiving.set(false);
          this.messageService.add({
            severity: 'error',
            summary: this.transloco.translate('common.error'),
            detail: this.transloco.translate('programs.errors.unknown'),
          });
        },
      });
  }
}
