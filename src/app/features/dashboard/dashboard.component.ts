import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-dashboard',
  template: `
    <h1 class="text-2xl font-bold">Hello {{ greetingName() }} 👋</h1>
    <p class="text-gray-600 mt-2">Dashboard à venir.</p>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  private readonly authService = inject(AuthService);

  protected readonly greetingName = computed(() => {
    const user = this.authService.currentUser();
    return user?.first_name || user?.username || '';
  });
}
