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
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Button, ButtonDirective } from 'primeng/button';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Message } from 'primeng/message';
import { ProgressSpinner } from 'primeng/progressspinner';
import { Select } from 'primeng/select';
import { Skeleton } from 'primeng/skeleton';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { Tooltip } from 'primeng/tooltip';
import { catchError, firstValueFrom, of, switchMap } from 'rxjs';
import { EventsService } from '../../../api/api/events.service';
import { RoundsService } from '../../../api/api/rounds.service';
import { TeamsService } from '../../../api/api/teams.service';
import { Event } from '../../../api/model/event';
import { GenerateTrainingResponse } from '../../../api/model/generate-training-response';
import { RsvpSummary } from '../../../api/model/rsvp-summary';
import { RsvpStatusEnum } from '../../../api/model/rsvp-status-enum';
import { Team } from '../../../api/model/team';
import { TrainingTypeEnum } from '../../../api/model/training-type-enum';
import { VisibilityMode } from '../../../api/model/visibility-mode';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../core/notifications/toast.service';
import { AiErrorMappingService } from '../../ai/ai-error-mapping.service';
import { TeamRole, computeTeamRole } from '../../teams/teams-list/teams-list.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { AttachmentListComponent } from '../../../shared/ui/attachment-list/attachment-list.component';
import { AttendanceManagerComponent } from '../attendance-manager/attendance-manager.component';
import { EventAthleteBriefComponent } from '../event-athlete-brief/event-athlete-brief.component';
import { SaveAsTemplateButtonComponent } from '../save-as-template-button/save-as-template-button.component';
import { EventDebriefComponent } from '../event-debrief/event-debrief.component';
import { EventRotiComponent } from '../event-roti/event-roti.component';
import { EventRsvpComponent } from '../event-rsvp/event-rsvp.component';
import { EventTrainingComponent } from '../event-training/event-training.component';
import { EventFreeformComponent } from '../event-freeform/event-freeform.component';
import { RegenerateTrainingDialogComponent } from '../regenerate-training-dialog/regenerate-training-dialog.component';
import {
  DuplicateEventDialogComponent,
  type DuplicateEventSubmit,
} from '../duplicate-event-dialog/duplicate-event-dialog.component';
import { ShareEventDialogComponent } from '../share-event-dialog/share-event-dialog.component';
import { EventShareResponse } from '../../../api/model/event-share-response';
import { LocalizedDatePipe } from '../../../shared/datetime/localized-date.pipe';
@Component({
  selector: 'app-events-detail',
  imports: [
    LocalizedDatePipe,
    ReactiveFormsModule,
    FormsModule,
    RouterLink,
    Button,
    ButtonDirective,
    ConfirmDialog,
    Message,
    ProgressSpinner,
    Select,
    Skeleton,
    Tab,
    TabList,
    TabPanel,
    TabPanels,
    Tabs,
    Tooltip,
    TranslocoPipe,
    PageHeaderComponent,
    AttachmentListComponent,
    AttendanceManagerComponent,
    EventRotiComponent,
    EventDebriefComponent,
    EventAthleteBriefComponent,
    SaveAsTemplateButtonComponent,
    EventRsvpComponent,
    EventTrainingComponent,
    EventFreeformComponent,
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
  private readonly teamsService = inject(TeamsService);
  private readonly roundsService = inject(RoundsService);
  private readonly authService = inject(AuthService);
  private readonly aiErrorMapping = inject(AiErrorMappingService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly eventId = signal<number | null>(null);
  protected readonly event = signal<Event | null>(null);
  protected readonly team = signal<Team | null>(null);
  protected readonly loading = signal(false);
  protected readonly notFound = signal(false);
  /** Set when the event fetch fails with a non-404 status (server/network);
   *  surfaced as an inline error block with a retry, distinct from notFound. */
  protected readonly loadError = signal(false);
  protected readonly regenerating = signal(false);
  protected readonly deleting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly lastResult = signal<GenerateTrainingResponse | null>(null);

  protected readonly activeTab = signal<string>('training');

  /** Aggregate state emitted by the training editor (app-event-training): the
   *  computed total distance + whether its rounds are still loading. Null until
   *  the child first emits — eventTotalDistance then falls back to event.total
   *  so the header + the auto-patch don't read 0 mid-load. */
  protected readonly trainingState = signal<{ totalDistance: number; loading: boolean } | null>(
    null,
  );

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

  // --- Training type selector (structured ↔ freeform) ---
  /** The training-type select control, kept in sync with the loaded event. A
   *  reactive FormControl (not one-way ngModel) so a rejected confirm can write
   *  the original value straight back into the widget — even when it equals the
   *  control's current value, which a signal `.set()` of the same value would
   *  not flush to PrimeNG's internal state. */
  protected readonly trainingTypeControl = new FormControl<TrainingTypeEnum>(
    TrainingTypeEnum.Structured,
    { nonNullable: true },
  );

  /** Select options, re-translated on language change. */
  protected readonly trainingTypeOptions = computed(() => {
    this.transloco.getActiveLang();
    return [
      {
        label: this.transloco.translate('events.training.type_structured'),
        value: TrainingTypeEnum.Structured,
      },
      {
        label: this.transloco.translate('events.training.type_freeform'),
        value: TrainingTypeEnum.Freeform,
      },
    ];
  });

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

  /**
   * A structured session cannot be generated without a target volume — the AI
   * has nothing to size it against (issue #9). The backend refuses with HTTP 409
   * `event_without_volume`; we disable the action and explain why up-front.
   * Freeform sessions need no volume, so this never blocks them.
   */
  protected readonly missingTargetVolume = computed(() => {
    const e = this.event();
    if (!e) return false;
    const isStructured =
      (e.training_type ?? TrainingTypeEnum.Structured) === TrainingTypeEnum.Structured;
    return isStructured && !e.total_target;
  });

  /** Local calendar date as a yyyy-mm-dd string (not UTC). */
  private todayLocalIso(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = `${now.getMonth() + 1}`.padStart(2, '0');
    const d = `${now.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // --- ROTI (difficulty) — the tab itself is app-event-roti (self-contained) ---
  protected readonly rotiEnabled = computed(() => this.team()?.roti_enabled === true);
  /** Athlete = a team member who is neither owner nor manager. */
  protected readonly isAthlete = computed(() => this.currentUserRole() === 'member');

  // --- RSVP (availability) — the tab UI is app-event-rsvp (presentational); the
  //     summary fetch stays here because the attendance tab consumes rsvpByMember
  //     regardless of whether the RSVP tab was opened. ---
  protected readonly rsvpEnabled = computed(() => this.team()?.rsvp_enabled === true);
  protected readonly rsvpSummary = signal<RsvpSummary | null>(null);

  /**
   * Fetch scope for the RSVP summary: the event id once the team is known and
   * RSVP is enabled, otherwise null (no event / RSVP disabled → clear summary).
   * Folding both the id and rsvp_enabled into one signal lets the loader stream
   * (constructor) re-run when either changes and cancel a stale in-flight fetch.
   */
  private readonly rsvpScope = computed<number | null>(() => {
    const eventId = this.eventId();
    if (eventId == null || !this.rsvpEnabled()) return null;
    return eventId;
  });
  protected readonly rsvpSubmitting = signal(false);
  protected readonly rsvpApplying = signal(false);

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
        // codegen: RsvpByMemberStatusEnum (summary) and RsvpStatusEnum (write)
        // are distinct generated enums with identical values; no overlap for a
        // direct cast.
        map.set(m.member_id, m.status as unknown as RsvpStatusEnum);
      }
    }
    return map;
  });

  /** Total session distance: the training editor's computed sum once it has
   *  emitted, otherwise the stored event.total (avoids a 0 flash mid-load). */
  protected readonly eventTotalDistance = computed<number>(
    () => this.trainingState()?.totalDistance ?? this.event()?.total ?? 0,
  );

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

  /** i18n key suffix for a "never" vs "after" hidden hint. */
  protected hiddenVariant(mode: VisibilityMode | undefined): 'never' | 'after' {
    return mode === VisibilityMode.Never ? 'never' : 'after';
  }

  protected readonly distanceHiddenVariant = computed(() =>
    this.hiddenVariant(this.event()?.vis_distance),
  );
  protected readonly goalHiddenVariant = computed(() => this.hiddenVariant(this.event()?.vis_goal));

  private patchingTotal = false;

  constructor() {
    // Load the RSVP summary once the team (hence rsvp_enabled) is resolved. A
    // data stream (not a side-effecting effect): the scope folds [eventId,
    // rsvp_enabled] into a single value and switchMap cancels a stale in-flight
    // request when it changes, which also subsumes the old manual dedup guard.
    // A null scope (no event id / RSVP disabled) resets rsvpSummary to null.
    toObservable(this.rsvpScope)
      .pipe(
        switchMap((eventId) =>
          eventId == null
            ? of(null)
            : this.eventsService
                .eventsRsvpRetrieve({ eventPk: eventId })
                .pipe(catchError(() => of(null))),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((res) => this.rsvpSummary.set(res));

    // Keep the stored event.total in sync with the training editor's computed
    // distance. The editor (app-event-training) owns the rounds and emits the
    // total via (stateChange); we only patch once it has actually emitted and
    // finished loading, so we never overwrite a real total with a mid-load 0.
    effect(() => {
      const event = this.event();
      const state = this.trainingState();
      if (!event || !state || state.loading) return;
      if (state.totalDistance === (event.total ?? 0)) return;
      if (this.patchingTotal) return;
      this.patchingTotal = true;
      untracked(() => this.patchEventTotal(event.id, state.totalDistance));
    });
  }

  /** app-event-training emitted its total distance + loading state. */
  protected onTrainingState(state: { totalDistance: number; loading: boolean }): void {
    this.trainingState.set(state);
  }

  protected submitRsvp(status: RsvpStatusEnum): void {
    const eventId = this.eventId();
    if (eventId == null || this.rsvpSubmitting()) return;
    this.rsvpSubmitting.set(true);
    this.eventsService
      .eventsRsvpUpdate({ eventPk: eventId, rsvpUpsertRequest: { status } })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.rsvpSummary.set(res);
          this.rsvpSubmitting.set(false);
          this.toast.success('events.rsvp.saved');
        },
        error: () => {
          this.rsvpSubmitting.set(false);
          this.toast.error('events.errors.unknown');
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
      .eventsRsvpApplyToAttendance({ eventPk: eventId })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.rsvpApplying.set(false);
          this.toast.success('events.rsvp.applied', { count: res.applied });
          // Refresh the attendance manager if it's the active tab (or whenever loaded).
          this.reloadEvent();
        },
        error: () => {
          this.rsvpApplying.set(false);
          this.toast.error('events.errors.unknown');
        },
      });
  }

  private patchEventTotal(eventId: number, total: number): void {
    this.eventsService
      .eventsPartialUpdate({ id: eventId, patchedEventRequest: { total } })
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

  /** Tab values that can be deep-linked via the `?tab=` query param. */
  private static readonly DEEPLINKABLE_TABS = new Set([
    'training',
    'attendance',
    'difficulty',
    'rsvp',
    'attachments',
  ]);

  ngOnInit(): void {
    // Honor a deep-linked tab (e.g. dashboard "Saisir" → ?tab=attendance).
    // Read once from the snapshot: the default stays 'training' when absent.
    const tabParam = this.route.snapshot.queryParamMap.get('tab');
    if (tabParam && EventsDetailComponent.DEEPLINKABLE_TABS.has(tabParam)) {
      this.activeTab.set(tabParam);
    }

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
    this.notFound.set(false);
    this.loadError.set(false);
    // Clear any training-editor state from the previously-shown event (or from
    // before a structured->freeform switch): a stale totalDistance would make
    // the auto-patch effect overwrite the freshly loaded event.total. The
    // structured training editor re-emits its state once it re-renders.
    this.trainingState.set(null);
    this.eventsService
      .eventsRetrieve({ id })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (e) => {
          this.event.set(e);
          this.trainingTypeControl.setValue(e.training_type ?? TrainingTypeEnum.Structured, {
            emitEvent: false,
          });
          this.loading.set(false);
          if (e.team_id != null) {
            // Fetch the team directly via the event's team_id (now embedded),
            // instead of chaining programsRetrieve -> teamsRetrieve (one fewer
            // round-trip before role/permission gating resolves).
            this.loadTeam(e.team_id);
          }
          // The training editor (app-event-training) loads its own rounds from
          // the event's round id list.
        },
        error: (err: HttpErrorResponse) => {
          this.loading.set(false);
          // A genuine 404 means the session doesn't exist (or isn't visible) —
          // show the dedicated "not found" copy. Any other status (server error,
          // network failure) is a transient load error: surface it distinctly
          // with a retry + a toast rather than masquerading as "not found".
          if (err?.status === 404) {
            this.notFound.set(true);
          } else {
            this.loadError.set(true);
            this.toast.error('events.detail.load_failed');
          }
        },
      });
  }

  private loadTeam(teamId: number): void {
    this.teamsService
      .teamsRetrieve({ id: teamId })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (t) => this.team.set(t),
        error: () => {
          // The team drives role/permission gating; if it can't be resolved the
          // viewer is treated as a restricted (non-manager) viewer. Surface a
          // toast so a failed fetch isn't completely silent.
          this.toast.warn('events.detail.team_load_failed');
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
        await firstValueFrom(this.roundsService.roundsDestroy({ id: roundId }));
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
      .eventsGenerateTrainingCreate({
        id: event.id,
        generateTrainingRequestRequest: { additional_prompt: additionalPrompt },
      })
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
      this.eventsService.eventsGenerateTrainingCreate({
        id: eventId,
        generateTrainingRequestRequest: { additional_prompt: additionalPrompt },
      }),
    );
    this.lastResult.set(res);
    this.notifyRegenerated();
    this.loadEvent(eventId);
  }

  private notifyRegenerated(): void {
    this.toast.success('events.regenerate.success_title');
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
      .eventsDuplicateCreate({
        id: eventId,
        duplicateEventRequestRequest: {
          date: payload.date,
          repeat_weekly: payload.repeat_weekly,
          occurrences: payload.occurrences,
        },
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
      .eventsShareCreate({ id: eventId, eventShareRequestRequest: { is_public: isPublic } })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res: EventShareResponse) => {
          this.sharing.set(false);
          this.event.update((e) =>
            e ? { ...e, is_public: res.is_public, public_token: res.public_token ?? null } : e,
          );
          this.toast.success(
            res.is_public ? 'public_share.event.enabled' : 'public_share.event.disabled',
          );
        },
        error: (err: HttpErrorResponse) => {
          this.sharing.set(false);
          const code = (err?.error as { code?: string } | null | undefined)?.code;
          if (err?.status === 409 && code === 'public_sharing_disabled') {
            this.toast.warn('public_share.event.sharing_disabled');
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
      .eventsDestroy({ id: event.id })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.deleting.set(false);
          this.toast.success('events.actions.deleted');
          if (programId !== null) {
            this.router.navigate(['/programs', programId]);
          } else {
            this.router.navigate(['/events']);
          }
        },
        error: () => {
          this.deleting.set(false);
          this.toast.error('events.errors.unknown');
        },
      });
  }

  private applyError(err: HttpErrorResponse): void {
    // The backend refuses to regenerate a past-dated session with HTTP 409
    // { code: 'event_in_past' }. Surface a clear toast rather than the generic
    // inline AI error message.
    const code = (err?.error as { code?: string } | null | undefined)?.code;
    if (err?.status === 409 && code === 'event_in_past') {
      this.toast.warn('events.detail.regenerate_past_blocked');
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

  protected reloadEvent(): void {
    const id = this.eventId();
    if (id != null) this.loadEvent(id);
  }

  /**
   * Manager changed the training-type select. If the session already has
   * content (rounds or a non-empty freeform richtext) that switching would
   * orphan, confirm first; otherwise apply directly. A rejected confirm
   * reverts the select model to the current event type.
   */
  protected onTrainingTypeChange(next: TrainingTypeEnum): void {
    const e = this.event();
    if (!e || next === (e.training_type ?? TrainingTypeEnum.Structured)) return;
    const hasContent = (e.rounds?.length ?? 0) > 0 || (e.training_richtext?.trim().length ?? 0) > 0;
    if (hasContent) {
      this.confirmationService.confirm({
        message: this.transloco.translate('events.training.switch_confirm'),
        accept: () => this.applyTrainingType(e.id, next),
        reject: () => this.revertTrainingType(),
      });
    } else {
      this.applyTrainingType(e.id, next);
    }
  }

  private applyTrainingType(id: number, next: TrainingTypeEnum): void {
    this.eventsService
      .eventsPartialUpdate({ id, patchedEventRequest: { training_type: next } })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.reloadEvent(),
        error: (err: HttpErrorResponse) => {
          this.revertTrainingType();
          this.notifyMutationError(err);
        },
      });
  }

  /**
   * Reset the select control back to the loaded event's current type. Writing
   * through the FormControl (with emitEvent:false so we don't re-fire
   * onTrainingTypeChange) always flushes to PrimeNG's widget state, so the
   * dropdown visually reverts even when the value is unchanged.
   */
  private revertTrainingType(): void {
    this.trainingTypeControl.setValue(this.event()?.training_type ?? TrainingTypeEnum.Structured, {
      emitEvent: false,
    });
  }

  private notifyMutationError(err: HttpErrorResponse): void {
    const detailKey = err?.status === 403 ? 'events.errors.forbidden' : 'events.errors.unknown';
    this.toast.error(detailKey);
  }
}
