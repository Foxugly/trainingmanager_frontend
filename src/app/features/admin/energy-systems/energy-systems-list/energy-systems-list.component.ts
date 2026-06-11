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
import { EnergySystemsService } from '../../../../api/api/energy-systems.service';
import { EnergySystem } from '../../../../api/model/energy-system';
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
