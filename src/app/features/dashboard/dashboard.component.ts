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
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from 'primeng/button';
import { Message } from 'primeng/message';
import { firstValueFrom } from 'rxjs';
import { EventsService } from '../../api/api/events.service';
import { ProgramsService } from '../../api/api/programs.service';
import { TeamsService } from '../../api/api/teams.service';
import { Event } from '../../api/model/event';
import { Program } from '../../api/model/program';
import { Team } from '../../api/model/team';
import { AuthService } from '../../core/auth/auth.service';
import { computeTeamRole } from '../teams/teams-list/teams-list.component';

interface TeamCard {
  team: Team;
  programsActive: number;
  eventsNext7d: number;
  membersCount: number;
}

interface UpcomingEvent {
  event: Event;
  teamName: string;
  programName: string;
}

interface AttendancePending {
  event: Event;
  teamName: string;
  programName: string;
}

const UPCOMING_DAYS = 14;
const NEXT_7D = 7;
const UPCOMING_MAX_DISPLAYED = 20;
const PENDING_AUDIT_CAP = 30;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function eventDateAsDate(e: Event): Date | null {
  if (!e.date) return null;
  const [y, m, d] = e.date.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, RouterLink, Button, Message, TranslocoPipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly teamsService = inject(TeamsService);
  private readonly programsService = inject(ProgramsService);
  private readonly eventsService = inject(EventsService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly greetingName = computed(() => {
    const user = this.authService.currentUser();
    return user?.first_name || user?.username || '';
  });

  protected readonly managedTeams = signal<Team[]>([]);

  protected readonly teamCards = signal<TeamCard[]>([]);
  protected readonly upcomingEvents = signal<UpcomingEvent[]>([]);
  protected readonly upcomingTotal = signal(0);
  protected readonly attendancePending = signal<AttendancePending[]>([]);
  protected readonly auditTruncated = signal(false);

  protected readonly loadingTeams = signal(true);
  protected readonly loadingUpcoming = signal(true);
  protected readonly loadingPending = signal(true);

  protected readonly errorTeams = signal(false);
  protected readonly errorUpcoming = signal(false);
  protected readonly errorPending = signal(false);

  protected readonly redirected = signal(false);

  protected readonly upcomingDisplayed = computed(() =>
    this.upcomingEvents().slice(0, UPCOMING_MAX_DISPLAYED),
  );

  protected readonly upcomingOverflow = computed(() =>
    Math.max(0, this.upcomingTotal() - UPCOMING_MAX_DISPLAYED),
  );

  constructor() {
    effect(() => {
      if (this.redirected() && this.managedTeams().length === 0 && !this.loadingTeams()) {
        this.router.navigate(['/home']);
      }
    });
  }

  ngOnInit(): void {
    this.bootstrapManagedTeams();
  }

  private bootstrapManagedTeams(): void {
    this.loadingTeams.set(true);
    this.teamsService
      .teamsList(true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const userId = this.authService.currentUser()?.id;
          const teams = res.results ?? [];
          const managed = userId == null
            ? []
            : teams.filter((t) => {
                const role = computeTeamRole(t, userId);
                return role === 'owner' || role === 'manager';
              });
          this.managedTeams.set(managed);
          if (managed.length === 0) {
            this.redirected.set(true);
            this.loadingTeams.set(false);
            this.loadingUpcoming.set(false);
            this.loadingPending.set(false);
            return;
          }
          this.buildSections(managed);
        },
        error: () => {
          this.errorTeams.set(true);
          this.loadingTeams.set(false);
          this.loadingUpcoming.set(false);
          this.loadingPending.set(false);
        },
      });
  }

  private async buildSections(managed: Team[]): Promise<void> {
    const today = startOfDay(new Date());
    const next7 = addDays(today, NEXT_7D);
    const next14 = addDays(today, UPCOMING_DAYS);

    let allPrograms: Array<{ program: Program; team: Team }> = [];
    let allEvents: Array<{ event: Event; team: Team; program: Program }> = [];

    try {
      const programsByTeam = await Promise.all(
        managed.map(async (team) => {
          const res = await firstValueFrom(
            this.programsService.programsList(
              undefined, undefined, undefined, true, undefined,
              undefined, undefined, undefined, team.id,
            ),
          );
          return { team, programs: res.results ?? [] };
        }),
      );

      for (const { team, programs } of programsByTeam) {
        for (const program of programs) {
          allPrograms.push({ program, team });
        }
      }
    } catch {
      this.errorTeams.set(true);
      this.errorUpcoming.set(true);
      this.errorPending.set(true);
      this.loadingTeams.set(false);
      this.loadingUpcoming.set(false);
      this.loadingPending.set(false);
      return;
    }

    try {
      const eventsByProgram = await Promise.all(
        allPrograms.map(async ({ program, team }) => {
          const res = await firstValueFrom(
            this.eventsService.eventsList(
              undefined, undefined, '-date', 1, program.id, undefined,
            ),
          );
          return { events: res.results ?? [], team, program };
        }),
      );
      for (const { events, team, program } of eventsByProgram) {
        for (const event of events) {
          allEvents.push({ event, team, program });
        }
      }
    } catch {
      this.errorUpcoming.set(true);
      this.errorPending.set(true);
      this.loadingUpcoming.set(false);
      this.loadingPending.set(false);
    }

    this.buildTeamCards(managed, allPrograms, allEvents, today, next7);
    this.buildUpcoming(allEvents, today, next14);
    void this.buildPending(allEvents, today);
  }

  private buildTeamCards(
    teams: Team[],
    allPrograms: Array<{ program: Program; team: Team }>,
    allEvents: Array<{ event: Event; team: Team }>,
    today: Date,
    next7: Date,
  ): void {
    const cards: TeamCard[] = teams.map((team) => {
      const programsActive = allPrograms.filter((p) => p.team.id === team.id).length;
      const eventsNext7d = allEvents.filter(({ event, team: t }) => {
        if (t.id !== team.id) return false;
        const d = eventDateAsDate(event);
        return d !== null && d >= today && d < next7;
      }).length;
      const membersCount = team.managers?.length ?? 0;
      return { team, programsActive, eventsNext7d, membersCount };
    });
    this.teamCards.set(cards);
    this.loadingTeams.set(false);

    Promise.all(
      teams.map(async (team) => {
        try {
          const memberships = await firstValueFrom(this.teamsService.teamsMembershipsList(team.id));
          return { teamId: team.id, count: (memberships ?? []).length };
        } catch {
          return { teamId: team.id, count: 0 };
        }
      }),
    ).then((counts) => {
      const map = new Map(counts.map((c) => [c.teamId, c.count]));
      this.teamCards.update((arr) =>
        arr.map((card) => ({ ...card, membersCount: map.get(card.team.id) ?? card.membersCount })),
      );
    });
  }

  private buildUpcoming(
    allEvents: Array<{ event: Event; team: Team; program: Program }>,
    today: Date,
    next14: Date,
  ): void {
    const upcoming = allEvents
      .filter(({ event }) => {
        const d = eventDateAsDate(event);
        return d !== null && d >= today && d < next14;
      })
      .sort((a, b) => {
        const da = eventDateAsDate(a.event)!.getTime();
        const db = eventDateAsDate(b.event)!.getTime();
        if (da !== db) return da - db;
        return (a.event.hour_start ?? '').localeCompare(b.event.hour_start ?? '');
      })
      .map(({ event, team, program }) => ({
        event,
        teamName: team.name,
        programName: program.name,
      }));
    this.upcomingEvents.set(upcoming);
    this.upcomingTotal.set(upcoming.length);
    this.loadingUpcoming.set(false);
  }

  private async buildPending(
    allEvents: Array<{ event: Event; team: Team; program: Program }>,
    today: Date,
  ): Promise<void> {
    const pastEvents = allEvents
      .filter(({ event }) => {
        const d = eventDateAsDate(event);
        return d !== null && d < today && (event.members?.length ?? 0) > 0;
      })
      .sort((a, b) => {
        const da = eventDateAsDate(a.event)!.getTime();
        const db = eventDateAsDate(b.event)!.getTime();
        return db - da;
      });

    const truncated = pastEvents.length > PENDING_AUDIT_CAP;
    this.auditTruncated.set(truncated);
    const audited = pastEvents.slice(0, PENDING_AUDIT_CAP);

    try {
      const audits = await Promise.all(
        audited.map(async ({ event, team, program }) => {
          const res = await firstValueFrom(
            this.eventsService.eventsAttendanceList(event.id),
          );
          const count = (res.results ?? []).length;
          return { event, team, program, count };
        }),
      );
      const pending: AttendancePending[] = audits
        .filter(({ count }) => count === 0)
        .map(({ event, team, program }) => ({
          event,
          teamName: team.name,
          programName: program.name,
        }));
      this.attendancePending.set(pending);
      this.loadingPending.set(false);
    } catch {
      this.errorPending.set(true);
      this.loadingPending.set(false);
    }
  }
}
