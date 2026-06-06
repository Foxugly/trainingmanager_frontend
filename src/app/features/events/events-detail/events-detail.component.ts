import { CommonModule } from '@angular/common';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
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
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Fieldset } from 'primeng/fieldset';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { ProgressSpinner } from 'primeng/progressspinner';
import { Select } from 'primeng/select';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { Tooltip } from 'primeng/tooltip';
import { firstValueFrom } from 'rxjs';
import { EnergySegmentsService } from '../../../api/api/energy-segments.service';
import { EventsService } from '../../../api/api/events.service';
import { ExercisesService } from '../../../api/api/exercises.service';
import { ProgramsService } from '../../../api/api/programs.service';
import { RoundsService } from '../../../api/api/rounds.service';
import { SportsService } from '../../../api/api/sports.service';
import { TeamsService } from '../../../api/api/teams.service';
import { EnergySegment } from '../../../api/model/energy-segment';
import { Event } from '../../../api/model/event';
import { Exercise } from '../../../api/model/exercise';
import { GenerateTrainingResponse } from '../../../api/model/generate-training-response';
import { LanguageEnum } from '../../../api/model/language-enum';
import { Modality } from '../../../api/model/modality';
import { Round } from '../../../api/model/round';
import { RotiSummary } from '../../../api/model/roti-summary';
import { RsvpSummary } from '../../../api/model/rsvp-summary';
import { RsvpStatusEnum } from '../../../api/model/rsvp-status-enum';
import { Team } from '../../../api/model/team';
import { VisibilityMode } from '../../../api/model/visibility-mode';
import { AuthService } from '../../../core/auth/auth.service';
import { type FieldErrors, extractServerError } from '../../../shared/forms/notify-error';
import { AiErrorMappingService } from '../../ai/ai-error-mapping.service';
import { TeamRole, computeTeamRole } from '../../teams/teams-list/teams-list.component';
import { DetailHeaderComponent } from '../../../shared/ui/detail-header/detail-header.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { AttachmentListComponent } from '../../../shared/ui/attachment-list/attachment-list.component';
import { RoundFormDialogComponent } from '../round-form-dialog/round-form-dialog.component';
import { AttendanceManagerComponent } from '../attendance-manager/attendance-manager.component';
import { RegenerateTrainingDialogComponent } from '../regenerate-training-dialog/regenerate-training-dialog.component';
import {
  DuplicateEventDialogComponent,
  type DuplicateEventSubmit,
} from '../duplicate-event-dialog/duplicate-event-dialog.component';
import { ShareEventDialogComponent } from '../share-event-dialog/share-event-dialog.component';
import { EventShareResponse } from '../../../api/model/event-share-response';
import { timeMmSsValidator } from '../shared/time-validator';

/** Reactive form for an inline exercise row (create or edit). */
type ExerciseRowForm = FormGroup<{
  modality_id: import('@angular/forms').FormControl<number | null>;
  energysegment_id: import('@angular/forms').FormControl<number | null>;
  repetition: import('@angular/forms').FormControl<number>;
  distance: import('@angular/forms').FormControl<number>;
  t_start: import('@angular/forms').FormControl<string>;
  t_break: import('@angular/forms').FormControl<string>;
  notes: import('@angular/forms').FormControl<string>;
}>;

/** A freshly-added (not yet persisted) exercise row pinned to a round. */
interface NewExerciseRow {
  /** stable client-side key for tracking + form lookup */
  key: string;
  roundId: number;
}

@Component({
  selector: 'app-events-detail',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    Button,
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
    ConfirmDialog,
    Fieldset,
    InputNumber,
    InputText,
    Message,
    ProgressSpinner,
    Select,
    Tab,
    TabList,
    TabPanel,
    TabPanels,
    Tabs,
    Tooltip,
    TranslocoPipe,
    DetailHeaderComponent,
    EmptyStateComponent,
    AttachmentListComponent,
    RoundFormDialogComponent,
    AttendanceManagerComponent,
    RegenerateTrainingDialogComponent,
    DuplicateEventDialogComponent,
    ShareEventDialogComponent,
  ],
  templateUrl: './events-detail.component.html',
  styleUrl: './events-detail.component.scss',
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventsDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly eventsService = inject(EventsService);
  private readonly programsService = inject(ProgramsService);
  private readonly teamsService = inject(TeamsService);
  private readonly roundsService = inject(RoundsService);
  private readonly exercisesService = inject(ExercisesService);
  private readonly sportsService = inject(SportsService);
  private readonly energySegmentsService = inject(EnergySegmentsService);
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly aiErrorMapping = inject(AiErrorMappingService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly eventId = signal<number | null>(null);
  protected readonly event = signal<Event | null>(null);
  protected readonly team = signal<Team | null>(null);
  protected readonly loading = signal(false);
  protected readonly notFound = signal(false);
  protected readonly regenerating = signal(false);
  protected readonly deleting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly lastResult = signal<GenerateTrainingResponse | null>(null);
  protected readonly rounds = signal<Round[]>([]);
  protected readonly exercisesByRound = signal<Map<number, Exercise[]>>(new Map());
  protected readonly loadingRounds = signal(false);
  protected readonly roundsLoadError = signal<{ kind: 'partial' | 'full'; count: number } | null>(
    null,
  );

  protected readonly activeTab = signal<string>('training');

  protected readonly showRoundDialog = signal(false);
  protected readonly roundDialogMode = signal<'create' | 'edit'>('create');
  protected readonly editingRound = signal<Round | null>(null);

  // --- Inline exercise editing state ---
  /** Id of the existing exercise currently in inline-edit mode (null = none). */
  protected readonly editingExerciseId = signal<number | null>(null);
  /** Freshly-added rows (not yet persisted), one possible per round, keyed by client key. */
  protected readonly newRows = signal<NewExerciseRow[]>([]);
  /** Exercise option lists, loaded once the team's sport is known. */
  protected readonly modalities = signal<Modality[]>([]);
  protected readonly energySegments = signal<EnergySegment[]>([]);
  protected readonly loadingOptions = signal(false);
  /** Per-row save-in-flight flag, keyed by row key (ex-<id> or the new-row key). */
  protected readonly savingRows = signal<Set<string>>(new Set());
  /** Per-row server field errors, keyed by row key. */
  protected readonly rowFieldErrors = signal<Map<string, FieldErrors>>(new Map());
  /** Active reactive form groups, keyed by row key. */
  private readonly rowForms = new Map<string, ExerciseRowForm>();
  private newRowSeq = 0;

  protected readonly reordering = signal(false);

  protected readonly showRegenerateDialog = signal(false);

  protected readonly showDuplicateDialog = signal(false);
  protected readonly duplicating = signal(false);

  protected readonly showShareDialog = signal(false);
  protected readonly sharing = signal(false);

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

  protected readonly canRegenerate = this.canManage;

  /**
   * True when the event has a date that is strictly before today (local date,
   * compared as yyyy-mm-dd). The backend refuses to regenerate past sessions
   * (HTTP 409 `event_in_past`), so the regenerate action is disabled for them.
   */
  protected readonly isPastEvent = computed(() => {
    const date = this.event()?.date;
    if (!date) return false;
    return date < this.todayLocalIso();
  });

  /** Local calendar date as a yyyy-mm-dd string (not UTC). */
  private todayLocalIso(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = `${now.getMonth() + 1}`.padStart(2, '0');
    const d = `${now.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // --- ROTI (session difficulty rating) ---
  protected readonly rotiEnabled = computed(() => this.team()?.roti_enabled === true);
  /** Athlete = a team member who is neither owner nor manager. */
  protected readonly isAthlete = computed(() => this.currentUserRole() === 'member');
  protected readonly rotiSummary = signal<RotiSummary | null>(null);
  protected readonly rotiSubmitting = signal(false);
  protected readonly rotiScores: readonly number[] = [1, 2, 3, 4, 5];

  protected readonly rotiDistribution = computed<{ score: number; count: number }[]>(() => {
    const dist = this.rotiSummary()?.distribution ?? {};
    return this.rotiScores.map((score) => ({
      score,
      count: Number(dist[String(score)] ?? 0),
    }));
  });

  protected readonly rotiMaxCount = computed<number>(() => {
    const counts = this.rotiDistribution().map((d) => d.count);
    return counts.length ? Math.max(1, ...counts) : 1;
  });

  // --- RSVP (availability) ---
  protected readonly rsvpEnabled = computed(() => this.team()?.rsvp_enabled === true);
  protected readonly rsvpSummary = signal<RsvpSummary | null>(null);
  protected readonly rsvpSubmitting = signal(false);
  protected readonly rsvpApplying = signal(false);
  /** Status options for the athlete buttons, ordered going / maybe / not_going. */
  protected readonly rsvpStatuses: readonly RsvpStatusEnum[] = [
    RsvpStatusEnum.Going,
    RsvpStatusEnum.Maybe,
    RsvpStatusEnum.NotGoing,
  ];

  /**
   * True when the caller's own RSVP equals `status`. Compared by string value
   * because the generator emits a distinct inline enum for `my_status`
   * (oneOf → RsvpSummaryMyStatusEnum) that shares values with RsvpStatusEnum.
   */
  protected isMyStatus(status: RsvpStatusEnum): boolean {
    const mine = this.rsvpSummary()?.my_status;
    return mine != null && (mine as string) === (status as string);
  }

  /** Maps an RSVP status to a PrimeNG button severity (going=success, maybe=warn, not_going=danger). */
  protected rsvpSeverity(status: RsvpStatusEnum): 'success' | 'warn' | 'danger' {
    switch (status) {
      case RsvpStatusEnum.Going:
        return 'success';
      case RsvpStatusEnum.Maybe:
        return 'warn';
      case RsvpStatusEnum.NotGoing:
        return 'danger';
    }
  }

  /**
   * Per-member RSVP availability map (member_id → status), derived from the
   * manager-facing `by_member` breakdown. Fed to the attendance manager so each
   * athlete's declared availability shows next to their name. Members with no
   * response are omitted.
   */
  protected readonly rsvpByMember = computed<Map<number, RsvpStatusEnum>>(() => {
    const map = new Map<number, RsvpStatusEnum>();
    for (const m of this.rsvpSummary()?.by_member ?? []) {
      if (m.status != null) {
        map.set(m.member_id, m.status as unknown as RsvpStatusEnum);
      }
    }
    return map;
  });

  /** True when nobody has responded yet (all counts zero). */
  protected readonly rsvpHasResponses = computed<boolean>(() => {
    const c = this.rsvpSummary()?.counts;
    if (!c) return false;
    return c.going > 0 || c.maybe > 0 || c.not_going > 0;
  });

  protected readonly eventTotalDistance = computed<number>(() => {
    let total = 0;
    for (const round of this.rounds()) {
      total += this.roundTotalDistance(round);
    }
    return total;
  });

  // --- Athlete-side visibility hints ------------------------------------------
  // The backend already nulls hidden values + empties hidden rounds for
  // non-manager athletes. These computeds drive subtle "hidden" hints so the
  // athlete understands *why* something is missing. Managers/coaches: never.

  /** A non-manager viewer for whom the backend may have hidden values. */
  protected readonly isRestrictedViewer = computed(() => this.team() !== null && !this.canManage());

  /** True when distance is hidden from this athlete (mode after/never AND no value). */
  protected readonly distanceHidden = computed(() => {
    const e = this.event();
    if (!e || !this.isRestrictedViewer()) return false;
    const mode = e.vis_distance ?? VisibilityMode.Always;
    if (mode === VisibilityMode.Always) return false;
    return this.eventTotalDistance() === 0 && !e.total;
  });

  /** True when the goal is hidden from this athlete (mode after/never AND no value). */
  protected readonly goalHidden = computed(() => {
    const e = this.event();
    if (!e || !this.isRestrictedViewer()) return false;
    const mode = e.vis_goal ?? VisibilityMode.Always;
    if (mode === VisibilityMode.Always) return false;
    return !e.goal;
  });

  /** True when the rounds detail is hidden from this athlete (mode after/never AND empty). */
  protected readonly roundsHidden = computed(() => {
    const e = this.event();
    if (!e || !this.isRestrictedViewer()) return false;
    const mode = e.vis_rounds ?? VisibilityMode.Always;
    if (mode === VisibilityMode.Always) return false;
    if (this.loadingRounds()) return false;
    return this.rounds().length === 0;
  });

  /** i18n key suffix for a "never" vs "after" hidden hint. */
  protected hiddenVariant(mode: VisibilityMode | undefined): 'never' | 'after' {
    return mode === VisibilityMode.Never ? 'never' : 'after';
  }

  protected readonly distanceHiddenVariant = computed(() =>
    this.hiddenVariant(this.event()?.vis_distance),
  );
  protected readonly goalHiddenVariant = computed(() => this.hiddenVariant(this.event()?.vis_goal));
  protected readonly roundsHiddenVariant = computed(() =>
    this.hiddenVariant(this.event()?.vis_rounds),
  );

  protected exerciseDistance(ex: Exercise): number {
    const rep = ex.repetition ?? 1;
    const dist = ex.distance ?? 0;
    return rep * dist;
  }

  protected roundDistancePerIteration(round: Round): number {
    const exercises = this.exercisesByRound().get(round.id) ?? [];
    return exercises.reduce((sum, ex) => sum + this.exerciseDistance(ex), 0);
  }

  protected roundTotalDistance(round: Round): number {
    return (round.count ?? 1) * this.roundDistancePerIteration(round);
  }

  protected hasNonZeroTime(value: string | null | undefined): boolean {
    if (!value) return false;
    return /[1-9]/.test(value);
  }

  protected formatDistance(meters: number): string {
    if (meters >= 1000) {
      const km = meters / 1000;
      return `${km % 1 === 0 ? km.toFixed(0) : km.toFixed(1)} km`;
    }
    return `${meters} m`;
  }

  private patchingTotal = false;

  private optionsSportId: number | null = null;

  constructor() {
    // Load modality + energy-segment option lists once the team's sport is known,
    // so inline edit/add rows have their selects ready without a per-row fetch.
    effect(() => {
      const sportId = this.team()?.sport?.id ?? null;
      if (sportId == null) return;
      if (this.optionsSportId === sportId) return;
      this.optionsSportId = sportId;
      untracked(() => void this.loadOptions(sportId));
    });

    // Load the ROTI summary once the team (hence roti_enabled) is resolved.
    effect(() => {
      this.team();
      this.eventId();
      untracked(() => this.maybeLoadRoti());
    });

    // Load the RSVP summary once the team (hence rsvp_enabled) is resolved.
    effect(() => {
      this.team();
      this.eventId();
      untracked(() => this.maybeLoadRsvp());
    });

    effect(() => {
      const event = this.event();
      if (!event) return;
      if (this.loadingRounds()) return;
      if (this.roundsLoadError() !== null) return;
      if ((event.rounds?.length ?? 0) > 0 && this.rounds().length === 0) return;
      const computed = this.eventTotalDistance();
      const stored = event.total ?? 0;
      if (computed === stored) return;
      if (this.patchingTotal) return;
      this.patchingTotal = true;
      untracked(() => this.patchEventTotal(event.id, computed));
    });
  }

  private rotiLoadedForEventId: number | null = null;

  /** Load the ROTI summary once the team is known and ROTI is enabled. */
  private maybeLoadRoti(): void {
    const eventId = this.eventId();
    if (eventId == null || !this.rotiEnabled()) {
      this.rotiSummary.set(null);
      this.rotiLoadedForEventId = null;
      return;
    }
    if (this.rotiLoadedForEventId === eventId) return;
    this.rotiLoadedForEventId = eventId;
    this.loadRoti(eventId);
  }

  private loadRoti(eventId: number): void {
    this.eventsService
      .eventsRotiRetrieve(eventId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        // The endpoint is typed as an array by the schema; the payload is a
        // single summary object. Accept either shape defensively.
        next: (res) => this.rotiSummary.set(this.normalizeRoti(res)),
        error: () => this.rotiSummary.set(null),
      });
  }

  private normalizeRoti(res: RotiSummary | RotiSummary[] | null): RotiSummary | null {
    if (Array.isArray(res)) return res.length > 0 ? res[0] : null;
    return res ?? null;
  }

  protected submitRoti(score: number): void {
    const eventId = this.eventId();
    if (eventId == null || this.rotiSubmitting()) return;
    this.rotiSubmitting.set(true);
    this.eventsService
      .eventsRotiUpdate(eventId, { score })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.rotiSummary.set(this.normalizeRoti(res));
          this.rotiSubmitting.set(false);
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate('events.roti.saved'),
          });
        },
        error: () => {
          this.rotiSubmitting.set(false);
          this.messageService.add({
            severity: 'error',
            summary: this.transloco.translate('common.error'),
            detail: this.transloco.translate('events.errors.unknown'),
          });
        },
      });
  }

  private rsvpLoadedForEventId: number | null = null;

  /** Load the RSVP summary once the team is known and RSVP is enabled. */
  private maybeLoadRsvp(): void {
    const eventId = this.eventId();
    if (eventId == null || !this.rsvpEnabled()) {
      this.rsvpSummary.set(null);
      this.rsvpLoadedForEventId = null;
      return;
    }
    if (this.rsvpLoadedForEventId === eventId) return;
    this.rsvpLoadedForEventId = eventId;
    this.loadRsvp(eventId);
  }

  private loadRsvp(eventId: number): void {
    this.eventsService
      .eventsRsvpRetrieve(eventId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => this.rsvpSummary.set(res),
        error: () => this.rsvpSummary.set(null),
      });
  }

  protected submitRsvp(status: RsvpStatusEnum): void {
    const eventId = this.eventId();
    if (eventId == null || this.rsvpSubmitting()) return;
    this.rsvpSubmitting.set(true);
    this.eventsService
      .eventsRsvpUpdate(eventId, { status })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.rsvpSummary.set(res);
          this.rsvpSubmitting.set(false);
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate('events.rsvp.saved'),
          });
        },
        error: () => {
          this.rsvpSubmitting.set(false);
          this.messageService.add({
            severity: 'error',
            summary: this.transloco.translate('common.error'),
            detail: this.transloco.translate('events.errors.unknown'),
          });
        },
      });
  }

  protected confirmApplyRsvpToAttendance(): void {
    const eventId = this.eventId();
    if (eventId == null || this.rsvpApplying()) return;
    this.confirmationService.confirm({
      header: this.transloco.translate('events.rsvp.apply_to_attendance'),
      message: this.transloco.translate('events.rsvp.apply_confirm'),
      acceptLabel: this.transloco.translate('common.confirm'),
      rejectLabel: this.transloco.translate('common.cancel'),
      accept: () => this.applyRsvpToAttendance(eventId),
    });
  }

  private applyRsvpToAttendance(eventId: number): void {
    this.rsvpApplying.set(true);
    this.eventsService
      .eventsRsvpApplyToAttendance(eventId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.rsvpApplying.set(false);
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate('events.rsvp.applied', { count: res.applied }),
          });
          // Refresh the attendance manager if it's the active tab (or whenever loaded).
          this.reloadEvent();
        },
        error: () => {
          this.rsvpApplying.set(false);
          this.messageService.add({
            severity: 'error',
            summary: this.transloco.translate('common.error'),
            detail: this.transloco.translate('events.errors.unknown'),
          });
        },
      });
  }

  private patchEventTotal(eventId: number, total: number): void {
    this.eventsService
      .eventsPartialUpdate(eventId, { total })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.event.update((e) => (e ? { ...e, total: updated.total ?? total } : e));
          this.patchingTotal = false;
        },
        error: () => {
          this.patchingTotal = false;
        },
      });
  }

  ngOnInit(): void {
    // Subscribe to paramMap (not snapshot): navigating between two event
    // detail routes reuses this component instance — e.g. after duplicating
    // a session we navigate to the copy's detail. A one-off snapshot read
    // would leave the previous event's data on screen.
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const idParam = params.get('id');
      const id = idParam ? Number(idParam) : NaN;
      if (!Number.isFinite(id)) {
        this.notFound.set(true);
        return;
      }
      this.notFound.set(false);
      this.event.set(null);
      this.eventId.set(id);
      this.loadEvent(id);
    });
  }

  private loadEvent(id: number): void {
    this.loading.set(true);
    this.eventsService
      .eventsRetrieve(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (e) => {
          this.event.set(e);
          this.loading.set(false);
          if (e.refer_program?.id != null) {
            this.loadProgramTeam(e.refer_program.id);
          }
          // Fire-and-forget: loadRoundsAndExercises has its own try/catch + finally
          // so errors are surfaced via roundsLoadError signal, not thrown.
          void this.loadRoundsAndExercises(e.rounds ?? []);
        },
        error: () => {
          this.notFound.set(true);
          this.loading.set(false);
        },
      });
  }

  private async loadRoundsAndExercises(roundIds: readonly number[]): Promise<void> {
    this.roundsLoadError.set(null);
    if (roundIds.length === 0) {
      this.rounds.set([]);
      this.exercisesByRound.set(new Map());
      return;
    }
    this.loadingRounds.set(true);
    try {
      const roundResults = await Promise.allSettled(
        roundIds.map((rid) => firstValueFrom(this.roundsService.roundsRetrieve(rid))),
      );
      const fetchedRounds: Round[] = [];
      let roundFailures = 0;
      for (const r of roundResults) {
        if (r.status === 'fulfilled') {
          fetchedRounds.push(r.value);
        } else {
          roundFailures++;
          console.warn('roundsRetrieve failed', r.reason);
        }
      }
      if (roundFailures > 0) {
        this.roundsLoadError.set({
          kind: fetchedRounds.length === 0 ? 'full' : 'partial',
          count: roundFailures,
        });
      }

      const sortedRounds = [...fetchedRounds].sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0),
      );
      this.rounds.set(sortedRounds);

      const exerciseFetches = sortedRounds.map(async (round) => {
        const ids = round.exercises ?? [];
        const settled = await Promise.allSettled(
          ids.map((eid) => firstValueFrom(this.exercisesService.exercisesRetrieve(eid))),
        );
        const fulfilled: Exercise[] = [];
        for (const s of settled) {
          if (s.status === 'fulfilled') {
            fulfilled.push(s.value);
          } else {
            console.warn('exercisesRetrieve failed', s.reason);
          }
        }
        const sorted = [...fulfilled].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        return [round.id, sorted] as const;
      });
      const entries = await Promise.all(exerciseFetches);
      const map = new Map<number, Exercise[]>();
      for (const [rid, list] of entries) {
        map.set(rid, list);
      }
      this.exercisesByRound.set(map);
    } catch (err) {
      console.error('Unexpected error in loadRoundsAndExercises', err);
      this.roundsLoadError.set({ kind: 'full', count: roundIds.length });
    } finally {
      this.loadingRounds.set(false);
    }
  }

  private loadProgramTeam(programId: number): void {
    this.programsService
      .programsRetrieve(programId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (p) => {
          if (p.team?.id != null) {
            this.teamsService
              .teamsRetrieve(p.team.id)
              .pipe(takeUntilDestroyed(this.destroyRef))
              .subscribe({
                next: (t) => this.team.set(t),
              });
          }
        },
      });
  }

  protected confirmRegenerate(): void {
    if (!this.event()) return;
    this.showRegenerateDialog.set(true);
  }

  protected onRegenerateConfirmed(additionalPrompt: string): void {
    const event = this.event();
    if (!event) return;
    const hasRounds = (event.rounds?.length ?? 0) > 0;
    if (hasRounds) {
      this.deleteRoundsAndRegenerate(event, additionalPrompt);
    } else {
      this.regenerate(event, additionalPrompt);
    }
  }

  private async deleteRoundsAndRegenerate(event: Event, additionalPrompt: string): Promise<void> {
    this.regenerating.set(true);
    this.errorMessage.set(null);
    this.lastResult.set(null);
    try {
      const ids = event.rounds ?? [];
      for (const roundId of ids) {
        await firstValueFrom(this.roundsService.roundsDestroy(roundId));
      }
      await this.regenerateAsync(event.id, additionalPrompt);
    } catch (err) {
      this.applyError(err as HttpErrorResponse);
    } finally {
      this.regenerating.set(false);
      this.showRegenerateDialog.set(false);
    }
  }

  private regenerate(event: Event, additionalPrompt: string): void {
    this.regenerating.set(true);
    this.errorMessage.set(null);
    this.lastResult.set(null);
    this.eventsService
      .eventsGenerateTrainingCreate(event.id, { additional_prompt: additionalPrompt })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.lastResult.set(res);
          this.regenerating.set(false);
          this.showRegenerateDialog.set(false);
          this.notifyRegenerated();
          this.loadEvent(event.id);
        },
        error: (err: HttpErrorResponse) => {
          this.applyError(err);
          this.regenerating.set(false);
        },
      });
  }

  private async regenerateAsync(eventId: number, additionalPrompt: string): Promise<void> {
    const res = await firstValueFrom(
      this.eventsService.eventsGenerateTrainingCreate(eventId, {
        additional_prompt: additionalPrompt,
      }),
    );
    this.lastResult.set(res);
    this.notifyRegenerated();
    this.loadEvent(eventId);
  }

  private notifyRegenerated(): void {
    this.messageService.add({
      severity: 'success',
      summary: this.transloco.translate('common.success'),
      detail: this.transloco.translate('events.regenerate.success_title'),
    });
  }

  protected openDuplicate(): void {
    if (!this.event()) return;
    this.showDuplicateDialog.set(true);
  }

  protected onDuplicateConfirmed(payload: DuplicateEventSubmit): void {
    const eventId = this.eventId();
    if (eventId == null || this.duplicating()) return;
    this.duplicating.set(true);
    this.eventsService
      .eventsDuplicateCreate(eventId, {
        date: payload.date,
        repeat_weekly: payload.repeat_weekly,
        occurrences: payload.occurrences,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.duplicating.set(false);
          this.showDuplicateDialog.set(false);
          const created = res.created ?? [];
          const count = created.length;
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail:
              count > 1
                ? this.transloco.translate('events.duplicate.success_plural', { count })
                : this.transloco.translate('events.duplicate.success_single'),
          });
          if (count > 0) {
            this.router.navigate(['/events', created[0].id]);
          }
        },
        error: (err: HttpErrorResponse) => {
          this.duplicating.set(false);
          this.notifyMutationError(err);
        },
      });
  }

  protected openShare(): void {
    if (!this.event()) return;
    this.showShareDialog.set(true);
  }

  /** Toggle the session's public share state via the share endpoint. */
  protected onShareToggled(isPublic: boolean): void {
    const eventId = this.eventId();
    if (eventId == null || this.sharing()) return;
    this.sharing.set(true);
    this.eventsService
      .eventsShareCreate(eventId, { is_public: isPublic })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res: EventShareResponse) => {
          this.sharing.set(false);
          this.event.update((e) =>
            e ? { ...e, is_public: res.is_public, public_token: res.public_token ?? null } : e,
          );
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate(
              res.is_public ? 'public_share.event.enabled' : 'public_share.event.disabled',
            ),
          });
        },
        error: (err: HttpErrorResponse) => {
          this.sharing.set(false);
          const code = (err?.error as { code?: string } | null | undefined)?.code;
          if (err?.status === 409 && code === 'public_sharing_disabled') {
            this.messageService.add({
              severity: 'warn',
              summary: this.transloco.translate('common.error'),
              detail: this.transloco.translate('public_share.event.sharing_disabled'),
            });
          } else {
            this.notifyMutationError(err);
          }
        },
      });
  }

  protected confirmDelete(): void {
    const event = this.event();
    if (!event) return;
    this.confirmationService.confirm({
      header: this.transloco.translate('events.actions.delete_confirm_title'),
      message: this.transloco.translate('events.actions.delete_confirm_message', {
        name: event.name,
      }),
      acceptLabel: this.transloco.translate('events.actions.delete'),
      rejectLabel: this.transloco.translate('common.cancel'),
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.deleteEvent(event),
    });
  }

  private deleteEvent(event: Event): void {
    const programId = event.refer_program?.id ?? null;
    this.deleting.set(true);
    this.eventsService
      .eventsDestroy(event.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.deleting.set(false);
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate('events.actions.deleted'),
          });
          if (programId !== null) {
            this.router.navigate(['/programs', programId]);
          } else {
            this.router.navigate(['/events']);
          }
        },
        error: () => {
          this.deleting.set(false);
          this.messageService.add({
            severity: 'error',
            summary: this.transloco.translate('common.error'),
            detail: this.transloco.translate('events.errors.unknown'),
          });
        },
      });
  }

  private applyError(err: HttpErrorResponse): void {
    // The backend refuses to regenerate a past-dated session with HTTP 409
    // { code: 'event_in_past' }. Surface a clear toast rather than the generic
    // inline AI error message.
    const code = (err?.error as { code?: string } | null | undefined)?.code;
    if (err?.status === 409 && code === 'event_in_past') {
      this.messageService.add({
        severity: 'warn',
        summary: this.transloco.translate('common.error'),
        detail: this.transloco.translate('events.detail.regenerate_past_blocked'),
      });
      return;
    }
    const info = this.aiErrorMapping.map(err);
    if (info.retryAfterSeconds != null) {
      this.errorMessage.set(
        this.transloco.translate(info.i18nKey, {
          minutes: Math.ceil(info.retryAfterSeconds / 60),
        }),
      );
    } else {
      this.errorMessage.set(this.transloco.translate(info.i18nKey));
    }
  }

  protected openCreateRound(): void {
    this.editingRound.set(null);
    this.roundDialogMode.set('create');
    this.showRoundDialog.set(true);
  }

  protected openEditRound(r: Round): void {
    this.editingRound.set(r);
    this.roundDialogMode.set('edit');
    this.showRoundDialog.set(true);
  }

  protected onRoundDialogClosed(round: Round | null): void {
    this.showRoundDialog.set(false);
    this.editingRound.set(null);
    if (round) {
      this.messageService.add({
        severity: 'success',
        summary: this.transloco.translate('common.success'),
        detail: this.transloco.translate(
          this.roundDialogMode() === 'create'
            ? 'events.round_form.created'
            : 'events.round_form.updated',
        ),
      });
      this.reloadEvent();
    }
  }

  protected moveRound(r: Round, direction: 'up' | 'down'): void {
    if (this.reordering()) return;
    const eventId = this.eventId();
    if (eventId === null) return;

    const list = this.rounds();
    const idx = list.findIndex((x) => x.id === r.id);
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || targetIdx < 0 || targetIdx >= list.length) return;

    const reordered = [...list];
    [reordered[idx], reordered[targetIdx]] = [reordered[targetIdx], reordered[idx]];
    const renumbered = reordered.map((round, i) => ({ ...round, order: i + 1 }));
    this.rounds.set(renumbered);

    this.reordering.set(true);
    firstValueFrom(
      this.eventsService.eventsRoundsReorderCreate(eventId, {
        round_ids: renumbered.map((x) => x.id),
      }),
    )
      .catch((err: HttpErrorResponse) => {
        this.rounds.set(list);
        this.notifyReorderError(err);
      })
      .finally(() => this.reordering.set(false));
  }

  protected onExerciseDrop(round: Round, event: CdkDragDrop<Exercise[]>): void {
    if (this.reordering()) return;
    if (event.previousIndex === event.currentIndex) return;

    const original = this.exercisesByRound().get(round.id) ?? [];
    const reordered = [...original];
    moveItemInArray(reordered, event.previousIndex, event.currentIndex);
    const renumbered = reordered.map((ex, i) => ({ ...ex, order: i + 1 }));

    const map = new Map(this.exercisesByRound());
    map.set(round.id, renumbered);
    this.exercisesByRound.set(map);

    this.reordering.set(true);
    firstValueFrom(
      this.roundsService.roundsExercisesReorderCreate(round.id, {
        exercise_ids: renumbered.map((ex) => ex.id),
      }),
    )
      .catch((err: HttpErrorResponse) => {
        const rollback = new Map(this.exercisesByRound());
        rollback.set(round.id, original);
        this.exercisesByRound.set(rollback);
        this.notifyReorderError(err);
      })
      .finally(() => this.reordering.set(false));
  }

  private notifyReorderError(err: HttpErrorResponse): void {
    const body = err?.error as { code?: string; detail?: string } | null | undefined;
    const REORDER_CODES = new Set([
      'empty_list',
      'duplicate_id',
      'scope_mismatch',
      'incomplete_reorder',
      'not_authorized_event',
      'not_authorized_round',
    ]);
    const i18nKey =
      body?.code && REORDER_CODES.has(body.code)
        ? `events.detail.reorder_errors.${body.code}`
        : 'events.detail.reorder_errors.unknown';
    this.messageService.add({
      severity: 'error',
      summary: this.transloco.translate('common.error'),
      detail: this.transloco.translate(i18nKey),
    });
  }

  protected confirmDeleteRound(r: Round): void {
    this.confirmationService.confirm({
      header: this.transloco.translate('events.detail.confirm_delete_round.title'),
      message: this.transloco.translate('events.detail.confirm_delete_round.message'),
      acceptLabel: this.transloco.translate('events.detail.confirm_delete_round.accept'),
      rejectLabel: this.transloco.translate('events.detail.confirm_delete_round.reject'),
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.deleteRound(r),
    });
  }

  private deleteRound(r: Round): void {
    this.roundsService
      .roundsDestroy(r.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate('events.detail.confirm_delete_round.deleted'),
          });
          this.reloadEvent();
        },
        error: (err: HttpErrorResponse) => this.notifyMutationError(err),
      });
  }

  // ---------------------------------------------------------------------------
  // Inline exercise editing
  // ---------------------------------------------------------------------------

  private async loadOptions(sportId: number): Promise<void> {
    this.loadingOptions.set(true);
    try {
      const [modList, segList] = await Promise.all([
        firstValueFrom(this.sportsService.sportsModalitiesList(sportId)),
        firstValueFrom(this.energySegmentsService.energySegmentsList()),
      ]);
      this.modalities.set((modList.results ?? []).filter((m) => m.is_active));
      this.energySegments.set((segList.results ?? []).filter((s) => s.is_active));
    } catch {
      this.modalities.set([]);
      this.energySegments.set([]);
    } finally {
      this.loadingOptions.set(false);
    }
  }

  protected hasOptions(): boolean {
    return this.modalities().length > 0 && this.energySegments().length > 0;
  }

  /** Option label for an energy segment: "abv — description" when present, else "abv". */
  protected segmentLabel(seg: EnergySegment): string {
    return seg.description ? `${seg.abv} — ${seg.description}` : seg.abv;
  }

  private buildRowForm(ex: Exercise | null, prefill?: Partial<Exercise>): ExerciseRowForm {
    const src = ex ?? prefill ?? {};
    return this.fb.nonNullable.group({
      modality_id: this.fb.nonNullable.control<number | null>(
        src.modality_id ?? src.modality?.id ?? null,
        [Validators.required],
      ),
      energysegment_id: this.fb.nonNullable.control<number | null>(
        src.energysegment_id ?? src.energysegment?.id ?? null,
        [Validators.required],
      ),
      repetition: this.fb.nonNullable.control<number>(src.repetition ?? 1, [
        Validators.required,
        Validators.min(1),
      ]),
      distance: this.fb.nonNullable.control<number>(src.distance ?? 50, [
        Validators.required,
        Validators.min(0),
      ]),
      t_start: this.fb.nonNullable.control<string>(src.t_start ?? '', [timeMmSsValidator]),
      t_break: this.fb.nonNullable.control<string>(src.t_break ?? '', [timeMmSsValidator]),
      notes: this.fb.nonNullable.control<string>(src.notes ?? ''),
    });
  }

  protected rowKeyForExercise(ex: Exercise): string {
    return `ex-${ex.id}`;
  }

  protected formFor(key: string): ExerciseRowForm | null {
    return this.rowForms.get(key) ?? null;
  }

  protected isEditingExercise(ex: Exercise): boolean {
    return this.editingExerciseId() === ex.id;
  }

  protected isSaving(key: string): boolean {
    return this.savingRows().has(key);
  }

  protected rowFieldError(key: string, name: string): string | null {
    return this.rowFieldErrors().get(key)?.[name]?.join(', ') ?? null;
  }

  protected newRowsFor(roundId: number): NewExerciseRow[] {
    return this.newRows().filter((r) => r.roundId === roundId);
  }

  /** Start editing an existing exercise inline. */
  protected startEditExercise(ex: Exercise): void {
    if (!this.canManage()) return;
    const key = this.rowKeyForExercise(ex);
    this.rowForms.set(key, this.buildRowForm(ex));
    this.clearRowError(key);
    this.editingExerciseId.set(ex.id);
  }

  /** Append a new inline row to a round, pre-filled from its last exercise. */
  protected startAddExercise(roundId: number): void {
    if (!this.canManage()) return;
    const existing = this.exercisesByRound().get(roundId) ?? [];
    const last = existing.length > 0 ? existing[existing.length - 1] : null;
    const prefill: Partial<Exercise> | undefined = last
      ? {
          modality_id: last.modality_id ?? last.modality?.id ?? null,
          energysegment_id: last.energysegment_id ?? last.energysegment?.id ?? null,
          distance: last.distance,
          t_start: last.t_start,
          t_break: last.t_break,
          repetition: 1,
          notes: '',
        }
      : undefined;
    const key = `new-${this.newRowSeq++}`;
    this.rowForms.set(key, this.buildRowForm(null, prefill));
    this.clearRowError(key);
    this.newRows.update((rows) => [...rows, { key, roundId }]);
  }

  /** Cancel an existing-exercise edit: revert to display. */
  protected cancelEditExercise(ex: Exercise): void {
    const key = this.rowKeyForExercise(ex);
    this.rowForms.delete(key);
    this.clearRowError(key);
    this.editingExerciseId.set(null);
  }

  /** Cancel a freshly-added row: remove it entirely. */
  protected cancelNewRow(key: string): void {
    this.rowForms.delete(key);
    this.clearRowError(key);
    this.newRows.update((rows) => rows.filter((r) => r.key !== key));
  }

  /** Persist an existing-exercise edit via PATCH. */
  protected saveEditExercise(ex: Exercise): void {
    const key = this.rowKeyForExercise(ex);
    const form = this.rowForms.get(key);
    if (!form || form.invalid || this.isSaving(key) || !this.hasOptions()) return;
    this.setSaving(key, true);
    this.clearRowError(key);

    const value = form.getRawValue();
    this.exercisesService
      .exercisesPartialUpdate(ex.id, {
        modality_id: value.modality_id,
        energysegment_id: value.energysegment_id,
        repetition: value.repetition,
        distance: value.distance,
        t_start: value.t_start || null,
        t_break: value.t_break || null,
        notes: value.notes ?? '',
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.setSaving(key, false);
          this.rowForms.delete(key);
          this.editingExerciseId.set(null);
          this.replaceExerciseInRound(updated);
          this.notifyExerciseSaved('events.exercise_form.updated');
        },
        error: (err: HttpErrorResponse) => {
          this.setSaving(key, false);
          this.applyRowError(key, err);
        },
      });
  }

  /** Persist a freshly-added row via POST (linked to its round via round_id). */
  protected saveNewRow(row: NewExerciseRow): void {
    const key = row.key;
    const form = this.rowForms.get(key);
    if (!form || form.invalid || this.isSaving(key) || !this.hasOptions()) return;
    this.setSaving(key, true);
    this.clearRowError(key);

    const value = form.getRawValue();
    const payload = {
      round_id: row.roundId,
      modality_id: value.modality_id,
      energysegment_id: value.energysegment_id,
      repetition: value.repetition,
      distance: value.distance,
      t_start: value.t_start || null,
      t_break: value.t_break || null,
      notes: value.notes ?? '',
      language: (this.team()?.language ?? 'fr') as LanguageEnum,
    };
    this.exercisesService
      .exercisesCreate(payload as unknown as Exercise)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this.setSaving(key, false);
          this.rowForms.delete(key);
          this.newRows.update((rows) => rows.filter((r) => r.key !== key));
          this.appendExerciseToRound(row.roundId, created);
          this.notifyExerciseSaved('events.exercise_form.created');
        },
        error: (err: HttpErrorResponse) => {
          this.setSaving(key, false);
          this.applyRowError(key, err);
        },
      });
  }

  private appendExerciseToRound(roundId: number, ex: Exercise): void {
    const map = new Map(this.exercisesByRound());
    const list = [...(map.get(roundId) ?? []), ex];
    map.set(roundId, list);
    this.exercisesByRound.set(map);
  }

  private replaceExerciseInRound(ex: Exercise): void {
    const map = new Map(this.exercisesByRound());
    for (const [rid, list] of map) {
      const idx = list.findIndex((e) => e.id === ex.id);
      if (idx >= 0) {
        const next = [...list];
        next[idx] = ex;
        map.set(rid, next);
        break;
      }
    }
    this.exercisesByRound.set(map);
  }

  private notifyExerciseSaved(detailKey: string): void {
    this.messageService.add({
      severity: 'success',
      summary: this.transloco.translate('common.success'),
      detail: this.transloco.translate(detailKey),
    });
  }

  private setSaving(key: string, on: boolean): void {
    this.savingRows.update((set) => {
      const next = new Set(set);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  private clearRowError(key: string): void {
    this.rowFieldErrors.update((map) => {
      if (!map.has(key)) return map;
      const next = new Map(map);
      next.delete(key);
      return next;
    });
  }

  private applyRowError(key: string, err: HttpErrorResponse): void {
    const code = (err?.error as { code?: string } | null | undefined)?.code;
    if (code === 'not_authorized_round') {
      this.notifyGlobalError('events.exercise_form.errors.not_authorized_round');
      return;
    }
    const { fields, detail } = extractServerError(err);
    if (fields) {
      this.rowFieldErrors.update((map) => {
        const next = new Map(map);
        next.set(key, fields);
        return next;
      });
    } else {
      this.notifyGlobalError(detail ?? 'events.errors.unknown');
    }
  }

  private notifyGlobalError(detailKey: string): void {
    this.messageService.add({
      severity: 'error',
      summary: this.transloco.translate('common.error'),
      detail: this.transloco.translate(detailKey),
    });
  }

  protected confirmDeleteExercise(ex: Exercise): void {
    this.confirmationService.confirm({
      header: this.transloco.translate('events.detail.confirm_delete_exercise.title'),
      message: this.transloco.translate('events.detail.confirm_delete_exercise.message'),
      acceptLabel: this.transloco.translate('events.detail.confirm_delete_exercise.accept'),
      rejectLabel: this.transloco.translate('events.detail.confirm_delete_exercise.reject'),
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.deleteExercise(ex),
    });
  }

  private deleteExercise(ex: Exercise): void {
    this.exercisesService
      .exercisesDestroy(ex.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate('events.detail.confirm_delete_exercise.deleted'),
          });
          this.reloadEvent();
        },
        error: (err: HttpErrorResponse) => this.notifyMutationError(err),
      });
  }

  private reloadEvent(): void {
    const id = this.eventId();
    if (id != null) this.loadEvent(id);
  }

  private notifyMutationError(err: HttpErrorResponse): void {
    const detailKey =
      err?.status === 403 ? 'events.errors.forbidden' : 'events.errors.unknown';
    this.messageService.add({
      severity: 'error',
      summary: this.transloco.translate('common.error'),
      detail: this.transloco.translate(detailKey),
    });
  }
}
