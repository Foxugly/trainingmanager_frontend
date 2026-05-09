import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Toast } from 'primeng/toast';
import { TopmenuComponent } from '../topmenu/topmenu.component';

@Component({
  selector: 'app-main-layout',
  imports: [RouterOutlet, Toast, TopmenuComponent],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MainLayoutComponent {}
