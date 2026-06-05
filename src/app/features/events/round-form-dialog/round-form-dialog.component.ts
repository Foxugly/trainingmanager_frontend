import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { Dialog } from 'primeng/dialog';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { RoundsService } from '../../../api/api/rounds.service';
import { LanguageEnum } from '../../../api/model/language-enum';
import { Round } from '../../../api/model/round';
import { type FieldErrors, extractServerError } from '../../../shared/forms/notify-error';
import { FormFooterComponent } from '../../../shared/ui/form-footer/form-footer.component';
import { MetaFieldComponent } from '../../../shared/ui/meta-field/meta-field.component';
import { timeMmSsValidator } from '../shared/time-validator';

@Component({
  selector: 'app-round-form-dialog',
  imports: [
    ReactiveFormsModule,
    Dialog,
    InputNumber,
    InputText,
    MetaFieldComponent,
    FormFooterComponent,
    TranslocoPipe,
  ],
  templateUrl: './round-form-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoundFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly roundsService = inject(RoundsService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  readonly visible = input.required<boolean>();
  readonly mode = input.required<'create' | 'edit'>();
  readonly round = input<Round | null>(null);
  readonly eventId = input<number | null>(null);
  readonly teamSportId = input<number | null>(null);
  readonly teamLanguage = input<string>('fr');

  readonly closed = output<Round | null>();

  protected readonly saving = signal(false);
  protected readonly fieldErrors = signal<FieldErrors | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    count: [1, [Validators.required, Validators.min(1)]],
    t_start: ['', [timeMmSsValidator]],
    t_break: ['', [timeMmSsValidator]],
  });

  constructor() {
    effect(() => {
      if (this.visible()) {
        const r = this.round();
        this.form.reset({
          count: r?.count ?? 1,
          t_start: r?.t_start ?? '',
          t_break: r?.t_break ?? '',
        });
        this.fieldErrors.set(null);
      }
    });
  }

  protected fieldError(name: string): string | null {
    return this.fieldErrors()?.[name]?.join(', ') ?? null;
  }

  protected onCancel(): void {
    if (this.saving()) return;
    this.closed.emit(null);
  }

  protected onVisibleChange(value: boolean): void {
    if (!value && !this.saving()) {
      this.closed.emit(null);
    }
  }

  protected submit(): void {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    this.fieldErrors.set(null);

    const value = this.form.getRawValue();
    if (this.mode() === 'create') {
      const sportId = this.teamSportId();
      const eventId = this.eventId();
      if (sportId == null || eventId == null) {
        this.notifyGlobalError('events.errors.unknown');
        this.saving.set(false);
        return;
      }
      const payload = {
        event_id: eventId,
        sport_id: sportId,
        language: this.teamLanguage() as LanguageEnum,
        count: value.count,
        t_start: value.t_start || null,
        t_break: value.t_break || null,
      };
      this.roundsService
        .roundsCreate(payload as unknown as Round)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (created) => {
            this.saving.set(false);
            this.closed.emit(created);
          },
          error: (err: HttpErrorResponse) => {
            this.saving.set(false);
            this.applyServerError(err);
          },
        });
    } else {
      const r = this.round();
      if (!r) {
        this.notifyGlobalError('events.errors.unknown');
        this.saving.set(false);
        return;
      }
      this.roundsService
        .roundsPartialUpdate(r.id, {
          count: value.count,
          t_start: value.t_start || null,
          t_break: value.t_break || null,
        })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (updated) => {
            this.saving.set(false);
            this.closed.emit(updated);
          },
          error: (err: HttpErrorResponse) => {
            this.saving.set(false);
            this.applyServerError(err);
          },
        });
    }
  }

  private applyServerError(err: HttpErrorResponse): void {
    const code = (err?.error as { code?: string } | null | undefined)?.code;
    if (code === 'not_authorized_event') {
      this.notifyGlobalError('events.round_form.errors.not_authorized_event');
      return;
    }

    const { fields, detail } = extractServerError(err);
    this.fieldErrors.set(fields);
    if (!fields) {
      this.notifyGlobalError(detail ?? 'events.errors.unknown');
    }
  }

  private notifyGlobalError(detailKey: string): void {
    this.messageService.add({
      severity: 'error',
      summary: this.transloco.translate('common.error'),
      detail: this.transloco.translate(detailKey),
    });
  }
}
