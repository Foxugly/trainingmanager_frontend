import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Shared auth card shell (fleet standard — one card for every auth screen:
 * login, register, forgot/reset password, magic-link, confirmations). Renders a
 * centred card (~28rem) with a branded header (optional icon + centred title);
 * the form body, messages and links are projected via <ng-content> and keep
 * their styles in the calling component. Mirrors FoxRunner_frontend's
 * app-auth-card — replaces the per-page `.X__card` chrome duplication.
 */
@Component({
  selector: 'app-auth-card',
  standalone: true,
  template: `
    <section class="auth-card">
      <div class="auth-card__box">
        <div class="auth-card__header">
          @if (icon()) {
            <i
              [class]="icon()"
              class="auth-card__icon"
              [class.auth-card__icon--danger]="tone() === 'danger'"
              [class.auth-card__icon--warn]="tone() === 'warn'"
              [class.auth-card__icon--success]="tone() === 'success'"
              aria-hidden="true"
            ></i>
          }
          <h1 class="auth-card__title">{{ title() }}</h1>
        </div>
        <ng-content />
      </div>
    </section>
  `,
  styleUrl: './auth-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthCardComponent {
  readonly icon = input<string>();
  readonly title = input.required<string>();
  /** Icon tint. Default emerald accent; `danger`/`warn` for error/expired
   *  state screens so the header icon carries the same semantics as the copy. */
  readonly tone = input<'accent' | 'danger' | 'warn' | 'success'>('accent');
}
