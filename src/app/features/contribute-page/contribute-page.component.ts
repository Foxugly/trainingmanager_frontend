import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-contribute-page',
  imports: [TranslocoPipe],
  templateUrl: './contribute-page.component.html',
  styleUrl: './contribute-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContributePageComponent {
  protected readonly frontendRepoUrl = 'https://github.com/Foxugly/trainingmanager_frontend';
  protected readonly backendRepoUrl = 'https://github.com/Foxugly/trainingmanager';
  protected readonly issuesUrl = 'https://github.com/Foxugly/trainingmanager/issues';
  protected readonly sponsorsUrl = 'https://github.com/sponsors/Foxugly';
}
