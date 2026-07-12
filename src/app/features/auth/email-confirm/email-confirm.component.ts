import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from 'primeng/button';
import { AuthService } from '../../../core/auth/auth.service';
import { AuthCardComponent } from '../../../shared/components/auth-card/auth-card.component';

type Phase = 'loading' | 'success' | 'invalid_token' | 'unknown_error';

@Component({
  selector: 'app-email-confirm',
  imports: [RouterLink, Button, TranslocoPipe, AuthCardComponent],
  templateUrl: './email-confirm.component.html',
  styleUrl: './email-confirm.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmailConfirmComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly phase = signal<Phase>('loading');

  ngOnInit(): void {
    const key = this.route.snapshot.paramMap.get('key');
    if (!key) {
      this.phase.set('invalid_token');
      return;
    }
    this.authService
      .confirmEmail(key)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.phase.set('success');
          this.router.navigate(['/dashboard']);
        },
        error: (err: HttpErrorResponse) => {
          const body = err?.error as { code?: string; detail?: string } | null | undefined;
          if (err.status === 400 && body?.code === 'invalid_or_expired_token') {
            this.phase.set('invalid_token');
          } else {
            this.phase.set('unknown_error');
          }
        },
      });
  }
}
