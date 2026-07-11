import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MenuItem } from 'primeng/api';
import { Button } from 'primeng/button';
import { Menu } from 'primeng/menu';
import { AuthService } from '../../auth/auth.service';

@Component({
  selector: 'app-user-menu',
  imports: [RouterLink, Button, Menu, TranslocoPipe],
  templateUrl: './user-menu.component.html',
  styleUrl: './user-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserMenuComponent {
  private readonly authService = inject(AuthService);
  private readonly transloco = inject(TranslocoService);

  protected readonly currentUser = this.authService.currentUser;
  protected readonly isAuthenticated = computed(() => this.currentUser() !== null);

  protected readonly displayName = computed<string>(() => {
    const u = this.currentUser();
    if (!u) return '';
    const f = u.first_name?.trim();
    const l = u.last_name?.trim();
    if (f && l) return `${f} ${l}`;
    return f || l || u.email;
  });

  // selectTranslate (not the bare translate()) so the labels recompute once the
  // active-language catalog has loaded AND on every language switch. A plain
  // translate() inside computed() ran once before the catalog was ready and
  // froze the raw keys (public.user_menu.*) as the labels.
  private readonly menuLabels = toSignal(
    this.transloco.selectTranslate<string[]>([
      'public.user_menu.profile',
      'public.user_menu.change_password',
      'public.user_menu.logout',
    ]),
    { initialValue: ['', '', ''] as string[] },
  );

  protected readonly menuItems = computed<MenuItem[]>(() => {
    const [profile, changePassword, logout] = this.menuLabels();
    return [
      { label: profile, icon: 'pi pi-user', routerLink: ['/profile'] },
      { label: changePassword, icon: 'pi pi-key', routerLink: ['/profile/password'] },
      { separator: true },
      { label: logout, icon: 'pi pi-sign-out', command: () => this.logout() },
    ];
  });

  protected logout(): void {
    this.authService.logout();
  }
}
