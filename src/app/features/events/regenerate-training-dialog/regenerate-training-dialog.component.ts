import {
  ChangeDetectionStrategy,
  Component,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { Textarea } from 'primeng/textarea';

@Component({
  selector: 'app-regenerate-training-dialog',
  imports: [FormsModule, Dialog, Textarea, Button, TranslocoPipe],
  templateUrl: './regenerate-training-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegenerateTrainingDialogComponent {
  readonly visible = model<boolean>(false);
  readonly hasRounds = input<boolean>(false);
  readonly loading = input<boolean>(false);

  readonly confirmed = output<string>();

  protected readonly additionalPrompt = signal<string>('');
  protected readonly MAX_PROMPT_LEN = 2000;

  protected onConfirm(): void {
    this.confirmed.emit(this.additionalPrompt().trim());
  }

  protected onVisibleChange(value: boolean): void {
    this.visible.set(value);
    if (!value) {
      this.additionalPrompt.set('');
    }
  }
}
