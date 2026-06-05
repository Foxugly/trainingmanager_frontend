import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Button } from 'primeng/button';

/**
 * Shared form footer: Cancel (secondary outlined) + Save (primary, loading).
 * Layout from the global `.footer-actions` class. Parent owns submit logic.
 */
@Component({
  selector: 'app-form-footer',
  imports: [Button],
  template: `
    <div class="footer-actions">
      <p-button
        type="button"
        severity="secondary"
        [outlined]="true"
        [label]="cancelLabel()"
        [disabled]="saving()"
        (onClick)="cancel.emit()"
      />
      <p-button
        type="button"
        [label]="saveLabel()"
        [loading]="saving()"
        [disabled]="disabled() || saving()"
        (onClick)="save.emit()"
      />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormFooterComponent {
  readonly saving = input<boolean>(false);
  readonly disabled = input<boolean>(false);
  readonly cancelLabel = input.required<string>();
  readonly saveLabel = input.required<string>();
  readonly cancel = output<void>();
  readonly save = output<void>();
}
