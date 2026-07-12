import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ThemeService } from '../../theme/theme.service';

/**
 * Borderless icon action for the topmenu action row (theme → language → user).
 *
 * A plain custom `<button>` (not `p-button`) so it renders at the exact same
 * height/padding as the language + user triggers on the dark chrome, per the
 * fleet topmenu standard.
 */
@Component({
  selector: 'app-theme-toggle',
  imports: [TranslocoPipe],
  templateUrl: './theme-toggle.component.html',
  styleUrl: './theme-toggle.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeToggleComponent {
  private readonly themeService = inject(ThemeService);

  protected readonly isDark = computed(() => this.themeService.theme() === 'dark');

  protected toggle(): void {
    this.themeService.toggle();
  }
}
