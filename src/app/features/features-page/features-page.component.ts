import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

interface FeatureSection {
  readonly key: 'teams' | 'planning' | 'ai' | 'attendance' | 'i18n' | 'roles';
  readonly icon: string;
  readonly tone: 'emerald' | 'amber' | 'rose' | 'cyan' | 'teal';
}

@Component({
  selector: 'app-features-page',
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './features-page.component.html',
  styleUrl: './features-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeaturesPageComponent {
  protected readonly sections: readonly FeatureSection[] = [
    { key: 'teams', icon: 'pi-users', tone: 'emerald' },
    { key: 'planning', icon: 'pi-calendar', tone: 'emerald' },
    { key: 'ai', icon: 'pi-sparkles', tone: 'teal' },
    { key: 'attendance', icon: 'pi-check-circle', tone: 'amber' },
    { key: 'i18n', icon: 'pi-globe', tone: 'cyan' },
    { key: 'roles', icon: 'pi-id-card', tone: 'rose' },
  ];

  protected readonly toneClasses: Record<FeatureSection['tone'], string> = {
    emerald: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    rose: 'bg-rose-100 text-rose-700',
    cyan: 'bg-cyan-100 text-cyan-700',
    teal: 'bg-teal-100 text-teal-700',
  };
}
