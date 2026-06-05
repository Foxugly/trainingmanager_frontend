import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { Tooltip } from 'primeng/tooltip';
import { Observable } from 'rxjs';

export interface ActiveToggleLabels {
  active: string;
  inactive: string;
  confirm: string;
  errorSummary?: string;
  errorDetail?: string;
}

/**
 * Header active/inactive toggle with optimistic PATCH.
 * - Activating: patches immediately.
 * - Deactivating: asks confirmation first (ConfirmationService).
 * - On error: rolls the value back and shows a toast.
 * The parent supplies `patch` so the right service method (whose positional
 * signature varies) is invoked. Emits `valueChange` so the parent stays in sync.
 */
@Component({
  selector: 'app-active-toggle',
  imports: [ToggleSwitch, FormsModule, Tooltip],
  template: `
    <p-toggleswitch
      [ngModel]="value()"
      (onChange)="onChange($event.checked)"
      [disabled]="busy"
      [pTooltip]="value() ? labels().active : labels().inactive"
      tooltipPosition="bottom"
      [ariaLabel]="value() ? labels().active : labels().inactive"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActiveToggleComponent {
  private readonly confirmation = inject(ConfirmationService);
  private readonly messages = inject(MessageService);

  readonly entityId = input.required<number>();
  readonly value = input.required<boolean>();
  readonly patch = input.required<(id: number, value: boolean) => Observable<unknown>>();
  readonly labels = input.required<ActiveToggleLabels>();
  readonly valueChange = output<boolean>();

  protected busy = false;

  onChange(next: boolean): void {
    if (next === this.value()) return;
    if (!next) {
      this.confirmation.confirm({
        message: this.labels().confirm,
        accept: () => this.apply(false),
        reject: () => this.valueChange.emit(true),
      });
      return;
    }
    this.apply(true);
  }

  private apply(next: boolean): void {
    const previous = this.value();
    this.valueChange.emit(next); // optimistic
    this.busy = true;
    this.patch()(this.entityId(), next).subscribe({
      next: () => {
        this.busy = false;
      },
      error: () => {
        this.busy = false;
        this.valueChange.emit(previous); // rollback
        this.messages.add({
          severity: 'error',
          summary: this.labels().errorSummary ?? 'Error',
          detail: this.labels().errorDetail ?? 'Update failed',
        });
      },
    });
  }
}
