import { inject, Injectable } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';

/**
 * Thin wrapper over PrimeNG's MessageService that standardises the project's
 * toast shape: a severity-appropriate translated `summary` (common.success /
 * common.error / common.warning / common.info) + a translated `detail`.
 *
 * Replaces the ~30 hand-rolled `notify*` helpers that each rebuilt the same
 * `messageService.add({ severity, summary: translate('common.X'), detail:
 * translate(key) })`. Inject this instead and call success()/error()/warn()/
 * info() with the detail i18n key.
 *
 * For DRF field-error mapping use `applyServerError` / `extractServerError`
 * (shared/forms/notify-error) — that's a different concern and stays separate.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly messages = inject(MessageService);
  private readonly transloco = inject(TranslocoService);

  /** Success toast. `detailKey` is an i18n key (e.g. 'admin.sports.actions.saved'). */
  success(detailKey: string, params?: Record<string, unknown>): void {
    this.add('success', 'common.success', detailKey, params);
  }

  /** Error toast. `detailKey` defaults to a generic load/operation failure. */
  error(detailKey = 'common.load_failed', params?: Record<string, unknown>): void {
    this.add('error', 'common.error', detailKey, params);
  }

  /** Warning toast — a non-blocking caveat the user should notice. */
  warn(detailKey: string, params?: Record<string, unknown>): void {
    this.add('warn', 'common.warning', detailKey, params);
  }

  /** Info toast — neutral, low-priority feedback. */
  info(detailKey: string, params?: Record<string, unknown>): void {
    this.add('info', 'common.info', detailKey, params);
  }

  private add(
    severity: 'success' | 'error' | 'warn' | 'info',
    summaryKey: string,
    detailKey: string,
    params?: Record<string, unknown>,
  ): void {
    this.messages.add({
      severity,
      summary: this.transloco.translate(summaryKey),
      detail: this.transloco.translate(detailKey, params),
    });
  }
}
