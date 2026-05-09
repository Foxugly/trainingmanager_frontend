import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { APP_VERSION } from '../../../shared/app-version';

@Component({
  selector: 'app-footer',
  imports: [TranslocoPipe],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FooterComponent {
  protected readonly version = APP_VERSION;
  protected readonly year = new Date().getFullYear();
}
