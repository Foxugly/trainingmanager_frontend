import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ViewEncapsulation,
  forwardRef,
  inject,
  input,
} from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Editor } from 'primeng/editor';

/**
 * Thin wrapper around PrimeNG's <p-editor> (Quill).
 *
 * Why this exists: Quill's snow-theme CSS (~24 kB) and Quill itself are heavy.
 * Quill's JS is already code-split by route-level lazy loading, but the CSS used
 * to be imported in the GLOBAL stylesheet (`src/styles.scss`), which dragged it
 * into the initial bundle and pushed it over the 1 MB budget.
 *
 * Here the Quill CSS is declared as this component's own style with
 * `ViewEncapsulation.None`. Angular ships it in whatever lazy chunk imports the
 * component, so it loads only when an editor is actually rendered — never in the
 * initial bundle. `None` is safe because this component has no other styles to
 * leak; the only rules are Quill's, which target Quill's own un-encapsulated DOM
 * (which `Emulated` encapsulation could not reach anyway).
 *
 * The component is a transparent ControlValueAccessor that forwards everything to
 * the inner <p-editor>, so callers keep using `formControlName` /
 * `[formControl]` exactly as they did on the bare editor.
 */
@Component({
  selector: 'app-rich-editor',
  imports: [FormsModule, Editor],
  template: `
    <p-editor
      [style]="style()"
      [readonly]="disabled"
      [ngModel]="value"
      (onTextChange)="onEditorChange($event.htmlValue)"
      (onSelectionChange)="onTouched()"
    />
  `,
  styleUrl: './rich-editor.component.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => RichEditorComponent),
      multi: true,
    },
  ],
})
export class RichEditorComponent implements ControlValueAccessor {
  /** Forwarded to <p-editor>'s [style] (e.g. `{ height: '10rem' }`). */
  readonly style = input<{ [key: string]: string } | null>(null);

  private readonly cdr = inject(ChangeDetectorRef);

  protected value: string | null = null;
  protected disabled = false;

  private onChange: (value: string | null) => void = () => {};
  protected onTouched: () => void = () => {};

  writeValue(value: string | null): void {
    // OnPush: mark for check so an async form patch (e.g. the events/programs
    // edit flow loading existing content) actually flows into the inner editor.
    this.value = value ?? null;
    this.cdr.markForCheck();
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    this.cdr.markForCheck();
  }

  protected onEditorChange(html: string | null): void {
    // Do NOT write `html` back to `this.value` here: `[ngModel]="value"` is a
    // one-way binding into the editor and re-assigning it on every keystroke can
    // reset Quill's caret. The editor already holds the live text; we only push
    // it outward to the form control.
    this.onChange(html);
  }
}
