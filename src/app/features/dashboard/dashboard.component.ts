import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-dashboard',
  imports: [TranslocoPipe],
  template: `
    <h1 class="text-2xl font-bold">
      {{ 'dashboard.greeting' | transloco: { name: greetingName() } }}
    </h1>
    <p class="text-gray-600 mt-2">{{ 'dashboard.coming_soon' | transloco }}</p>
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
