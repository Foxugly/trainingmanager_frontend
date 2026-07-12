import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthCardComponent } from '../../../shared/components/auth-card/auth-card.component';

@Component({
  selector: 'app-forgot-password-sent',
  imports: [RouterLink, TranslocoPipe, AuthCardComponent],
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
