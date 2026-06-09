import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  forwardRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { catchError, distinctUntilChanged, filter, switchMap } from 'rxjs/operators';
import {
  ControlValueAccessor,
  FormsModule,
  NG_VALUE_ACCESSOR,
  ReactiveFormsModule,
} from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { Textarea } from 'primeng/textarea';
import { Tooltip } from 'primeng/tooltip';
import { PlacesService } from '../../../api/api/places.service';
import { Place } from '../../../api/model/place';
import { PlaceRequest } from '../../../api/model/place-request';

/**
 * Reusable place (Lieu) selector with an inline "create on the fly" dialog.
 *
 * Transparent ControlValueAccessor whose value is the selected place id
 * (`number | null`) — bind it to a `place_id` / `default_place_id` form control.
 * Pass the team via [teamId]; the component loads that team's LINKED places
 * (the `?team` filter on the shared sport pool) and lets a manager create a new
 * one without leaving the form. A newly created place is linked to the team
 * (write-only `team` on create), appended to the local list and auto-selected,
 * so it is immediately a valid `place_id` for the event.
 */
@Component({
  selector: 'app-place-select',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    Select,
    Button,
    Dialog,
    InputText,
    Textarea,
    Tooltip,
    TranslocoPipe,
  ],
  templateUrl: './place-select.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => PlaceSelectComponent),
      multi: true,
    },
  ],
})
export class PlaceSelectComponent implements ControlValueAccessor {
  /** Team whose places are listed and against which new places are created. */
  readonly teamId = input<number | null>(null);
  /** inputId forwarded to the inner <p-select> for label association. */
  readonly inputId = input<string>('place_id');

  private readonly placesService = inject(PlacesService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly places = signal<Place[]>([]);

  // ── Inline create dialog state ──────────────────────────────────────────
  protected readonly dialogVisible = signal(false);
  protected readonly creating = signal(false);
  protected readonly newName = signal('');
  protected readonly newAddress = signal('');
  protected readonly nameError = signal<string | null>(null);

  protected value: number | null = null;
  protected disabled = false;

  private onChange: (value: number | null) => void = () => {};
  protected onTouched: () => void = () => {};

  constructor() {
    // Load the team's linked places reactively when [teamId] resolves. A data
    // stream (not an effect): distinctUntilChanged dedups, switchMap cancels a
    // stale request if the team changes mid-flight.
    toObservable(this.teamId)
      .pipe(
        filter((id): id is number => id != null),
        distinctUntilChanged(),
        switchMap((teamId) =>
          this.placesService
            // Signature: (ordering, page, pageSize, search, sport, team) — ?team.
            .placesList({ team: teamId })
            .pipe(catchError(() => of(null))),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((res) => {
        this.places.set(res?.results ?? []);
        this.cdr.markForCheck();
      });
  }

  writeValue(value: number | null): void {
    this.value = value ?? null;
    this.cdr.markForCheck();
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    this.cdr.markForCheck();
  }

  protected onSelectChange(value: number | null): void {
    this.value = value ?? null;
    this.onChange(this.value);
    this.onTouched();
  }

  // ── Inline create flow ──────────────────────────────────────────────────

  protected openCreate(): void {
    this.newName.set('');
    this.newAddress.set('');
    this.nameError.set(null);
    this.dialogVisible.set(true);
  }

  protected closeCreate(): void {
    this.dialogVisible.set(false);
  }

  protected createPlace(): void {
    const teamId = this.teamId();
    const name = this.newName().trim();
    if (teamId == null) return;
    if (!name) {
      this.nameError.set(this.transloco.translate('place.name_required'));
      return;
    }
    this.creating.set(true);
    this.nameError.set(null);
    const payload: PlaceRequest = {
      team: teamId,
      name,
      address: this.newAddress().trim() || undefined,
    };
    this.placesService
      .placesCreate({ placeRequest: payload })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this.creating.set(false);
          this.dialogVisible.set(false);
          this.places.update((cur) => [...cur, created]);
          this.onSelectChange(created.id);
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate('place.created'),
          });
          this.cdr.markForCheck();
        },
        error: () => {
          this.creating.set(false);
          this.messageService.add({
            severity: 'error',
            summary: this.transloco.translate('common.error'),
            detail: this.transloco.translate('place.error_create'),
          });
          this.cdr.markForCheck();
        },
      });
  }
}
