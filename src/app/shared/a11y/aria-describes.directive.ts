import { Directive, ElementRef, afterNextRender, effect, inject, input } from '@angular/core';

/**
 * Forwards an `aria-describedby` id onto the *inner* focusable element of a
 * widget whose host element is NOT itself the thing a screen reader focuses.
 *
 * Why: our shared `app-meta-field` exposes `errorId()` and renders the error
 * block with `role="alert"`. For native `<input>/<textarea>` (and `p-inputNumber`,
 * which has its own `ariaDescribedBy` input) a plain
 * `[attr.aria-describedby]="… ? field.errorId() : null"` lands on the right
 * element. But PrimeNG widgets (`p-select`, `p-multiSelect`, `p-datepicker`,
 * `p-password`) and our custom wrappers (`app-place-select`, `app-equipment-select`,
 * `app-rich-editor`) render the actual focusable control *inside* the host, so a
 * host-level attribute never reaches it and the error is not announced.
 *
 * This directive finds that inner element (or uses the host when the host is
 * itself input-like) and sets/removes `aria-describedby` reactively. A null/empty
 * id removes the attribute.
 *
 * Usage:
 *   <p-select … [appAriaDescribes]="hasError ? field.errorId() : null" />
 *
 * Timing: PrimeNG often renders the inner element after this directive's
 * constructor runs, so initial wiring is deferred to `afterNextRender`. The
 * `effect()` also re-queries the DOM on every value change, so a late-rendered
 * inner element still gets wired the next time the id changes.
 */
@Directive({
  selector: '[appAriaDescribes]',
})
export class AriaDescribesDirective {
  /** The id to expose via `aria-describedby`; null/empty removes the attribute. */
  readonly appAriaDescribes = input<string | null>(null);

  private readonly hostRef = inject(ElementRef<HTMLElement>);

  // Selector for the inner focusable/input-like element to describe.
  private static readonly INNER_SELECTOR =
    'input, textarea, [contenteditable="true"], [role="textbox"], [role="combobox"], ' +
    '[role="listbox"], [role="spinbutton"], .p-inputtext';

  // Tags whose host element IS the focusable control (no inner lookup needed).
  private static readonly HOST_IS_INPUT = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

  constructor() {
    // React to id changes; re-query each run so a late inner element is picked up.
    effect(() => {
      this.apply(this.appAriaDescribes());
    });

    // Robust initial wiring: PrimeNG may render the inner element after the
    // effect's first synchronous run, so re-apply once the DOM has rendered.
    afterNextRender(() => {
      this.apply(this.appAriaDescribes());
    });
  }

  private resolveTarget(): HTMLElement | null {
    const host = this.hostRef.nativeElement;
    if (
      AriaDescribesDirective.HOST_IS_INPUT.has(host.tagName) ||
      host.isContentEditable ||
      host.hasAttribute('contenteditable')
    ) {
      return host;
    }
    return host.querySelector(AriaDescribesDirective.INNER_SELECTOR) as HTMLElement | null;
  }

  private apply(id: string | null): void {
    const target = this.resolveTarget();
    if (!target) {
      return; // no-op until the inner element exists
    }
    if (id) {
      target.setAttribute('aria-describedby', id);
    } else {
      target.removeAttribute('aria-describedby');
    }
  }
}
