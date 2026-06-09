import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { ColorPicker } from 'primeng/colorpicker';
import { DatePicker } from 'primeng/datepicker';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { EventsService } from '../../../api/api/events.service';
import { ProgramsService } from '../../../api/api/programs.service';
import { TeamsService } from '../../../api/api/teams.service';
import { Event } from '../../../api/model/event';
import { PatchedEvent } from '../../../api/model/patched-event';
import { Program } from '../../../api/model/program';
import { Team } from '../../../api/model/team';
import { TeamSportRead } from '../../../api/model/team-sport-read';
import { VisibilityMode } from '../../../api/model/visibility-mode';
import { loadProgramsForTeams } from '../../programs/program-fanout';
import { type FieldErrors, extractServerError } from '../../../shared/forms/notify-error';
import { buildVisibilityOptions } from '../../../shared/forms/visibility-options';
import { FormFooterComponent } from '../../../shared/ui/form-footer/form-footer.component';
import { MetaFieldComponent } from '../../../shared/ui/meta-field/meta-field.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { PlaceSelectComponent } from '../../../shared/ui/place-select/place-select.component';
import { EquipmentSelectComponent } from '../../../shared/ui/equipment-select/equipment-select.component';
import { RichEditorComponent } from '../../../shared/ui/rich-editor/rich-editor.component';
import { AriaDescribesDirective } from '../../../shared/a11y/aria-describes.directive';

function toIsoDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toIsoTime(d: Date | null | undefined): string | null {
  if (!d) return null;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}:00`;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function parseTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = value.match(/^(\d{2}):(\d{2})/);
  if (!m) return null;
  const d = new Date();
  d.setHours(parseInt(m[1], 10), parseInt(m[2], 10), 0, 0);
  return d;
}

function timeRangeValidator(group: AbstractControl): ValidationErrors | null {
  const start = group.get('hour_start')?.value as Date | null;
  const end = group.get('hour_end')?.value as Date | null;
  if (!start || !end) return null;
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = end.getHours() * 60 + end.getMinutes();
  return endMinutes < startMinutes ? { time_range: true } : null;
}

@Component({
  selector: 'app-events-form',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    InputText,
    InputNumber,
    Select,
    RichEditorComponent,
    DatePicker,
    ColorPicker,
    Button,
    PageHeaderComponent,
    MetaFieldComponent,
    FormFooterComponent,
    PlaceSelectComponent,
    EquipmentSelectComponent,
    AriaDescribesDirective,
    TranslocoPipe,
  ],
  templateUrl: './events-form.component.html',
  styleUrl: './events-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventsFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly eventsService = inject(EventsService);
  private readonly teamsService = inject(TeamsService);
  private readonly programsService = inject(ProgramsService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly eventId = signal<number | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly availablePrograms = signal<Program[]>([]);
  protected readonly fieldErrors = signal<FieldErrors | null>(null);

  /** Team id resolved from the selected program, scoping the Place selector. */
  protected readonly selectedTeamId = signal<number | null>(null);
  /** The resolved team's sports — options for the session's sport select. */
  protected readonly teamSports = signal<TeamSportRead[]>([]);
  /** Team id the sports were last fetched for (avoids redundant retrieves). */
  private loadedSportsForTeamId: number | null = null;
  /**
   * Legacy free-text location carried by an event that has no linked place yet.
   * Shown as a hint under the Lieu selector; selecting/creating a place wins.
   */
  protected readonly legacyLocation = signal<string | null>(null);
  /**
   * Legacy free-text equipment carried by an event that has no linked equipment
   * items yet. Shown as a hint under the Matériel selector; selecting items wins.
   */
  protected readonly legacyEquipment = signal<string | null>(null);

  /** The Matériel selector instance, to surface its empty-list state as a hint. */
  private readonly equipmentSelect = viewChild(EquipmentSelectComponent);
  /**
   * True when the team has been resolved and exposes no enabled equipment, so
   * the multi-select is empty for a reason the coach can act on.
   */
  protected readonly equipmentEmpty = computed(() => this.equipmentSelect()?.empty() ?? false);

  protected readonly isEditMode = computed(() => this.eventId() !== null);

  /** Visibility-mode select options, re-translated on language change. */
  protected readonly visibilityOptions = computed(() => {
    this.transloco.getActiveLang();
    return buildVisibilityOptions(this.transloco);
  });

  /** True once the user has manually touched any vis_* control (suppresses team prefill). */
  private visTouchedByUser = false;

  protected readonly form = this.fb.nonNullable.group(
    {
      name: ['', [Validators.required, Validators.maxLength(100)]],
      refer_program_id: this.fb.nonNullable.control<number | null>(null, [Validators.required]),
      // goal & equipment now hold rich-text HTML (sanitized server-side); no
      // client length cap on the HTML payload.
      goal: [''],
      // Multi-sport: the session's sport (one of the team's sports). Optional —
      // the backend defaults it to the team's default sport when omitted.
      sport_id: this.fb.nonNullable.control<number | null>(null),
      place_id: this.fb.nonNullable.control<number | null>(null),
      equipment_item_ids: this.fb.nonNullable.control<number[]>([]),
      date: this.fb.nonNullable.control<Date | null>(null, [Validators.required]),
      hour_start: this.fb.nonNullable.control<Date | null>(null),
      hour_end: this.fb.nonNullable.control<Date | null>(null),
      total: this.fb.nonNullable.control<number>(0, [Validators.min(0)]),
      color: ['#3B82F6', [Validators.maxLength(10)]],
      vis_distance: this.fb.nonNullable.control<VisibilityMode>(VisibilityMode.Always),
      vis_goal: this.fb.nonNullable.control<VisibilityMode>(VisibilityMode.Always),
      vis_rounds: this.fb.nonNullable.control<VisibilityMode>(VisibilityMode.Always),
    },
    { validators: [timeRangeValidator] },
  );

  ngOnInit(): void {
    this.loadAvailablePrograms();

    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      const id = Number(idParam);
      if (!Number.isFinite(id)) {
        this.notifyLoadError();
        return;
      }
      this.eventId.set(id);
      this.loadEvent(id);
    } else {
      // On CREATE, resolve the chosen program's team once and use that single
      // response to (a) prefill the per-event visibility from the team defaults
      // and (b) default the session sport — instead of two parallel retrieves.
      this.form.controls.refer_program_id.valueChanges
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((pid) => this.resolveTeamForProgram(pid));

      const programParam = this.route.snapshot.queryParamMap.get('program');
      if (programParam) {
        const pid = Number(programParam);
        if (Number.isFinite(pid)) {
          this.form.patchValue({ refer_program_id: pid });
          this.form.controls.refer_program_id.disable();
          this.resolveTeamForProgram(pid);
        }
      }
    }
  }

  /** Mark the visibility controls as user-overridden so team prefill stops. */
  protected onVisChanged(): void {
    this.visTouchedByUser = true;
  }

  /**
   * Resolve the team id for a program (from the loaded program list), expose it
   * to the Place selector, and fetch the team ONCE — feeding both the session
   * sport defaulting and (on create) the visibility prefill from that single
   * response. No-op when the team can't be resolved yet (program list not
   * loaded) or when the team was already fetched.
   */
  private resolveTeamForProgram(programId: number | null | undefined): void {
    if (programId == null) return;
    const program = this.availablePrograms().find((p) => p.id === programId);
    const teamId = program?.team_id ?? program?.team?.id ?? null;
    if (teamId == null) return;
    this.selectedTeamId.set(teamId);
    // Single teamsRetrieve per team feeds both vis-prefill and sports defaulting.
    if (this.loadedSportsForTeamId === teamId) return;
    this.loadedSportsForTeamId = teamId;
    this.teamsService
      .teamsRetrieve({ id: teamId })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (t) => {
          this.applyVisPrefill(t);
          this.applyTeamSports(t);
        },
        error: () => this.teamSports.set([]),
      });
  }

  /**
   * Prefill the 3 vis_* selects from the team defaults. Create-only: no-op in
   * edit mode (vis comes from the event) and once the user has manually changed
   * a visibility value.
   */
  private applyVisPrefill(t: Team): void {
    if (this.isEditMode() || this.visTouchedByUser) return;
    this.form.patchValue(
      {
        vis_distance: t.vis_distance ?? VisibilityMode.Always,
        vis_goal: t.vis_goal ?? VisibilityMode.Always,
        vis_rounds: t.vis_rounds ?? VisibilityMode.Always,
      },
      { emitEvent: false },
    );
  }

  /** Populate the session-sport options and, when nothing is chosen yet, default
   *  the sport to the team's default (preserves an edited event's own sport). */
  private applyTeamSports(t: Team): void {
    const sports = t.sports ?? [];
    this.teamSports.set(sports);
    if (this.form.controls.sport_id.value == null) {
      const def = sports.find((s) => s.is_default) ?? sports[0];
      if (def) this.form.controls.sport_id.setValue(def.id);
    }
  }

  private loadAvailablePrograms(): void {
    this.teamsService
      .teamsList({ isActive: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const teamIds = (res.results ?? []).map((t) => t.id);
          this.fetchProgramsForTeams(teamIds);
        },
        // Without an error handler the program dropdown silently stays empty,
        // leaving the user unable to pick a program with no explanation.
        error: () => this.notifyLoadProgramsError(),
      });
  }

  private async fetchProgramsForTeams(teamIds: number[]): Promise<void> {
    try {
      this.availablePrograms.set(
        await loadProgramsForTeams(this.programsService, teamIds),
      );
      // The program list may arrive after the event/param did; (re)resolve the
      // team now that team ids are known so the Place selector can load places.
      this.resolveTeamForProgram(this.form.controls.refer_program_id.value);
    } catch {
      // Any failed program fetch leaves the dropdown empty — tell the user.
      this.notifyLoadProgramsError();
    }
  }

  private notifyLoadProgramsError(): void {
    this.messageService.add({
      severity: 'error',
      summary: this.transloco.translate('common.error'),
      detail: this.transloco.translate('events.form.errors.load_programs_failed'),
    });
  }

  private loadEvent(id: number): void {
    this.loading.set(true);
    this.eventsService
      .eventsRetrieve({ id })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (e) => {
          this.form.reset({
            name: e.name,
            refer_program_id: e.refer_program?.id ?? null,
            goal: e.goal ?? '',
            sport_id: e.sport?.id ?? null,
            place_id: e.place?.id ?? null,
            equipment_item_ids: e.equipment_items?.map((i) => i.id) ?? [],
            date: parseDate(e.date),
            hour_start: parseTime(e.hour_start),
            hour_end: parseTime(e.hour_end),
            total: e.total ?? 0,
            color: e.color || '#3B82F6',
            vis_distance: e.vis_distance ?? VisibilityMode.Always,
            vis_goal: e.vis_goal ?? VisibilityMode.Always,
            vis_rounds: e.vis_rounds ?? VisibilityMode.Always,
          });
          this.form.controls.refer_program_id.disable();
          // A legacy event may carry a free-text location with no linked place;
          // surface it as a hint until a place is chosen.
          this.legacyLocation.set(e.place ? null : e.location || null);
          // A legacy event may carry free-text equipment with no linked items;
          // surface it as a hint until equipment items are chosen.
          this.legacyEquipment.set(
            e.equipment_items && e.equipment_items.length > 0 ? null : e.equipment || null,
          );
          this.resolveTeamForProgram(e.refer_program?.id ?? null);
          this.loading.set(false);
        },
        error: () => {
          this.notifyLoadError();
          this.loading.set(false);
        },
      });
  }

  private notifyLoadError(): void {
    this.messageService.add({
      severity: 'error',
      summary: this.transloco.translate('common.error'),
      detail: this.transloco.translate('events.errors.unknown'),
    });
  }

  protected fieldError(name: string): string | null {
    return this.fieldErrors()?.[name]?.join(', ') ?? null;
  }

  protected cancel(): void {
    const id = this.eventId();
    this.router.navigate(id ? ['/events', id] : ['/events']);
  }

  protected submit(): void {
    if (this.form.invalid) return;
    this.saving.set(true);
    this.fieldErrors.set(null);

    const value = this.form.getRawValue();
    const id = this.eventId();

    if (id === null) {
      const createPayload = {
        name: value.name,
        refer_program_id: value.refer_program_id,
        goal: value.goal || null,
        sport_id: value.sport_id ?? null,
        place_id: value.place_id ?? null,
        equipment_item_ids: value.equipment_item_ids ?? [],
        date: toIsoDate(value.date),
        hour_start: toIsoTime(value.hour_start),
        hour_end: toIsoTime(value.hour_end),
        total: value.total,
        color: value.color,
        vis_distance: value.vis_distance,
        vis_goal: value.vis_goal,
        vis_rounds: value.vis_rounds,
      };
      this.eventsService
        .eventsCreate({ event: createPayload as unknown as Event })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (created) => {
            this.notifySaved();
            this.saving.set(false);
            this.router.navigate(['/events', created.id]);
          },
          error: (err: HttpErrorResponse) => {
            this.applyServerError(err);
            this.saving.set(false);
          },
        });
      return;
    }

    const updatePayload: PatchedEvent = {
      name: value.name,
      refer_program_id: value.refer_program_id ?? undefined,
      goal: value.goal || undefined,
      sport_id: value.sport_id ?? undefined,
      place_id: value.place_id ?? null,
      equipment_item_ids: value.equipment_item_ids ?? [],
      date: toIsoDate(value.date) ?? undefined,
      hour_start: toIsoTime(value.hour_start) ?? undefined,
      hour_end: toIsoTime(value.hour_end) ?? undefined,
      total: value.total,
      color: value.color,
      vis_distance: value.vis_distance,
      vis_goal: value.vis_goal,
      vis_rounds: value.vis_rounds,
    };

    this.eventsService
      .eventsPartialUpdate({ id, patchedEvent: updatePayload })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.notifySaved();
          this.saving.set(false);
          this.router.navigate(['/events', id]);
        },
        error: (err: HttpErrorResponse) => {
          this.applyServerError(err);
          this.saving.set(false);
        },
      });
  }

  private notifySaved(): void {
    this.messageService.add({
      severity: 'success',
      summary: this.transloco.translate('common.success'),
      detail: this.transloco.translate('events.form.saved'),
    });
  }

  private applyServerError(err: HttpErrorResponse): void {
    const { fields, detail } = extractServerError(err);
    this.fieldErrors.set(fields);
    if (!fields) {
      this.messageService.add({
        severity: 'error',
        summary: this.transloco.translate('common.error'),
        detail: detail ? this.transloco.translate(detail) : this.transloco.translate('events.errors.unknown'),
      });
    }
  }
}
