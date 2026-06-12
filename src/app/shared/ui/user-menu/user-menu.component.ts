import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MenuItem } from 'primeng/api';
import { Button } from 'primeng/button';
import { Menu } from 'primeng/menu';
import { AuthService } from '../../../core/auth/auth.service';

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

  protected readonly menuItems = computed<MenuItem[]>(() => {
    const items: MenuItem[] = [
      {
        label: this.transloco.translate('public.user_menu.profile'),
        icon: 'pi pi-user',
        routerLink: ['/profile'],
      },
      {
        label: this.transloco.translate('public.user_menu.change_password'),
        icon: 'pi pi-key',
        routerLink: ['/profile/password'],
      },
    ];
    items.push({ separator: true });
    items.push({
      label: this.transloco.translate('public.user_menu.logout'),
      icon: 'pi pi-sign-out',
      command: () => this.logout(),
    });
    return items;
  });

  protected logout(): void {
    this.authService.logout();
  }
}
