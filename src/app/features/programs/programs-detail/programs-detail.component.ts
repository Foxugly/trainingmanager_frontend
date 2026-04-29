import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ProgramsService } from '../../../api/api/programs.service';
import { Program } from '../../../api/model/program';

@Component({
  selector: 'app-programs-detail',
  imports: [CommonModule, RouterLink, TranslocoPipe],
  templateUrl: './programs-detail.component.html',
  styleUrl: './programs-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgramsDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly programsService = inject(ProgramsService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly programId = signal<number | null>(null);
  protected readonly program = signal<Program | null>(null);
  protected readonly loading = signal(false);
  protected readonly notFound = signal(false);

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    const id = idParam ? Number(idParam) : NaN;
    if (!Number.isFinite(id)) {
      this.notFound.set(true);
      return;
    }
    this.programId.set(id);
    this.loading.set(true);
    this.programsService
      .programsRetrieve(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (p) => {
          this.program.set(p);
          this.loading.set(false);
        },
        error: () => {
          this.notFound.set(true);
          this.loading.set(false);
        },
      });
  }
}
