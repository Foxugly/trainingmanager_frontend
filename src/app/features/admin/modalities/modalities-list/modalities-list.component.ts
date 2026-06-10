import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { TableModule } from 'primeng/table';
import { Observable, catchError, finalize, of, switchMap, tap } from 'rxjs';
import { SportsService } from '../../../../api/api/sports.service';
import { Modality } from '../../../../api/model/modality';
import { Sport } from '../../../../api/model/sport';
import { TrainingTypeEnum } from '../../../../api/model/training-type-enum';

@Component({
  selector: 'app-modalities-list',
  imports: [
    FormsModule,
    RouterLink,
    TableModule,
    Checkbox,
    Button,
    ConfirmDialog,
    TranslocoPipe,
  ],
  templateUrl: './modalities-list.component.html',
  styleUrl: './modalities-list.component.scss',
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalitiesListComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly sportsService = inject(SportsService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly sportId = signal<number | null>(null);
  protected readonly sport = signal<Sport | null>(null);
  protected readonly modalities = signal<Modality[]>([]);
  protected readonly loading = signal(false);
  protected readonly includeInactive = signal(false);

  constructor() {
    // Reload on include-inactive toggle (sportId is set once, in ngOnInit, from
    // the route). switchMap cancels an in-flight request on a rapid re-toggle;
    // the initial load is kicked from ngOnInit once sportId is known.
    toObservable(this.includeInactive)
      .pipe(
        switchMap((include) => {
          const id = this.sportId();
          return id == null ? of(null) : this.fetch(id, include);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('sportId');
    const sportId = idParam ? Number(idParam) : NaN;
    if (!Number.isFinite(sportId)) return;

    this.sportsService
      .sportsRetrieve({ id: sportId, includeInactive: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (s) =>
          this.sport.set({
            id: s.id,
            name: s.name_fr || s.name_en || s.slug,
            slug: s.slug,
            is_active: s.is_active ?? true,
            energy_systems: s.energy_systems ?? [],
            created_at: s.created_at,
            default_training_type: TrainingTypeEnum.Structured,
          }),
      });

    this.sportId.set(sportId);
    // The include-inactive stream's initial emission runs after this ngOnInit
    // (lifecycle hooks fire before effects flush), so sportId is already set
    // and that emission performs the first load — no explicit reload here.
  }

  private fetch(sportId: number, includeInactive: boolean): Observable<unknown> {
    this.loading.set(true);
    return this.sportsService
      .sportsModalitiesList({ sportPk: sportId, includeInactive: includeInactive || undefined })
      .pipe(
        tap((res) => this.modalities.set(res.results ?? [])),
        catchError(() => {
          this.notifyUnknownError();
          this.modalities.set([]);
          return of(null);
        }),
        finalize(() => this.loading.set(false)),
      );
  }

  private reload(): void {
    const id = this.sportId();
    if (id == null) return;
    this.fetch(id, this.includeInactive()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
  }

  protected confirmDelete(modality: Modality): void {
    this.confirmationService.confirm({
      header: this.transloco.translate('admin.modalities.actions.delete_confirm_title'),
      message: this.transloco.translate('admin.modalities.actions.delete_confirm_message'),
      accept: () => this.deleteOne(modality),
    });
  }

  private deleteOne(modality: Modality): void {
    const sportId = this.sportId();
    if (sportId == null) return;
    this.sportsService
      .sportsModalitiesDestroy({ id: modality.id, sportPk: sportId })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate('admin.modalities.actions.deleted'),
          });
          this.reload();
        },
        error: () => this.notifyUnknownError(),
      });
  }

  protected restore(modality: Modality): void {
    const sportId = this.sportId();
    if (sportId == null) return;
    this.sportsService
      .sportsModalitiesPartialUpdate({
        id: modality.id,
        sportPk: sportId,
        includeInactive: true,
        patchedModalityAdminRequest: { is_active: true },
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate('admin.modalities.actions.restored'),
          });
          this.reload();
        },
        error: () => this.notifyUnknownError(),
      });
  }

  private notifyUnknownError(): void {
    this.messageService.add({
      severity: 'error',
      summary: this.transloco.translate('common.error'),
      detail: this.transloco.translate('admin.modalities.errors.unknown'),
    });
  }

  protected get includeInactiveModel(): boolean {
    return this.includeInactive();
  }
  protected set includeInactiveModel(v: boolean) {
    this.includeInactive.set(v);
  }
}
