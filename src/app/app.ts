import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Toast } from '@openng/optimus-ui/toast';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Toast],
  template: '<p-toast /><router-outlet />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
