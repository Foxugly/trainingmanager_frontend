import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  model,
  output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { ToggleSwitch } from 'primeng/toggleswitch';

@Component({
  selector: 'app-share-event-dialog',
  imports: [FormsModule, Dialog, ToggleSwitch, InputText, Button, TranslocoPipe],
  templateUrl: './share-event-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShareEventDialogComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly messageService = inject(MessageService);

  readonly visible = model<boolean>(false);
  /** Whether the session is currently shared publicly. */
  readonly isPublic = input<boolean>(false);
  /** Public token of the session (null = never shared). */
  readonly publicToken = input<string | null>(null);
  /** True while the share toggle API call is in flight. */
  readonly loading = input<boolean>(false);

  /** Emits the desired new public state when the manager toggles. */
  readonly toggled = output<boolean>();

  /** Full public URL = origin + /s/e/<token>, or null when not shared. */
  protected readonly publicUrl = computed<string | null>(() => {
    if (!this.isPublic()) return null;
    const token = this.publicToken();
    if (!token) return null;
    return `${window.location.origin}/s/e/${token}`;
  });

  protected onToggle(checked: boolean): void {
    this.toggled.emit(checked);
  }

  protected onVisibleChange(value: boolean): void {
    this.visible.set(value);
  }

  protected async copyLink(): Promise<void> {
    const url = this.publicUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      this.messageService.add({
        severity: 'success',
        summary: this.transloco.translate('common.success'),
        detail: this.transloco.translate('public_share.event.copied'),
      });
    } catch {
      this.messageService.add({
        severity: 'error',
        summary: this.transloco.translate('common.error'),
        detail: this.transloco.translate('public_share.event.copy_failed'),
      });
    }
  }
}
