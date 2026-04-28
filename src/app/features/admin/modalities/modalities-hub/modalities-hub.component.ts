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
import { SportsService } from '../../../../api/api/sports.service';
import { Sport } from '../../../../api/model/sport';

@Component({
  selector: 'app-modalities-hub',
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './modalities-hub.component.html',
  styleUrl: './modalities-hub.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalitiesHubComponent implements OnInit {
  private readonly sportsService = inject(SportsService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly sports = signal<Sport[]>([]);
  protected readonly loading = signal(false);

  ngOnInit(): void {
    this.loading.set(true);
    this.sportsService
      .sportsList()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.sports.set(res.results ?? []);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }
}
