import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Button, ButtonDirective } from 'primeng/button';
import { MultiSelect } from 'primeng/multiselect';
import { Skeleton } from 'primeng/skeleton';
import { firstValueFrom } from 'rxjs';
import { EventsService } from '../../../api/api/events.service';
import { ProgramsService } from '../../../api/api/programs.service';
import { TeamsService } from '../../../api/api/teams.service';
import { Event } from '../../../api/model/event';
import { Program } from '../../../api/model/program';
import { Team } from '../../../api/model/team';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { loadProgramsForTeams as fanOutPrograms } from '../../programs/program-fanout';
import { computeTeamRole } from '../../teams/teams-list/teams-list.component';
import {
  dayKey,
  endOfMonth,
  endOfWeekMonday,
  isoDate,
  startOfDay,
  startOfMonth,
  startOfWeekMonday,
} from '../../../shared/date/calendar';

const HEX_RE = /^#([0-9a-f]{6}|[0-9a-f]{3})$/i;

/** A single precomputed day cell of the month grid (see `gridCells`). */
interface GridCell {
  /** YYYY-MM-DD local key (stable `@for` track + skeleton lookup). */
  key: string;
  /** Day-of-month number as a string (locale-invariant `d` format). */
  dayLabel: string;
  isToday: boolean;
  /** Whether the day falls in the currently displayed month. */
  inMonth: boolean;
  events: Event[];
}

function normalizeHex(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!HEX_RE.test(v)) return null;
  if (v.length === 4) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`.toUpperCase();
  }
  return v.toUpperCase();
}

@Component({
  selector: 'app-events-calendar',
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    Button,
    ButtonDirective,
    MultiSelect,
    Skeleton,
    EmptyStateComponent,
    TranslocoPipe,
  ],
  templateUrl: './events-calendar.component.html',
  styleUrl: './events-calendar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventsCalendarComponent implements OnInit {
  private readonly teamsService = inject(TeamsService);
  private readonly programsService = inject(ProgramsService);
  private readonly eventsService = inject(EventsService);
  private readonly authService = inject(AuthService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);
  private readonly languageService = inject(LanguageService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly currentMonth = signal(startOfMonth(new Date()));
  protected readonly selectedTeamIds = signal<number[]>([]);
  protected readonly selectedProgramIds = signal<number[]>([]);
  protected readonly availableTeams = signal<Team[]>([]);
  protected readonly availablePrograms = signal<Program[]>([]);
  protected readonly events = signal<Event[]>([]);
  protected readonly loading = signal(false);

  // Sparse set of grid indices that get a single skeleton placeholder
  // while loading() is true — produces a "calendar with a few sessions
  // about to appear" feel without overwhelming the grid.
  protected readonly skeletonIndices = new Set<number>([3, 6, 9, 12, 15, 18, 21, 24, 27, 31]);

  protected readonly canCreate = computed(() => {
    const userId = this.authService.currentUser()?.id;
    if (userId == null) return false;
    return this.availableTeams().some((t) => {
      const role = computeTeamRole(t, userId);
      return role === 'owner' || role === 'manager';
    });
  });

  protected readonly monthStart = computed(() => startOfMonth(this.currentMonth()));
  protected readonly monthEnd = computed(() => endOfMonth(this.currentMonth()));
  protected readonly gridStart = computed(() => startOfWeekMonday(this.monthStart()));
  protected readonly gridEnd = computed(() => endOfWeekMonday(this.monthEnd()));

  protected readonly daysInGrid = computed<Date[]>(() => {
    const start = this.gridStart();
    const end = this.gridEnd();
    const days: Date[] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  });

  protected readonly monthLabel = computed(() => {
    const lang = this.languageService.activeLang();
    return new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric' }).format(
      this.currentMonth(),
    );
  });

  protected readonly weekDayLabels = computed<string[]>(() => {
    const lang = this.languageService.activeLang();
    const formatter = new Intl.DateTimeFormat(lang, { weekday: 'short' });
    const labels: string[] = [];
    const monday = new Date(2024, 0, 1);
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      labels.push(formatter.format(d));
    }
    return labels;
  });

  protected readonly filteredAvailablePrograms = computed(() => {
    const teamIds = new Set(this.selectedTeamIds());
    if (teamIds.size === 0) return [];
    return this.availablePrograms().filter((p) => p.team && teamIds.has(p.team.id));
  });

  protected readonly eventsByDay = computed<Map<string, Event[]>>(() => {
    const map = new Map<string, Event[]>();
    for (const e of this.events()) {
      if (!e.date) continue;
      const key = e.date.slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return map;
  });

  protected readonly today = startOfDay(new Date());

  /**
   * Fully-resolved month grid, memoised off `daysInGrid` / `eventsByDay` /
   * `currentMonth`. Each cell carries everything the template needs as plain
   * properties — no per-cell function calls, no `|| []` array allocations and
   * no `isSameMonth`/`isToday` recomputation during change detection. The grid
   * only recomputes when one of its source signals actually changes.
   *
   * `dayLabel` is the numeric day-of-month: the `localizedDate: 'd'` format is
   * locale-invariant (a plain 1–31 number), so precomputing it here is
   * identical to the previous pipe output while staying allocation-free.
   */
  protected readonly gridCells = computed<GridCell[]>(() => {
    const days = this.daysInGrid();
    const byDay = this.eventsByDay();
    const month = this.currentMonth();
    const todayKey = dayKey(this.today);
    const refMonth = month.getMonth();
    const refYear = month.getFullYear();
    return days.map((day) => {
      const key = dayKey(day);
      return {
        key,
        dayLabel: String(day.getDate()),
        isToday: key === todayKey,
        inMonth: day.getMonth() === refMonth && day.getFullYear() === refYear,
        events: byDay.get(key) ?? [],
      };
    });
  });

  constructor() {
    effect(() => {
      const programs = this.filteredAvailablePrograms();
      const validIds = new Set(programs.map((p) => p.id));
      const current = this.selectedProgramIds();
      const cleaned = current.filter((id) => validIds.has(id));
      if (cleaned.length !== current.length) {
        this.selectedProgramIds.set(cleaned);
      }
    });

    effect(() => {
      // Intended deps: re-fetch when the displayed month or the program filter
      // changes. Read them first so they register as tracked dependencies.
      this.currentMonth();
      this.selectedProgramIds();
      // reloadEvents() synchronously reads gridStart()/gridEnd() (derived from
      // currentMonth); untracked() keeps those out of this effect's dep set so
      // it doesn't re-run on unrelated signal reads inside the async fetch.
      untracked(() => this.reloadEvents());
    });
  }

  ngOnInit(): void {
    this.loadTeams();
  }

  protected get selectedTeamIdsModel(): number[] {
    return this.selectedTeamIds();
  }
  protected set selectedTeamIdsModel(v: number[]) {
    this.selectedTeamIds.set(v);
  }
  protected get selectedProgramIdsModel(): number[] {
    return this.selectedProgramIds();
  }
  protected set selectedProgramIdsModel(v: number[]) {
    this.selectedProgramIds.set(v);
  }

  private loadTeams(): void {
    this.teamsService
      .teamsList({ isActive: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const teams = res.results ?? [];
          this.availableTeams.set(teams);
          this.selectedTeamIds.set(teams.map((t) => t.id));
          void this.loadProgramsForTeams(teams.map((t) => t.id));
        },
        // Without an error handler the team filter silently stays empty and the
        // calendar never loads — surface a toast so the user knows to retry.
        error: () => this.notifyLoadFailed(),
      });
  }

  private async loadProgramsForTeams(teamIds: number[]): Promise<void> {
    try {
      const programs = await fanOutPrograms(this.programsService, teamIds);
      this.availablePrograms.set(programs);
      this.selectedProgramIds.set(programs.map((p) => p.id));
    } catch {
      // A failed program fetch leaves the program filter empty — tell the user.
      this.notifyLoadFailed();
    }
  }

  private notifyLoadFailed(): void {
    this.messageService.add({
      severity: 'error',
      summary: this.transloco.translate('common.error'),
      detail: this.transloco.translate('common.load_failed'),
    });
  }

  private async reloadEvents(): Promise<void> {
    const programIds = this.selectedProgramIds();
    if (programIds.length === 0) {
      this.events.set([]);
      return;
    }
    this.loading.set(true);
    try {
      const start = this.gridStart();
      const end = this.gridEnd();
      // One request for all selected programs (?refer_program__in=) instead of
      // one per program (the previous fan-out grew with the program count).
      const res = await firstValueFrom(
        this.eventsService.eventsList({
          dateGte: isoDate(start),
          dateLte: isoDate(end),
          ordering: 'date',
          referProgramIn: programIds,
        }),
      );
      this.events.set(res.results ?? []);
    } catch {
      this.events.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  protected previousMonth(): void {
    const d = new Date(this.currentMonth());
    d.setMonth(d.getMonth() - 1);
    this.currentMonth.set(d);
  }

  protected nextMonth(): void {
    const d = new Date(this.currentMonth());
    d.setMonth(d.getMonth() + 1);
    this.currentMonth.set(d);
  }

  protected goToToday(): void {
    this.currentMonth.set(startOfMonth(new Date()));
  }

  protected eventBgColor(e: Event): string {
    const hex = normalizeHex(e.color);
    return hex ? `${hex}33` : '#E0E7FF';
  }

  protected eventTextColor(e: Event): string {
    const hex = normalizeHex(e.color);
    return hex ?? '#3730A3';
  }
}
