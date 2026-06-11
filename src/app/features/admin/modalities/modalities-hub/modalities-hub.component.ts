import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from 'primeng/button';
import { Message } from 'primeng/message';
import { SportsService } from '../../../../api/api/sports.service';
import { Sport } from '../../../../api/model/sport';

@Component({
  selector: 'app-modalities-hub',
  imports: [RouterLink, Button, Message, TranslocoPipe],
  templateUrl: './modalities-hub.component.html',
  styleUrl: './modalities-hub.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalitiesHubComponent implements OnInit {
  private readonly sportsService = inject(SportsService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly sports = signal<Sport[]>([]);
  protected readonly loading = signal(false);
  // Distinguish a backend failure from a genuinely empty list, so an error
  // doesn't masquerade as "no sports".
  protected readonly error = signal(false);

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.sportsService
      .sportsList()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.sports.set(res.results ?? []);
          this.loading.set(false);
        },
        error: () => {
          this.error.set(true);
          this.loading.set(false);
        },
      });
  }
}
