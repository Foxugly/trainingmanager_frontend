import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ConfirmationService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { TableModule } from 'primeng/table';
import { Observable, map } from 'rxjs';
import { SportsService } from '../../../../api/api/sports.service';
import { Modality } from '../../../../api/model/modality';
import { Sport } from '../../../../api/model/sport';
import { TrainingTypeEnum } from '../../../../api/model/training-type-enum';
import { Paginated } from '../../shared/taxonomy-list.base';
import { NestedTaxonomyListBase } from '../../shared/nested-taxonomy-list.base';

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
export class ModalitiesListComponent
  extends NestedTaxonomyListBase<Modality, Sport>
  implements OnInit
{
  private readonly route = inject(ActivatedRoute);
  private readonly sportsService = inject(SportsService);

  protected readonly i18nPrefix = 'admin.modalities';

  // Template-facing aliases (same signal refs) so the existing HTML keeps its
  // domain names (sport / sportId / modalities) over the base's generic ones.
  protected readonly sport = this.parent;
  protected readonly sportId = this.parentId;
  protected readonly modalities = this.entities;

  constructor() {
    super();
    this.initStream();
  }

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('sportId');
    const sportId = idParam ? Number(idParam) : NaN;
    if (!Number.isFinite(sportId)) return;
    this.initParent(sportId);
  }

  protected loadParent(parentId: number): Observable<Sport> {
    return this.sportsService.sportsRetrieve({ id: parentId, includeInactive: true }).pipe(
      map((s) => ({
        id: s.id,
        name: s.name_fr || s.name_en || s.slug,
        slug: s.slug,
        is_active: s.is_active ?? true,
        energy_systems: s.energy_systems ?? [],
        created_at: s.created_at,
        default_training_type: TrainingTypeEnum.Structured,
      })),
    );
  }

  protected list(parentId: number, includeInactive: boolean): Observable<Paginated<Modality>> {
    return this.sportsService.sportsModalitiesList({
      sportPk: parentId,
      includeInactive: includeInactive || undefined,
    });
  }

  protected destroyOne(parentId: number, modality: Modality): Observable<unknown> {
    return this.sportsService.sportsModalitiesDestroy({ id: modality.id, sportPk: parentId });
  }

  protected restoreOne(parentId: number, modality: Modality): Observable<unknown> {
    return this.sportsService.sportsModalitiesPartialUpdate({
      id: modality.id,
      sportPk: parentId,
      includeInactive: true,
      patchedModalityAdminRequest: { is_active: true },
    });
  }
}
