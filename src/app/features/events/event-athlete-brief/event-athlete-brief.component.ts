import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from 'primeng/button';
import { Textarea } from 'primeng/textarea';
import { EventsService } from '../../../api/api/events.service';
import { ToastService } from '../../../core/notifications/toast.service';

/**
 * Athlete-facing AI brief of a session. Any team member who may see it receives
 * the text via the event payload (vis_goal-gated server-side); athletes get a
 * read-only view. Managers get an AI generate/regenerate button (POST
 * events/{id}/explain/) AND an editable textarea — the AI seeds the brief, the
 * coach can tweak the wording and save it via PATCH events/{id}/ (manager-gated
 * server-side, like the debrief note).
 */
@Component({
  selector: 'app-event-athlete-brief',
  imports: [FormsModule, Button, Textarea, TranslocoPipe],
  templateUrl: './event-athlete-brief.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventAthleteBriefComponent {
  private readonly eventsService = inject(EventsService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly eventId = input.required<number>();
  /** Initial brief from the event payload (may be empty). */
  readonly brief = input<string>('');
  readonly canManage = input<boolean>(false);

  /** Editable copy of the brief (managers). */
  protected readonly draft = signal('');
  protected readonly generating = signal(false);
  protected readonly saving = signal(false);

  /** Event id the draft has already been seeded for — guards a ONE-SHOT seed. */
  private seededForId: number | null = null;

  constructor() {
    // Seed the editable draft ONCE per event, the first time the brief lands.
    // A bare effect re-running on every brief() re-emission would clobber a
    // manager's unsaved edits whenever the parent refetches the event (mirrors
    // event-debrief's one-shot seed). generate()/save() update the draft
    // directly, so skipping later re-seeds is exactly what we want.
    effect(() => {
      const id = this.eventId();
      const value = this.brief();
      if (this.seededForId === id) return;
      this.seededForId = id;
      this.draft.set(value);
    });
  }

  protected generate(): void {
    if (this.generating()) return;
    this.generating.set(true);
    this.eventsService
      .eventsExplainCreate({ id: this.eventId() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          // The explain action already persisted the brief server-side; mirror
          // it into the editable draft so the coach can fine-tune from there.
          this.draft.set(res.athlete_brief);
          this.toast.success('events.athlete_brief.generated');
          this.generating.set(false);
        },
        error: () => {
          this.toast.error('events.athlete_brief.error');
          this.generating.set(false);
        },
      });
  }

  protected save(): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.eventsService
      .eventsPartialUpdate({
        id: this.eventId(),
        patchedEventRequest: { ai_athlete_brief: this.draft() },
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.success('events.athlete_brief.saved');
          this.saving.set(false);
        },
        error: () => {
          this.toast.error();
          this.saving.set(false);
        },
      });
  }
}
