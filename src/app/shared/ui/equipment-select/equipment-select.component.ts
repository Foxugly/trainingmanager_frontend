import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  computed,
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
import { TranslocoPipe } from '@jsverse/transloco';
import { MultiSelect } from 'primeng/multiselect';
import { EquipmentService } from '../../../api/api/equipment.service';
import { Equipment } from '../../../api/model/equipment';

/**
 * Reusable equipment (Matériel) multi-selector.
 *
 * Transparent ControlValueAccessor whose value is the array of selected
 * equipment ids (`number[]`) — bind it to an `equipment_item_ids` form control.
 * Pass the team via [teamId]; the component loads that team's ENABLED equipment
 * subset (the `?team` filter on the read-only global catalog). Coaches cannot
 * create global equipment — the catalog is curated centrally and a team owner
 * enables a subset from the team edit form.
 */
@Component({
  selector: 'app-equipment-select',
  imports: [FormsModule, ReactiveFormsModule, MultiSelect, TranslocoPipe],
  templateUrl: './equipment-select.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => EquipmentSelectComponent),
      multi: true,
    },
  ],
})
export class EquipmentSelectComponent implements ControlValueAccessor {
  /** Team whose enabled equipment subset is listed. */
  readonly teamId = input<number | null>(null);
  /** inputId forwarded to the inner <p-multiSelect> for label association. */
  readonly inputId = input<string>('equipment_item_ids');

  private readonly equipmentService = inject(EquipmentService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly items = signal<Equipment[]>([]);
  /** True once a team's equipment list has been fetched (success or empty). */
  private readonly loaded = signal(false);
  /**
   * Public, read-only flag for callers: the team has been resolved and its
   * enabled-equipment list came back empty. Lets the host show a "enable
   * equipment in team settings first" hint instead of a silently empty field.
   */
  readonly empty = computed(() => this.loaded() && this.items().length === 0);

  protected value: number[] = [];
  protected disabled = false;

  private onChange: (value: number[]) => void = () => {};
  protected onTouched: () => void = () => {};

  constructor() {
    // Load the team's enabled equipment reactively when [teamId] resolves —
    // a data stream (distinctUntilChanged dedups, switchMap cancels stale).
    toObservable(this.teamId)
      .pipe(
        filter((id): id is number => id != null),
        distinctUntilChanged(),
        switchMap((teamId) =>
          this.equipmentService
            // Signature: (ordering, page, pageSize, search, sport, team) — ?team.
            .equipmentList(undefined, undefined, undefined, undefined, undefined, teamId)
            .pipe(catchError(() => of(null))),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((res) => {
        this.items.set(res?.results ?? []);
        this.loaded.set(true);
        this.cdr.markForCheck();
      });
  }

  writeValue(value: number[] | null): void {
    this.value = value ?? [];
    this.cdr.markForCheck();
  }

  registerOnChange(fn: (value: number[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    this.cdr.markForCheck();
  }

  protected onSelectChange(value: number[] | null): void {
    this.value = value ?? [];
    this.onChange(this.value);
    this.onTouched();
  }
}
