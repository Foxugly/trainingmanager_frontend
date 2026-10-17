import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthBackLinkComponent } from '../../../shared/components/auth-card/auth-back-link.component';
import { AuthCardComponent } from '../../../shared/components/auth-card/auth-card.component';

@Component({
  selector: 'app-forgot-password-sent',
  imports: [TranslocoPipe, AuthCardComponent, AuthBackLinkComponent],
  templateUrl: './forgot-password-sent.component.html',
  styleUrl: './forgot-password-sent.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPasswordSentComponent {
  protected readonly email = signal<string | null>(this.readEmailFromHistory());

  private readEmailFromHistory(): string | null {
    if (typeof window === 'undefined') return null;
    const state = (window.history.state ?? null) as { email?: unknown } | null;
    const e = state?.email;
    return typeof e === 'string' && e.length > 0 ? e : null;
  }
}
