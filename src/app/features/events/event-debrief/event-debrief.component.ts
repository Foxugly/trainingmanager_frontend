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
import { loadOn } from '../../../shared/data/load-on';

/**
 * Manager-only post-session debrief: consolidated attendance / ROTI / RSVP /
 * attachment summary from GET events/{id}/debrief/, plus an editable free-text
 * debrief note saved back via PATCH events/{id}/.
 */
@Component({
  selector: 'app-event-debrief',
  imports: [FormsModule, Button, Textarea, TranslocoPipe],
  templateUrl: './event-debrief.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventDebriefComponent {
  private readonly eventsService = inject(EventsService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly eventId = input.required<number>();

  private readonly state = loadOn(
    () => this.eventId(),
    (id) => this.eventsService.eventsDebriefRetrieve({ id }),
    this.destroyRef,
  );

  protected readonly data = this.state.data;
  protected readonly loading = this.state.loading;
  protected readonly error = this.state.error;
  protected readonly debriefText = signal('');
  protected readonly saving = signal(false);

  /** Event id the note has already been seeded for — guards a ONE-SHOT seed. */
  private seededForId: number | null = null;

  constructor() {
    // Seed the editable note ONCE per event, the first time its debrief payload
    // lands. A bare effect that re-ran on every data() re-emission would clobber
    // unsaved edits whenever the panel refetched (e.g. a tab revisit / reload).
    // Re-seed only when the event id actually changes (mirrors team-stats'
    // one-shot range seeding via a guard).
    effect(() => {
      const id = this.eventId();
      const payload = this.state.data();
      if (payload === null || this.seededForId === id) return;
      this.seededForId = id;
      this.debriefText.set(payload.debrief ?? '');
    });
  }

  protected save(): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.eventsService
      .eventsPartialUpdate({
        id: this.eventId(),
        patchedEventRequest: { debrief: this.debriefText() },
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.success('events.debrief.saved');
          this.saving.set(false);
        },
        error: () => {
          this.toast.error();
          this.saving.set(false);
        },
      });
  }

  /** Attendance present rate as a rounded percentage, or null. */
  protected attendancePct(): number | null {
    const a = this.data()?.attendance;
    if (!a || !a.total) return null;
    return Math.round((a.present / a.total) * 100);
  }
}
