import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

/** Lien « Retour à la connexion » en pied de carte d'authentification. */
@Component({
  selector: 'app-auth-back-link',
  standalone: true,
  imports: [RouterLink, TranslocoPipe],
  template: `
    <p class="auth-back">
      <a [routerLink]="['/login']" class="auth-back__link">
        <i class="pi pi-arrow-left auth-back__icon" aria-hidden="true"></i>
        {{ 'auth.back_to_login' | transloco }}
      </a>
    </p>
  `,
  styles: `
    .auth-back {
      margin: 1.5rem 0 0;
      font-size: 0.875rem;
      text-align: center;
    }
    .auth-back__link {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      font-weight: 500;
      color: var(--accent-strong);
    }
    .auth-back__link:hover {
      text-decoration: underline;
    }
    .auth-back__icon {
      font-size: 0.75rem;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthBackLinkComponent {}
