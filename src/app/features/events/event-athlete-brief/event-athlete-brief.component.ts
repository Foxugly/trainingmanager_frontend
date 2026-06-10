import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from 'primeng/button';
import { EventsService } from '../../../api/api/events.service';
import { ToastService } from '../../../core/notifications/toast.service';

/**
 * Athlete-facing AI brief of a session. Any team member who may see it receives
 * the text via the event payload (vis_goal-gated server-side); managers get a
 * generate/regenerate button that calls POST events/{id}/explain/.
 */
@Component({
  selector: 'app-event-athlete-brief',
  imports: [Button, TranslocoPipe],
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

  protected readonly current = signal('');
  protected readonly generating = signal(false);

  constructor() {
    // Seed/refresh from the input as the parent (re)loads the event.
    effect(() => this.current.set(this.brief()));
  }

  protected generate(): void {
    if (this.generating()) return;
    this.generating.set(true);
    this.eventsService
      .eventsExplainCreate({ id: this.eventId() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.current.set(res.athlete_brief);
          this.toast.success('events.athlete_brief.generated');
          this.generating.set(false);
        },
        error: () => {
          this.toast.error('events.athlete_brief.error');
          this.generating.set(false);
        },
      });
  }
}
