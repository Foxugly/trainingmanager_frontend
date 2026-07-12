import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { getRuntimeConfig } from '../../runtime-config';

@Component({
  selector: 'app-footer',
  imports: [TranslocoPipe, RouterLink],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FooterComponent {
  // Runtime version (SSM-injected window.__TM_VERSION), build-time package.json
  // as fallback. Mirrors quizonline's runtime-sourced footer version.
  protected readonly version = getRuntimeConfig().version;
  protected readonly year = new Date().getFullYear();
}
