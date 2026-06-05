import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Wraps a form control in the shared `.meta-item` shell (label + value +
 * hint/error). The actual widget is projected via <ng-content>. All visual
 * styling comes from the global `src/styles/_forms-meta.scss`.
 */
@Component({
  selector: 'app-meta-field',
  template: `
    <div class="meta-item" [class.meta-item--full]="full()">
      <label class="meta-label" [attr.for]="for()">{{ label() }}</label>
      <div class="meta-value">
        <ng-content />
      </div>
      @if (error()) {
        <div class="meta-hint meta-hint--error">{{ error() }}</div>
      } @else if (hint()) {
        <div class="meta-hint">{{ hint() }}</div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MetaFieldComponent {
  readonly label = input.required<string>();
  readonly for = input<string | null>(null);
  readonly hint = input<string | null>(null);
  readonly error = input<string | null>(null);
  readonly full = input<boolean>(false);
}
