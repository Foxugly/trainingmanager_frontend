import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from 'primeng/button';
import { Textarea } from 'primeng/textarea';
import { catchError, of, switchMap, tap } from 'rxjs';
import { EventsService } from '../../../api/api/events.service';
import { EventDebrief } from '../../../api/model/event-debrief';
import { ToastService } from '../../../core/notifications/toast.service';

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

  protected readonly data = signal<EventDebrief | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  protected readonly debriefText = signal('');
  protected readonly saving = signal(false);

  constructor() {
    toObservable(this.eventId)
      .pipe(
        tap(() => {
          this.loading.set(true);
          this.error.set(false);
        }),
        switchMap((id) =>
          this.eventsService.eventsDebriefRetrieve({ id }).pipe(
            catchError(() => {
              this.error.set(true);
              return of(null);
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((res) => {
        this.data.set(res);
        this.debriefText.set(res?.debrief ?? '');
        this.loading.set(false);
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
