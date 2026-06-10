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
import { ProgressSpinner } from 'primeng/progressspinner';
import { AuthService } from '../../../core/auth/auth.service';
import { safeReturnUrl } from '../shared/safe-return-url';

type ExchangeState = 'loading' | 'expired' | 'invalid';

@Component({
  selector: 'app-magic-link',
  imports: [RouterLink, Button, ProgressSpinner, TranslocoPipe],
  templateUrl: './magic-link.component.html',
  styleUrl: './magic-link.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MagicLinkComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly state = signal<ExchangeState>('loading');

  ngOnInit(): void {
    const token = this.route.snapshot.paramMap.get('token') ?? '';
    if (!token) {
      this.state.set('invalid');
      return;
    }

    this.authService
      .exchangeMagicLink(token)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          const safeNext = safeReturnUrl(
            this.route.snapshot.queryParamMap.get('returnUrl'),
            '/dashboard',
          );
          this.router.navigateByUrl(safeNext);
        },
        error: (err: HttpErrorResponse) => {
          if (err.status === 410) {
            this.state.set('expired');
            return;
          }
          this.state.set('invalid');
        },
      });
  }
}
