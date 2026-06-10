import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { EventsService } from '../../../api/api/events.service';
import { ToastService } from '../../../core/notifications/toast.service';

/**
 * Manager action: save the current session as a reusable team template
 * (POST events/{id}/save-as-template/). A small name dialog → toast.
 */
@Component({
  selector: 'app-save-as-template-button',
  imports: [FormsModule, Button, Dialog, InputText, TranslocoPipe],
  templateUrl: './save-as-template-button.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaveAsTemplateButtonComponent {
  private readonly eventsService = inject(EventsService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly eventId = input.required<number>();

  protected readonly visible = signal(false);
  protected readonly name = signal('');
  protected readonly saving = signal(false);

  protected open(): void {
    this.name.set('');
    this.visible.set(true);
  }

  protected save(): void {
    const name = this.name().trim();
    if (!name || this.saving()) return;
    this.saving.set(true);
    this.eventsService
      .eventsSaveAsTemplateCreate({ id: this.eventId(), saveAsTemplateRequestRequest: { name } })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.success('events.templates.saved');
          this.saving.set(false);
          this.visible.set(false);
        },
        error: () => {
          this.toast.error();
          this.saving.set(false);
        },
      });
  }
}
