import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ConfirmationService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { TableModule } from 'primeng/table';
import { Observable } from 'rxjs';
import { SportsService } from '../../../../api/api/sports.service';
import { Sport } from '../../../../api/model/sport';
import { Paginated, TaxonomyListBase } from '../../shared/taxonomy-list.base';

@Component({
  selector: 'app-sports-list',
  imports: [
    FormsModule,
    RouterLink,
    TableModule,
    Checkbox,
    Button,
    ConfirmDialog,
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
