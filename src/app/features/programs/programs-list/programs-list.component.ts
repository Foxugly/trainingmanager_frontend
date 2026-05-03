import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ProgramsService } from '../../../api/api/programs.service';
import { Program } from '../../../api/model/program';

@Component({
  selector: 'app-programs-list',
  imports: [CommonModule, RouterLink, TranslocoPipe],
  templateUrl: './programs-list.component.html',
  styleUrl: './programs-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgramsListComponent {
  private readonly programsService = inject(ProgramsService);
  private readonly destroyRef = inject(DestroyRef);

  readonly teamFilter = input<number | null>(null);

  protected readonly programs = signal<Program[]>([]);
  protected readonly loading = signal(false);

  constructor() {
    effect(() => {
      const team = this.teamFilter();
      this.load(team ?? undefined);
    });
  }

  private load(team: number | undefined): void {
    this.loading.set(true);
    this.programsService
      .programsList(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        team,
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.programs.set(res.results ?? []);
          this.loading.set(false);
        },
        error: () => {
          this.programs.set([]);
          this.loading.set(false);
        },
      });
  }
}
