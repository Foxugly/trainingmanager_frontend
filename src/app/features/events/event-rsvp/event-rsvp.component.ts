import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from 'primeng/button';
import { RsvpStatusEnum } from '../../../api/model/rsvp-status-enum';
import { RsvpSummary } from '../../../api/model/rsvp-summary';

/**
 * The session RSVP (availability) tab: athletes declare going / maybe / not
 * going; managers see the aggregate + per-member list + "apply to attendance".
 *
 * Presentational — the parent owns the summary fetch (it also feeds the
 * attendance tab via rsvpByMember, independent of this tab) and the
 * apply-to-attendance flow. This component just renders the summary and emits
 * the athlete's choice / the apply request. Extracted from events-detail.
 */
@Component({
  selector: 'app-event-rsvp',
  imports: [Button, TranslocoPipe],
  templateUrl: './event-rsvp.component.html',
  styleUrl: './event-rsvp.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventRsvpComponent {
  readonly summary = input<RsvpSummary | null>(null);
  readonly isAthlete = input(false);
  readonly canManage = input(false);
  readonly submitting = input(false);
  readonly applying = input(false);

  /** The athlete picked a status. */
  readonly submit = output<RsvpStatusEnum>();
  /** The manager asked to apply the RSVPs to attendance. */
  readonly applyToAttendance = output<void>();

  /** Status options for the athlete buttons, ordered going / maybe / not_going. */
  protected readonly rsvpStatuses: readonly RsvpStatusEnum[] = [
    RsvpStatusEnum.Going,
    RsvpStatusEnum.Maybe,
    RsvpStatusEnum.NotGoing,
  ];

  /**
   * True when the caller's own RSVP equals `status`. Compared by string value
   * because the generator emits a distinct inline enum for `my_status`
   * (oneOf → RsvpSummaryMyStatusEnum) that shares values with RsvpStatusEnum.
   */
  protected isMyStatus(status: RsvpStatusEnum): boolean {
    const mine = this.summary()?.my_status;
    return mine != null && (mine as string) === (status as string);
  }

  /** Maps an RSVP status to a PrimeNG button severity (going=success, maybe=warn, not_going=danger). */
  protected rsvpSeverity(status: RsvpStatusEnum): 'success' | 'warn' | 'danger' {
    switch (status) {
      case RsvpStatusEnum.Going:
        return 'success';
      case RsvpStatusEnum.Maybe:
        return 'warn';
      case RsvpStatusEnum.NotGoing:
        return 'danger';
    }
  }

  /** True when at least one athlete has responded (any non-zero count). */
  protected readonly hasResponses = computed<boolean>(() => {
    const c = this.summary()?.counts;
    if (!c) return false;
    return c.going > 0 || c.maybe > 0 || c.not_going > 0;
  });
}
