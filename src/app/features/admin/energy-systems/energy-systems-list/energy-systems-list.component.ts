import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ConfirmationService } from '@openng/optimus-ui/api';
import { Button } from '@openng/optimus-ui/button';
import { Checkbox } from '@openng/optimus-ui/checkbox';
import { ConfirmDialog } from '@openng/optimus-ui/confirmdialog';
import { Message } from '@openng/optimus-ui/message';
import { TableModule } from '@openng/optimus-ui/table';
import { Observable } from 'rxjs';
import { EnergySystemsService } from '../../../../api/api/energy-systems.service';
import { EnergySystem } from '../../../../api/model/energy-system';
import { StatusBadgeComponent } from '../../../../shared/ui/status-badge/status-badge.component';
import { Paginated, TaxonomyListBase } from '../../shared/taxonomy-list.base';

@Component({
  selector: 'app-energy-systems-list',
  imports: [
    FormsModule,
    RouterLink,
    TableModule,
    Checkbox,
    Button,
    Message,
    ConfirmDialog,
    StatusBadgeComponent,
    TranslocoPipe,
  ],
  templateUrl: './energy-systems-list.component.html',
  styleUrl: './energy-systems-list.component.scss',
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnergySystemsListComponent extends TaxonomyListBase<EnergySystem> {
  private readonly energySystemsService = inject(EnergySystemsService);
  protected readonly i18nPrefix = 'admin.energy_systems';
  /** Template/spec alias for the inherited `entities` signal. */
  protected readonly energySystems = this.entities;

  constructor() {
    super();
    this.initStream();
  }

  protected list(includeInactive: boolean): Observable<Paginated<EnergySystem>> {
    return this.energySystemsService.energySystemsList({
      includeInactive: includeInactive || undefined,
    });
  }
  protected destroyOne(es: EnergySystem): Observable<unknown> {
    return this.energySystemsService.energySystemsDestroy({ id: es.id });
  }
  protected restoreOne(es: EnergySystem): Observable<unknown> {
    return this.energySystemsService.energySystemsPartialUpdate({
      id: es.id,
      includeInactive: true,
      patchedEnergySystemAdminRequest: { is_active: true },
    });
  }
}
