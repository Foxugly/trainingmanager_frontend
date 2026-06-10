import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from 'primeng/button';
import { JoinMagicService } from '../../../api/api/join-magic.service';
import { ActionProposedEnum } from '../../../api/model/action-proposed-enum';
import { JoinMagicCancelledResponse } from '../../../api/model/join-magic-cancelled-response';
import { MagicActionJoinStatusEnum } from '../../../api/model/magic-action-join-status-enum';
import { TeamJoinRequestMagicActionResponse } from '../../../api/model/team-join-request-magic-action-response';
import { LocalizedDatePipe } from '../../../shared/datetime/localized-date.pipe';

type MagicErrorState = 'invalid_token' | 'forbidden' | 'not_found' | 'unknown' | null;

type ConfirmationCase =
  | 'pending_accept'
  | 'pending_reject'
  | 'accepted_accept_idle'
  | 'accepted_reject_reverse'
  | 'rejected_reject_idle'
  | 'rejected_accept_reverse'
  | 'cancelled_any';

@Component({
  selector: 'app-magic-action',
  imports: [CommonModule, LocalizedDatePipe, RouterLink, Button, TranslocoPipe],
  templateUrl: './magic-action.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MagicActionComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly magicService = inject(JoinMagicService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly token = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly executing = signal(false);
  protected readonly executed = signal(false);
  protected readonly data = signal<TeamJoinRequestMagicActionResponse | null>(null);
  protected readonly cancelledSnapshot = signal<JoinMagicCancelledResponse | null>(null);
  protected readonly errorState = signal<MagicErrorState>(null);

  protected readonly StatusEnum = MagicActionJoinStatusEnum;
  protected readonly ActionEnum = ActionProposedEnum;

  protected readonly confirmationCase = computed<ConfirmationCase | null>(() => {
    const d = this.data();
    if (!d) return null;
    const status = d.join_request.status;
    const action = d.action_proposed;
    const wouldChange = d.would_change_decision;
    const canAct = d.can_act;
    if (!canAct) return 'cancelled_any';
    if (status === MagicActionJoinStatusEnum.Cancelled) return 'cancelled_any';
    if (status === MagicActionJoinStatusEnum.Pending) {
      return action === ActionProposedEnum.Accept ? 'pending_accept' : 'pending_reject';
    }
    if (status === MagicActionJoinStatusEnum.Accepted) {
      if (action === ActionProposedEnum.Accept) return 'accepted_accept_idle';
      return wouldChange ? 'accepted_reject_reverse' : 'accepted_accept_idle';
    }
    if (status === MagicActionJoinStatusEnum.Rejected) {
      if (action === ActionProposedEnum.Reject) return 'rejected_reject_idle';
      return wouldChange ? 'rejected_accept_reverse' : 'rejected_reject_idle';
    }
    return null;
  });

  protected readonly isReversal = computed(() => {
    const c = this.confirmationCase();
    return c === 'accepted_reject_reverse' || c === 'rejected_accept_reverse';
  });

  protected readonly canExecute = computed(() => {
    const c = this.confirmationCase();
    if (c === null) return false;
    if (c === 'cancelled_any') return false;
    if (c === 'accepted_accept_idle' || c === 'rejected_reject_idle') return false;
    return true;
  });

  protected readonly teamLink = computed<(string | number)[] | null>(() => {
    const d = this.data() ?? this.cancelledSnapshot();
    if (!d) return null;
    return ['/teams', d.join_request.team_id];
  });

  ngOnInit(): void {
    const token = this.route.snapshot.paramMap.get('token');
    if (!token) {
      this.errorState.set('invalid_token');
      this.loading.set(false);
      return;
    }
    this.token.set(token);
    this.loadPreview(token);
  }

  private loadPreview(token: string): void {
    this.loading.set(true);
    this.magicService
      .joinMagicRetrieve({ token })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.data.set(res);
          this.loading.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.applyHttpError(err);
          this.loading.set(false);
        },
      });
  }

  protected execute(): void {
    const token = this.token();
    if (!token) return;
    this.executing.set(true);
    this.magicService
      .joinMagicCreate({ teamJoinRequestMagicActionPostRequest: { token } })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.data.set(res);
          this.executing.set(false);
          this.executed.set(true);
        },
        error: (err: HttpErrorResponse) => {
          this.executing.set(false);
          if (err.status === 409) {
            const body = err.error as JoinMagicCancelledResponse | null;
            if (body) {
              this.cancelledSnapshot.set(body);
              this.data.set(body);
              return;
            }
          }
          this.applyHttpError(err);
        },
      });
  }

  protected dismissAndGoToTeam(): void {
    const link = this.teamLink();
    if (link) this.router.navigate(link);
    else this.router.navigate(['/teams']);
  }

  private applyHttpError(err: HttpErrorResponse): void {
    if (err.status === 400) {
      this.errorState.set('invalid_token');
    } else if (err.status === 403) {
      this.errorState.set('forbidden');
    } else if (err.status === 404) {
      this.errorState.set('not_found');
    } else {
      this.errorState.set('unknown');
    }
  }
}
