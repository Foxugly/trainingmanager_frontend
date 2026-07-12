import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  model,
  output,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from 'primeng/button';
import { DatePicker } from 'primeng/datepicker';
import { Dialog } from 'primeng/dialog';
import { InputNumber } from 'primeng/inputnumber';
import { ToggleSwitch } from 'primeng/toggleswitch';

/** Payload emitted on confirm; the parent performs the API call. */
export interface DuplicateEventSubmit {
  /** First copy date as YYYY-MM-DD. */
  date: string;
  repeat_weekly: boolean;
  /** Total sessions to create (1 when repeat is off). */
  occurrences: number;
}

function toIsoDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

@Component({
  selector: 'app-duplicate-event-dialog',
  imports: [
    ReactiveFormsModule,
    Dialog,
    DatePicker,
    ToggleSwitch,
    InputNumber,
    Button,
    TranslocoPipe,
  ],
  templateUrl: './duplicate-event-dialog.component.html',
  styleUrl: './duplicate-event-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DuplicateEventDialogComponent {
  private readonly fb = inject(FormBuilder);

  readonly visible = model<boolean>(false);
  readonly loading = input<boolean>(false);
  /** Source event date (YYYY-MM-DD) used to default the copy date to +7 days. */
  readonly sourceDate = input<string | null>(null);

  readonly confirmed = output<DuplicateEventSubmit>();

  protected readonly form = this.fb.nonNullable.group({
    date: this.fb.nonNullable.control<Date | null>(null, [Validators.required]),
    repeat_weekly: this.fb.nonNullable.control<boolean>(false),
    occurrences: this.fb.nonNullable.control<number>(4, [
      Validators.required,
      Validators.min(2),
      Validators.max(52),
    ]),
  });

  constructor() {
    // Reset the default copy date each time the dialog opens.
    effect(() => {
      if (!this.visible()) return;
      this.form.reset({
        date: this.defaultDate(),
        repeat_weekly: false,
        occurrences: 4,
      });
    });
  }

  /** Source date + 7 days when available, else today. */
  private defaultDate(): Date {
    const src = this.sourceDate();
    const base = src ? new Date(`${src}T00:00:00`) : new Date();
    if (isNaN(base.getTime())) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return today;
    }
    base.setDate(base.getDate() + 7);
    base.setHours(0, 0, 0, 0);
    return base;
  }

  protected readonly repeatWeekly = () => this.form.controls.repeat_weekly.value;

  protected canSubmit(): boolean {
    return (
      this.form.controls.date.value != null &&
      (!this.repeatWeekly() || this.form.controls.occurrences.valid) &&
      !this.loading()
    );
  }

  protected onConfirm(): void {
    const value = this.form.getRawValue();
    const date = toIsoDate(value.date);
    if (!date) return;
    this.confirmed.emit({
      date,
      repeat_weekly: value.repeat_weekly,
      occurrences: value.repeat_weekly ? value.occurrences : 1,
    });
  }

  protected onVisibleChange(value: boolean): void {
    this.visible.set(value);
  }
}
