import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from 'primeng/button';
import { Message } from 'primeng/message';
import { AuthService as AuthApi } from '../../../api/api/auth.service';
import { AuthService } from '../../../core/auth/auth.service';

type Phase = 'loading' | 'success' | 'invalid_token' | 'expired' | 'unknown_error';

/**
 * Public page reached from the "confirm your new email" link. Exchanges the
 * signed :token; on success refreshes /me/ (if still logged in) and returns to
 * the profile, otherwise sends the user to login.
 */
@Component({
  selector: 'app-email-change-confirm',
  imports: [RouterLink, Button, Message, TranslocoPipe],
  templateUrl: './email-change-confirm.component.html',
  styleUrl: './email-change-confirm.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmailChangeConfirmComponent implements OnInit {
  private readonly authApi = inject(AuthApi);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly phase = signal<Phase>('loading');

  ngOnInit(): void {
    const token = this.route.snapshot.paramMap.get('token');
    if (!token) {
      this.phase.set('invalid_token');
      return;
    }
    this.authApi
      .authEmailChangeConfirmCreate({ emailChangeConfirmRequest: { token } })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.phase.set('success');
          if (this.authService.isAuthenticated()) {
            this.authService.refreshMe();
            this.router.navigate(['/profile']);
          } else {
            this.router.navigate(['/login']);
          }
        },
        error: (err: HttpErrorResponse) => {
          if (err.status === 410) this.phase.set('expired');
          else if (err.status === 400 || err.status === 409) this.phase.set('invalid_token');
          else this.phase.set('unknown_error');
        },
      });
  }
}
