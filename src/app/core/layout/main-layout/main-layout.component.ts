import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from 'primeng/button';
import { Toast } from 'primeng/toast';
import { AuthService } from '../../auth/auth.service';
import { LanguageSwitcherComponent } from '../../i18n/language-switcher/language-switcher.component';

@Component({
  selector: 'app-main-layout',
  imports: [RouterOutlet, RouterLink, Button, Toast, TranslocoPipe, LanguageSwitcherComponent],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MainLayoutComponent {
  protected readonly authService = inject(AuthService);

  protected logout(): void {
    this.authService.logout();
  }
}
