import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { catchError, distinctUntilChanged, switchMap, tap } from 'rxjs/operators';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { DatePicker } from 'primeng/datepicker';
import { Select } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { Tooltip } from 'primeng/tooltip';
import { TeamsService } from '../../../api/api/teams.service';
import { PatchedTrainingSlot } from '../../../api/model/patched-training-slot';
import { Place } from '../../../api/model/place';
import { TrainingSlot } from '../../../api/model/training-slot';
import { WeekdayEnum } from '../../../api/model/weekday-enum';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';

function toHourMinute(d: Date | null | undefined): string | null {
  if (!d) return null;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function parseTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = value.match(/^(\d{2}):(\d{2})/);
  if (!m) return null;
  const d = new Date();
  d.setHours(parseInt(m[1], 10), parseInt(m[2], 10), 0, 0);
  return d;
}

type SlotFormGroup = FormGroup<{
  /** Backend id of the persisted slot, or null for a not-yet-saved new row. */
  id: FormControl<number | null>;
  weekday: FormControl<WeekdayEnum>;
  hour_start: FormControl<Date | null>;
  hour_end: FormControl<Date | null>;
  /** Linked venue id (one of the team's places), or null for "no place". */
  place_id: FormControl<number | null>;
  /** Slot sport id (one of the team's sports), or null to default server-side. */
  sport_id: FormControl<number | null>;
}>;

/** Per-slot validator: hour_end must be strictly after hour_start. */
function slotTimeRangeValidator(group: AbstractControl): ValidationErrors | null {
  const start = group.get('hour_start')?.value as Date | null;
  const end = group.get('hour_end')?.value as Date | null;
  if (!start || !end) return null;
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = end.getHours() * 60 + end.getMinutes();
  return endMinutes <= startMinutes ? { time_range: true } : null;
}

/**
 * Weekly training-slot editor for a team. Self-contained: each créneau is saved
 * on its own via the per-slot CRUD endpoints, independent of the parent team
 * form. Extracted from teams-form to keep that component focused.
 */
@Component({
  selector: 'app-team-slots-editor',
  imports: [
    ReactiveFormsModule,
    TranslocoPipe,
    Button,
    DatePicker,
    Select,
    TableModule,
    Tooltip,
    EmptyStateComponent,
  ],
  templateUrl: './team-slots-editor.component.html',
  styleUrl: './team-slots-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamSlotsEditorComponent {
  private readonly fb = inject(FormBuilder);
  private readonly teamsService = inject(TeamsService);
  private readonly transloco = inject(TranslocoService);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly destroyRef = inject(DestroyRef);

  /** Team whose slots are edited. */
  readonly teamId = input.required<number>();
  /** The team's linked venues, offered in the per-slot place select. */
  readonly places = input<Place[]>([]);
  /** Default venue id, pre-filled on a freshly-added slot. */
  readonly defaultPlaceId = input<number | null>(null);
  /** The team's sports, offered in the per-slot sport select (multi-sport).
   *  Structural ({ id, name }) so either Sport or TeamSportRead fits. */
  readonly sports = input<{ id: number; name: string }[]>([]);
  /** Default sport id, pre-filled on a freshly-added slot. */
  readonly defaultSportId = input<number | null>(null);

  protected readonly templateLoading = signal(false);
  /** Indices of slot rows with an in-flight save/delete (per-row spinner). */
  protected readonly savingSlotIndices = signal<ReadonlySet<number>>(new Set());
  /** Indices of slot rows shown in inline-edit mode (new rows start open). */
  protected readonly editingSlotIndices = signal<ReadonlySet<number>>(new Set());

  /** Weekday select options (Mon=0 … Sun=6), re-translated on language change. */
  protected readonly weekdayOptions = computed(() => {
    this.transloco.getActiveLang();
    const keys = [
      'training_template.weekday.monday',
      'training_template.weekday.tuesday',
      'training_template.weekday.wednesday',
      'training_template.weekday.thursday',
      'training_template.weekday.friday',
      'training_template.weekday.saturday',
      'training_template.weekday.sunday',
    ];
    return keys.map((k, i) => ({ label: this.transloco.translate(k), value: i as WeekdayEnum }));
  });

  protected readonly templateForm = this.fb.group({
    slots: this.fb.array<SlotFormGroup>([]),
  });

  protected get slots(): FormArray<SlotFormGroup> {
    return this.templateForm.controls.slots;
  }

  constructor() {
    // Load the team's weekly slots reactively when [teamId] changes — a data
    // stream (switchMap cancels a stale request) rather than an effect.
    toObservable(this.teamId)
      .pipe(
        distinctUntilChanged(),
        tap(() => this.templateLoading.set(true)),
        switchMap((teamId) =>
          this.teamsService.teamsTrainingSlotsList({ teamPk: teamId }).pipe(
            catchError(() => {
              this.messageService.add({
                severity: 'error',
                summary: this.transloco.translate('common.error'),
                detail: this.transloco.translate('training_template.error'),
              });
              return of(null);
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((list) => {
        this.templateLoading.set(false);
        if (list === null) return;
        this.slots.clear();
        for (const slot of list ?? []) {
          this.slots.push(this.buildSlotGroup(slot as TrainingSlot & { id?: number }));
        }
        this.editingSlotIndices.set(new Set());
        this.savingSlotIndices.set(new Set());
      });
  }

  private buildSlotGroup(slot?: TrainingSlot & { id?: number }): SlotFormGroup {
    return this.fb.group(
      {
        id: this.fb.control<number | null>(slot?.id ?? null),
        weekday: this.fb.nonNullable.control<WeekdayEnum>(
          slot?.weekday ?? WeekdayEnum.NUMBER_0,
          [Validators.required],
        ),
        hour_start: this.fb.nonNullable.control<Date | null>(parseTime(slot?.hour_start), [
          Validators.required,
        ]),
        hour_end: this.fb.nonNullable.control<Date | null>(parseTime(slot?.hour_end), [
          Validators.required,
        ]),
        place_id: this.fb.control<number | null>(slot?.place?.id ?? null),
        sport_id: this.fb.control<number | null>(slot?.sport?.id ?? null),
      },
      { validators: [slotTimeRangeValidator] },
    ) as SlotFormGroup;
  }

  /** Add a new editable row, defaulting its lieu + sport to the team defaults. */
  protected addSlot(): void {
    const group = this.buildSlotGroup();
    group.controls.place_id.setValue(this.defaultPlaceId());
    group.controls.sport_id.setValue(this.defaultSportId());
    this.slots.push(group);
    this.editingSlotIndices.update((cur) => new Set(cur).add(this.slots.length - 1));
  }

  /** Delete a slot row: persisted rows via DELETE after confirm; new rows dropped. */
  protected removeSlot(index: number): void {
    const group = this.slots.at(index);
    const id = group?.controls.id.value ?? null;
    const teamId = this.teamId();
    if (id == null) {
      this.dropSlotRow(index);
      return;
    }
    this.confirmationService.confirm({
      message: this.transloco.translate('training_template.delete_confirm'),
      header: this.transloco.translate('training_template.remove_slot'),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.transloco.translate('common.delete'),
      rejectLabel: this.transloco.translate('common.cancel'),
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.setSlotSaving(index, true);
        this.teamsService
          .teamsTrainingSlotsDestroy({ id, teamPk: teamId })
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: () => {
              this.setSlotSaving(index, false);
              this.dropSlotRow(index);
              this.notifySuccess('training_template.slot_deleted');
            },
            error: (err: HttpErrorResponse) => {
              this.setSlotSaving(index, false);
              this.notifySlotError(err);
            },
          });
      },
    });
  }

  private dropSlotRow(index: number): void {
    this.slots.removeAt(index);
    const reindex = (cur: ReadonlySet<number>): Set<number> => {
      const next = new Set<number>();
      for (const i of cur) {
        if (i < index) next.add(i);
        else if (i > index) next.add(i - 1);
      }
      return next;
    };
    this.editingSlotIndices.update(reindex);
    this.savingSlotIndices.update(reindex);
  }

  protected isSlotEditing(index: number): boolean {
    return this.editingSlotIndices().has(index);
  }

  protected isSlotSaving(index: number): boolean {
    return this.savingSlotIndices().has(index);
  }

  private setSlotSaving(index: number, busy: boolean): void {
    this.savingSlotIndices.update((cur) => {
      const next = new Set(cur);
      if (busy) next.add(index);
      else next.delete(index);
      return next;
    });
  }

  protected editSlot(index: number): void {
    this.editingSlotIndices.update((cur) => new Set(cur).add(index));
  }

  /** Confirm a slot row: POST a new row / PATCH an existing one, on its own. */
  protected confirmSlot(index: number): void {
    const group = this.slots.at(index);
    const teamId = this.teamId();
    if (!group) return;
    if (group.invalid) {
      group.markAllAsTouched();
      return;
    }

    const id = group.controls.id.value;
    const body = {
      weekday: group.controls.weekday.value,
      hour_start: toHourMinute(group.controls.hour_start.value) ?? '',
      hour_end: toHourMinute(group.controls.hour_end.value) ?? '',
      place_id: group.controls.place_id.value ?? null,
      sport_id: group.controls.sport_id.value ?? null,
    };

    this.setSlotSaving(index, true);
    const request$ =
      id == null
        ? this.teamsService.teamsTrainingSlotsCreate({
            teamPk: teamId,
            trainingSlot: body as unknown as TrainingSlot,
          })
        : this.teamsService.teamsTrainingSlotsPartialUpdate({
            id,
            teamPk: teamId,
            patchedTrainingSlot: body as unknown as PatchedTrainingSlot,
          });

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (saved) => {
        this.setSlotSaving(index, false);
        group.patchValue({
          id: saved.id ?? id ?? null,
          weekday: saved.weekday,
          hour_start: parseTime(saved.hour_start),
          hour_end: parseTime(saved.hour_end),
          place_id: saved.place?.id ?? null,
          sport_id: saved.sport?.id ?? null,
        });
        group.markAsPristine();
        this.editingSlotIndices.update((cur) => {
          const next = new Set(cur);
          next.delete(index);
          return next;
        });
        this.notifySuccess(
          id == null ? 'training_template.slot_created' : 'training_template.slot_saved',
        );
      },
      error: (err: HttpErrorResponse) => {
        this.setSlotSaving(index, false);
        this.notifySlotError(err);
      },
    });
  }

  private notifySuccess(detailKey: string): void {
    this.messageService.add({
      severity: 'success',
      summary: this.transloco.translate('common.success'),
      detail: this.transloco.translate(detailKey),
    });
  }

  /** Toast a per-slot save error (place_not_in_team / validation / forbidden). */
  private notifySlotError(err: HttpErrorResponse): void {
    const body = err?.error as
      | { code?: string; place_id?: unknown; sport_id?: unknown }
      | null
      | undefined;
    let detail: string;
    if (body?.code === 'place_not_in_team' || body?.place_id) {
      detail = this.transloco.translate('training_template.place_not_in_team');
    } else if (body?.code === 'sport_not_in_team' || body?.sport_id) {
      detail = this.transloco.translate('training_template.sport_not_in_team');
    } else if (err.status === 403) {
      detail = this.transloco.translate('training_template.error_forbidden');
    } else {
      detail = this.transloco.translate('training_template.error');
    }
    this.messageService.add({
      severity: 'error',
      summary: this.transloco.translate('common.error'),
      detail,
    });
  }

  protected slotWeekdayLabel(index: number): string {
    const group = this.slots.at(index);
    if (!group) return '';
    return this.weekdayOptions()[group.controls.weekday.value]?.label ?? '';
  }

  protected slotStart(index: number): string {
    return toHourMinute(this.slots.at(index)?.controls.hour_start.value) ?? '—';
  }

  protected slotEnd(index: number): string {
    return toHourMinute(this.slots.at(index)?.controls.hour_end.value) ?? '—';
  }

  protected slotPlaceName(index: number): string {
    const placeId = this.slots.at(index)?.controls.place_id.value ?? null;
    if (placeId == null) return '—';
    return this.places().find((p) => p.id === placeId)?.name ?? '—';
  }

  protected slotSportName(index: number): string {
    const sportId = this.slots.at(index)?.controls.sport_id.value ?? null;
    if (sportId == null) return '—';
    return this.sports().find((s) => s.id === sportId)?.name ?? '—';
  }

  /** True when the team has several sports — drives the per-slot sport column. */
  protected readonly showSportColumn = computed(() => this.sports().length > 1);

  protected slotHasTimeError(index: number): boolean {
    const group = this.slots.at(index);
    return !!group && group.errors?.['time_range'] === true;
  }

  /** Load the team's weekly slots via the per-slot list endpoint. */
}
