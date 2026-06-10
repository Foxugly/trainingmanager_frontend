import { FormGroup } from '@angular/forms';
import { TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';

/**
 * Handle a submit attempt on a possibly-invalid reactive form.
 *
 * The form footers keep their Save button enabled even when the form is invalid
 * (so the user can act and get feedback instead of staring at a greyed-out
 * button with no clue why). On submit this reveals every field's inline error
 * (`markAllAsTouched`) and shows a warning toast.
 *
 * Returns `true` when the form was invalid — the caller should abort its submit.
 */
export function handleInvalidSubmit(
  form: FormGroup,
  messageService: MessageService,
  transloco: TranslocoService,
): boolean {
  if (form.valid) return false;
  form.markAllAsTouched();
  messageService.add({
    severity: 'warn',
    summary: transloco.translate('common.form_invalid_summary'),
    detail: transloco.translate('common.form_invalid_detail'),
  });
  return true;
}
