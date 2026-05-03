import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

interface FeatureBlock {
  readonly key: 'teams' | 'training' | 'attendance' | 'stats';
  readonly icon: string;
  readonly tone: 'indigo' | 'emerald' | 'amber' | 'rose';
}

@Component({
  selector: 'app-home',
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  protected readonly features: readonly FeatureBlock[] = [
    { key: 'teams', icon: 'pi-users', tone: 'indigo' },
    { key: 'training', icon: 'pi-calendar', tone: 'emerald' },
    { key: 'attendance', icon: 'pi-check-circle', tone: 'amber' },
    { key: 'stats', icon: 'pi-chart-line', tone: 'rose' },
  ];

  protected readonly toneClasses: Record<FeatureBlock['tone'], string> = {
    indigo: 'bg-indigo-100 text-indigo-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    rose: 'bg-rose-100 text-rose-700',
  };
}
