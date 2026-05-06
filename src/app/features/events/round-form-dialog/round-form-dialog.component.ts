import { CommonModule, KeyValuePipe } from '@angular/common';
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
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { RoundsService } from '../../../api/api/rounds.service';
import { LanguageEnum } from '../../../api/model/language-enum';
import { Round } from '../../../api/model/round';
import { timeMmSsValidator } from '../shared/time-validator';

interface FieldErrors {
  [field: string]: string[];
}

@Component({
  selector: 'app-round-form-dialog',
  imports: [
    CommonModule,
    KeyValuePipe,
    ReactiveFormsModule,
    Button,
    Dialog,
    InputNumber,
    InputText,
    Message,
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
  protected readonly errorMessage = signal<string | null>(null);
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
        this.errorMessage.set(null);
        this.fieldErrors.set(null);
      }
    });
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
    this.errorMessage.set(null);
    this.fieldErrors.set(null);

    const value = this.form.getRawValue();
    if (this.mode() === 'create') {
      const sportId = this.teamSportId();
      const eventId = this.eventId();
      if (sportId == null || eventId == null) {
        this.errorMessage.set('events.errors.unknown');
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
        this.errorMessage.set('events.errors.unknown');
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
    const body = err?.error as
      | { code?: string; detail?: string; fields?: FieldErrors }
      | null
      | undefined;

    if (body?.code === 'not_authorized_event') {
      this.messageService.add({
        severity: 'error',
        summary: this.transloco.translate('common.error'),
        detail: this.transloco.translate('events.round_form.errors.not_authorized_event'),
      });
      return;
    }

    if (body?.fields && Object.keys(body.fields).length > 0) {
      this.fieldErrors.set(body.fields);
      return;
    }

    if (body && typeof body === 'object') {
      const fieldEntries: FieldErrors = {};
      for (const [key, value] of Object.entries(body)) {
        if (key === 'code' || key === 'detail' || key === 'fields') continue;
        if (Array.isArray(value)) {
          fieldEntries[key] = value.filter((m): m is string => typeof m === 'string');
        }
      }
      if (Object.keys(fieldEntries).length > 0) {
        this.fieldErrors.set(fieldEntries);
        return;
      }
    }

    this.errorMessage.set(body?.detail ?? 'events.errors.unknown');
  }
}
