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
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { catchError, of, switchMap, tap } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Message } from 'primeng/message';
import { Skeleton } from 'primeng/skeleton';
import { Tooltip } from 'primeng/tooltip';
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
import { ShortTimePipe } from '../../../shared/datetime/short-time.pipe';
import { AttachmentListComponent } from '../../../shared/ui/attachment-list/attachment-list.component';
import { DetailHeaderComponent } from '../../../shared/ui/detail-header/detail-header.component';
import {
  ActiveToggleComponent,
  ActiveToggleLabels,
} from '../../../shared/ui/active-toggle/active-toggle.component';
import {
  dayKey,
  endOfMonth,
  endOfWeekMonday,
  isoDate,
  startOfMonth,
  startOfWeekMonday,
} from '../../../shared/date/calendar';
import { LocalizedDatePipe } from '../../../shared/datetime/localized-date.pipe';

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
    LocalizedDatePipe,
    RouterLink,
    Button,
    ConfirmDialog,
    GenerateEventsDialogComponent,
    Message,
    Skeleton,
    Tooltip,
    TranslocoPipe,
    ShortTimePipe,
    DetailHeaderComponent,
    AttachmentListComponent,
    ActiveToggleComponent,
  ],
  templateUrl: './programs-detail.component.html',
  styleUrl: './programs-detail.component.scss',
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgramsDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly programsService = inject(ProgramsService);
  private readonly teamsService = inject(TeamsService);
  private readonly eventsService = inject(EventsService);
  private readonly authService = inject(AuthService);
  private readonly languageService = inject(LanguageService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly programId = signal<number | null>(null);
  protected readonly program = signal<Program | null>(null);
  protected readonly team = signal<Team | null>(null);
  protected readonly loading = signal(false);
  protected readonly notFound = signal(false);
  /** Set when the program fetch fails with a non-404 status (server/network);
   *  surfaced as an inline error block with a retry, distinct from notFound. */
  protected readonly loadError = signal(false);

  protected readonly activeValue = signal(false);
  protected readonly patchActive = (id: number, value: boolean) =>
    this.programsService.programsPartialUpdate({
      id,
      patchedProgramRequest: { is_active: value },
    });
  protected readonly activeLabels = computed<ActiveToggleLabels>(() => ({
    active: this.transloco.translate('common.active'),
    inactive: this.transloco.translate('common.inactive'),
    confirm: this.transloco.translate('common.confirm_deactivate'),
    errorSummary: this.transloco.translate('common.error'),
    errorDetail: this.transloco.translate('common.update_failed'),
  }));

  protected readonly events = signal<Event[]>([]);
  protected readonly loadingEvents = signal(false);
  protected readonly currentMonth = signal<Date>(startOfMonth(new Date()));

  private readonly monthCache = new Map<string, Event[]>();

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

  private readonly monthScope = computed(() => ({
    id: this.programId(),
    month: this.currentMonth(),
  }));

  constructor() {
    toObservable(this.monthScope)
      .pipe(
        switchMap(({ id, month }) => {
          if (id === null) return of(null);
          const cacheKey = `${id}:${month.getFullYear()}-${month.getMonth()}`;
          const cached = this.monthCache.get(cacheKey);
          if (cached) {
            this.events.set(cached);
            return of(null);
          }
          this.loadingEvents.set(true);
          const gridStart = startOfWeekMonday(startOfMonth(month));
          const gridEnd = endOfWeekMonday(endOfMonth(month));
          return this.eventsService
            .eventsList({
              dateGte: isoDate(gridStart),
              dateLte: isoDate(gridEnd),
              ordering: 'date',
              referProgram: id,
            })
            .pipe(
              tap((res) => {
                const list = res.results ?? [];
                this.monthCache.set(cacheKey, list);
                this.events.set(list);
                this.loadingEvents.set(false);
              }),
              catchError(() => {
                this.loadingEvents.set(false);
                return of(null);
              }),
            );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

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
    this.notFound.set(false);
    this.loadError.set(false);
    this.programsService
      .programsRetrieve({ id, includeInactive: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (p) => {
          this.program.set(p);
          this.activeValue.set(p.is_active ?? true);
          this.loading.set(false);
          if (p.team?.id != null) {
            this.loadTeam(p.team.id);
          }
          this.initCalendarMonth(p);
        },
        error: (err: HttpErrorResponse) => {
          this.loading.set(false);
          // A genuine 404 means the program doesn't exist (or isn't visible) —
          // show the dedicated "not found" copy. Any other status (server error,
          // network failure) is a transient load error: surface it distinctly
          // with a retry + a toast rather than masquerading as "not found".
          if (err?.status === 404) {
            this.notFound.set(true);
          } else {
            this.loadError.set(true);
            this.messageService.add({
              severity: 'error',
              summary: this.transloco.translate('common.error'),
              detail: this.transloco.translate('common.load_failed'),
            });
          }
        },
      });
  }

  protected reloadProgram(): void {
    const id = this.programId();
    if (id !== null) this.loadProgram(id);
  }

  private loadTeam(teamId: number): void {
    this.teamsService
      .teamsRetrieve({ id: teamId })
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

  private invalidateEventsCache(): void {
    this.monthCache.clear();
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
      this.invalidateEventsCache();
      this.loadProgram(id);
      // Cache was just cleared; re-trigger the reactive month loader for the
      // current month by emitting a fresh (reference-distinct) Date so monthScope
      // recomputes and the toObservable(monthScope) pipe refetches.
      const m = this.currentMonth();
      this.currentMonth.set(new Date(m.getFullYear(), m.getMonth(), 1));
    }
  }

}
