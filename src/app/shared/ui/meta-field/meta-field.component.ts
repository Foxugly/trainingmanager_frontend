import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Tooltip } from 'primeng/tooltip';

let nextMetaFieldId = 0;

/**
 * Wraps a form control in the shared `.meta-item` shell (label + value +
 * hint/error). The actual widget is projected via <ng-content>. All visual
 * styling comes from the global `src/styles/_forms-meta.scss`.
 */
@Component({
  selector: 'app-meta-field',
  imports: [Tooltip],
  // The host element IS the `.meta-item` grid cell, so `meta-item--full`
  // (grid-column: 1 / -1) lands on the actual grid item — wrapping the
  // markup in an inner div would put the span class on a non-grid child
  // and silently no-op.
  host: { class: 'meta-item', '[class.meta-item--full]': 'full()' },
  template: `
    <label class="meta-label" [attr.for]="for()">
      {{ label() }}
      @if (tooltip()) {
        <i
          class="pi pi-info-circle meta-info"
          role="img"
          [pTooltip]="tooltip()!"
          tooltipPosition="top"
          tabindex="0"
          [attr.aria-label]="tooltip()"
        ></i>
      }
    </label>
    <div class="meta-value">
      <ng-content />
    </div>
    @if (error()) {
      <div
        class="meta-hint meta-hint--error"
        role="alert"
        aria-live="assertive"
        [attr.id]="errorId()"
      >
        {{ error() }}
      </div>
    } @else if (hint()) {
      <div class="meta-hint">{{ hint() }}</div>
    }
  `,
  styles: [
    `
      .meta-info {
        margin-left: 0.35rem;
        color: var(--muted);
        font-size: 0.8rem;
        cursor: help;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MetaFieldComponent {
  readonly label = input.required<string>();
  readonly for = input<string | null>(null);
  readonly hint = input<string | null>(null);
  readonly error = input<string | null>(null);
  readonly full = input<boolean>(false);
  readonly tooltip = input<string | null>(null);

  // Stable id on the error block so the projected control can reference it via
  // `aria-describedby` (the control is content-projected, so callers wire this
  // themselves — e.g. `[attr.aria-describedby]="field.errorId()"` when in error).
  // Derived from `for()` (the control's id) when available, else a generated id.
  private readonly uid = `meta-field-${nextMetaFieldId++}`;
  readonly errorId = computed(() => `${this.for() ?? this.uid}-error`);
}
