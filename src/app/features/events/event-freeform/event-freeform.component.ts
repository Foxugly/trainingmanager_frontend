import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from 'primeng/button';
import { MessageService } from 'primeng/api';
import { EventsService } from '../../../api/api/events.service';
import { Event } from '../../../api/model/event';
import { RichEditorComponent } from '../../../shared/ui/rich-editor/rich-editor.component';

/**
 * Freeform training panel — shown in events-detail when the resolved
 * `event.training_type === 'freeform'`. Managers edit the session's
 * `training_richtext` via the shared rich-editor; restricted viewers see the
 * rendered HTML read-only. The structured rounds/exercises editor
 * (app-event-training) handles the other branch.
 */
@Component({
  selector: 'app-event-freeform',
  imports: [FormsModule, TranslocoPipe, Button, RichEditorComponent],
  templateUrl: './event-freeform.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventFreeformComponent {
  private readonly eventsService = inject(EventsService);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);

  readonly event = input.required<Event>();
  readonly canManage = input(false);
  readonly reloadRequested = output<void>();

  protected readonly content = computed(() => this.event().training_richtext ?? '');
  protected readonly draft = signal<string>('');
  protected readonly saving = signal(false);

  constructor() {
    // Seed the draft from the stored content on first render so a save without
    // any edit still sends the current value (rather than an empty string).
    // Re-seed whenever a fresh event flows in (e.g. after reloadRequested →
    // parent refetch), keeping the editor in sync with the persisted value.
    effect(() => {
      const current = this.content();
      untracked(() => this.draft.set(current));
    });
  }

  protected save(): void {
    this.saving.set(true);
    this.eventsService
      .eventsPartialUpdate({ id: this.event().id, patchedEvent: { training_richtext: this.draft() } })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.reloadRequested.emit();
        },
        error: () => {
          this.saving.set(false);
          // Resolved lazily so the component constructs even where MessageService
          // is not provided (logic-only test harness); the error path is the only
          // consumer.
          this.injector
            .get(MessageService)
            .add({ severity: 'error', detail: 'common.load_failed' });
        },
      });
  }
}
