import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Toast } from 'primeng/toast';
import { FooterComponent } from '../footer/footer.component';
import { TopmenuComponent } from '../topmenu/topmenu.component';

@Component({
  selector: 'app-public-layout',
  imports: [RouterOutlet, Toast, TranslocoPipe, TopmenuComponent, FooterComponent],
  templateUrl: './public-layout.component.html',
  styleUrl: './public-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicLayoutComponent {}
