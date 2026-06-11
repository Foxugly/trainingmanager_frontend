import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ConfirmationService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Message } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { Observable } from 'rxjs';
import { EnergySegmentsService } from '../../../../api/api/energy-segments.service';
import { EnergySegment } from '../../../../api/model/energy-segment';
import { Paginated, TaxonomyListBase } from '../../shared/taxonomy-list.base';

@Component({
  selector: 'app-energy-segments-list',
  imports: [
    FormsModule,
    RouterLink,
    TableModule,
    Checkbox,
    Button,
    Message,
    ConfirmDialog,
    TranslocoPipe,
  ],
  templateUrl: './energy-segments-list.component.html',
  styleUrl: './energy-segments-list.component.scss',
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnergySegmentsListComponent extends TaxonomyListBase<EnergySegment> {
  private readonly service = inject(EnergySegmentsService);
  protected readonly i18nPrefix = 'admin.energy_segments';
  /** Template/spec alias for the inherited `entities` signal. */
  protected readonly segments = this.entities;

  constructor() {
    super();
    this.initStream();
  }

  protected list(includeInactive: boolean): Observable<Paginated<EnergySegment>> {
    return this.service.energySegmentsList({ includeInactive: includeInactive || undefined });
  }
  protected destroyOne(seg: EnergySegment): Observable<unknown> {
    return this.service.energySegmentsDestroy({ id: seg.id });
  }
  protected restoreOne(seg: EnergySegment): Observable<unknown> {
    return this.service.energySegmentsPartialUpdate({
      id: seg.id,
      includeInactive: true,
      patchedEnergySegmentAdminRequest: { is_active: true },
    });
  }
}
