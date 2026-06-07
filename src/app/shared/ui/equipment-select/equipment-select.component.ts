import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  effect,
  forwardRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
import { MultiSelect } from 'primeng/multiselect';
import { Tooltip } from 'primeng/tooltip';
import { HttpErrorResponse } from '@angular/common/http';
import { EquipmentService } from '../../../api/api/equipment.service';
import { Equipment } from '../../../api/model/equipment';
import { EquipmentRequest } from '../../../api/model/equipment-request';

/**
 * Reusable equipment (Matériel) multi-selector with an inline "create on the
 * fly" dialog.
 *
 * Transparent ControlValueAccessor whose value is the array of selected
 * equipment ids (`number[]`) — bind it to an `equipment_item_ids` form control.
 * Pass the team via [teamId]; the component loads that team's managed equipment
 * and lets a manager create a new item without leaving the form. Newly created
 * items are appended to the local list and auto-selected.
 */
@Component({
  selector: 'app-equipment-select',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MultiSelect,
    Button,
    Dialog,
    InputText,
    Tooltip,
    TranslocoPipe,
  ],
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
  /** Team whose equipment is listed and against which new items are created. */
  readonly teamId = input<number | null>(null);
  /** inputId forwarded to the inner <p-multiSelect> for label association. */
  readonly inputId = input<string>('equipment_item_ids');

  private readonly equipmentService = inject(EquipmentService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly items = signal<Equipment[]>([]);
  /** Team id the equipment list was last loaded for (avoids redundant fetches). */
  private loadedForTeamId: number | null = null;

  // ── Inline create dialog state ──────────────────────────────────────────
  protected readonly dialogVisible = signal(false);
  protected readonly creating = signal(false);
  protected readonly newName = signal('');
  protected readonly nameError = signal<string | null>(null);

  protected value: number[] = [];
  protected disabled = false;

  private onChange: (value: number[]) => void = () => {};
  protected onTouched: () => void = () => {};

  constructor() {
    // React to the resolved team id (set asynchronously once the program/team
    // is known) by loading that team's managed equipment.
    effect(() => this.loadForTeam(this.teamId()));
  }

  /** Load the given team's equipment once; idempotent per team id. */
  loadForTeam(teamId: number | null | undefined): void {
    if (teamId == null) return;
    if (this.loadedForTeamId === teamId) return;
    this.loadedForTeamId = teamId;
    this.equipmentService
      .equipmentList(undefined, undefined, undefined, undefined, teamId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.items.set(res.results ?? []);
          this.cdr.markForCheck();
        },
        error: () => {
          this.loadedForTeamId = null;
          this.items.set([]);
        },
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

  // ── Inline create flow ──────────────────────────────────────────────────

  protected openCreate(): void {
    this.newName.set('');
    this.nameError.set(null);
    this.dialogVisible.set(true);
  }

  protected closeCreate(): void {
    this.dialogVisible.set(false);
  }

  protected createItem(): void {
    const teamId = this.teamId();
    const name = this.newName().trim();
    if (teamId == null) return;
    if (!name) {
      this.nameError.set(this.transloco.translate('equipment.name_required'));
      return;
    }
    this.creating.set(true);
    this.nameError.set(null);
    const payload: EquipmentRequest = {
      team: teamId,
      name,
    };
    this.equipmentService
      .equipmentCreate(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this.creating.set(false);
          this.dialogVisible.set(false);
          this.items.update((cur) => [...cur, created]);
          this.onSelectChange([...this.value, created.id]);
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate('equipment.created'),
          });
          this.cdr.markForCheck();
        },
        error: (err: HttpErrorResponse) => {
          this.creating.set(false);
          const body = err?.error as { code?: string } | null | undefined;
          if (err.status === 400 && body?.code === 'equipment_already_exists') {
            this.nameError.set(this.transloco.translate('equipment.error_duplicate'));
          } else {
            this.messageService.add({
              severity: 'error',
              summary: this.transloco.translate('common.error'),
              detail: this.transloco.translate('equipment.error_create'),
            });
          }
          this.cdr.markForCheck();
        },
      });
  }
}
