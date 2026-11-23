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
import { SportsService } from '../../../../api/api/sports.service';
import { Sport } from '../../../../api/model/sport';
import { StatusBadgeComponent } from '../../../../shared/ui/status-badge/status-badge.component';
import { Paginated, TaxonomyListBase } from '../../shared/taxonomy-list.base';

@Component({
  selector: 'app-sports-list',
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
  templateUrl: './sports-list.component.html',
  styleUrl: './sports-list.component.scss',
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SportsListComponent extends TaxonomyListBase<Sport> {
  private readonly sportsService = inject(SportsService);
  protected readonly i18nPrefix = 'admin.sports';
  /** Template/spec alias for the inherited `entities` signal. */
  protected readonly sports = this.entities;

  constructor() {
    super();
    this.initStream();
  }

  protected list(includeInactive: boolean): Observable<Paginated<Sport>> {
    return this.sportsService.sportsList({ includeInactive: includeInactive || undefined });
  }
  protected destroyOne(sport: Sport): Observable<unknown> {
    return this.sportsService.sportsDestroy({ id: sport.id });
  }
  protected restoreOne(sport: Sport): Observable<unknown> {
    return this.sportsService.sportsPartialUpdate({
      id: sport.id,
      includeInactive: true,
      patchedSportAdminRequest: { is_active: true },
    });
  }
}
