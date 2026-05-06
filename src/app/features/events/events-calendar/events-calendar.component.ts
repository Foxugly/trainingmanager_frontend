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
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Button } from 'primeng/button';
import { MultiSelect } from 'primeng/multiselect';
import { Skeleton } from 'primeng/skeleton';
import { firstValueFrom } from 'rxjs';
import { EventsService } from '../../../api/api/events.service';
import { ProgramsService } from '../../../api/api/programs.service';
import { TeamsService } from '../../../api/api/teams.service';
import { Event } from '../../../api/model/event';
import { Program } from '../../../api/model/program';
import { Team } from '../../../api/model/team';
import { AuthService } from '../../../core/auth/auth.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { computeTeamRole } from '../../teams/teams-list/teams-list.component';

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

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

@Component({
  selector: 'app-events-calendar',
  imports: [CommonModule, FormsModule, RouterLink, Button, MultiSelect, Skeleton, TranslocoPipe],
  templateUrl: './events-calendar.component.html',
  styleUrl: './events-calendar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventsCalendarComponent implements OnInit {
  private readonly teamsService = inject(TeamsService);
  private readonly programsService = inject(ProgramsService);
  private readonly eventsService = inject(EventsService);
  private readonly authService = inject(AuthService);
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
      this.currentMonth();
      this.selectedProgramIds();
      this.reloadEvents();
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
      .teamsList(true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const teams = res.results ?? [];
          this.availableTeams.set(teams);
          this.selectedTeamIds.set(teams.map((t) => t.id));
          this.loadProgramsForTeams(teams.map((t) => t.id));
        },
      });
  }

  private async loadProgramsForTeams(teamIds: number[]): Promise<void> {
    if (teamIds.length === 0) {
      this.availablePrograms.set([]);
      return;
    }
    const requests = teamIds.map((teamId) =>
      firstValueFrom(
        this.programsService.programsList(
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          teamId,
        ),
      ),
    );
    const responses = await Promise.all(requests);
    const all: Program[] = responses.flatMap((r) => r.results ?? []);
    const dedup = new Map<number, Program>();
    for (const p of all) dedup.set(p.id, p);
    const programs = Array.from(dedup.values());
    this.availablePrograms.set(programs);
    this.selectedProgramIds.set(programs.map((p) => p.id));
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
      const gte = isoDate(start);
      const lte = isoDate(end);
      const requests = programIds.map((pid) =>
        firstValueFrom(
          this.eventsService.eventsList(
            undefined, undefined, gte, lte, 'date', undefined, undefined, pid, undefined,
          ),
        ),
      );
      const responses = await Promise.all(requests);
      const all: Event[] = responses.flatMap((r) => r.results ?? []);
      this.events.set(all);
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

  protected dayKey(d: Date): string {
    return dayKey(d);
  }

  protected isSameMonth(d: Date, ref: Date): boolean {
    return d.getMonth() === ref.getMonth() && d.getFullYear() === ref.getFullYear();
  }

  protected isToday(d: Date): boolean {
    return d.toDateString() === this.today.toDateString();
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
