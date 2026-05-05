import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  imports: [CommonModule],
  templateUrl: './empty-state.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyStateComponent {
  /**
   * PrimeIcons class without the leading `pi-` prefix. e.g. "users", "list".
   * Rendered inside a soft indigo pill above the title.
   */
  readonly icon = input<string>('inbox');
  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
  /** Tone affects the icon-pill background. */
  readonly tone = input<'indigo' | 'emerald' | 'rose' | 'gray'>('indigo');
}
