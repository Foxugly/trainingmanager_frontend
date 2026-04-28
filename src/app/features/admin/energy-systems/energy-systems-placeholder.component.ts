import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-energy-systems-placeholder',
  imports: [TranslocoPipe],
  template: `<h1 class="text-2xl font-bold">{{ 'admin.coming_soon' | transloco }}</h1>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnergySystemsPlaceholderComponent {}
