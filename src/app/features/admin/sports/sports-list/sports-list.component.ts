import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { TableModule } from 'primeng/table';
import { catchError, finalize, of, tap } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { SportsService } from '../../../../api/api/sports.service';
import { PaginatedSportList } from '../../../../api/model/paginated-sport-list';
import { Sport } from '../../../../api/model/sport';

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
export class SportsListComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly sportsService = inject(SportsService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly sports = signal<Sport[]>([]);
  protected readonly loading = signal(false);
  protected readonly includeInactive = signal(false);

  constructor() {
    effect(() => {
      // re-trigger load whenever includeInactive flips
      const include = this.includeInactive();
      this.loadSports(include);
    });
  }

  ngOnInit(): void {
    // initial load handled by the effect above (fires once on init too)
  }

  private loadSports(includeInactive: boolean): void {
    this.loading.set(true);
    const request$ = includeInactive
      ? this.http.get<PaginatedSportList>(`${environment.apiBase}/api/v1/sports/`, {
          params: { include_inactive: 'true' },
        })
      : this.sportsService.sportsList();

    request$
      .pipe(
        tap((res) => this.sports.set(res.results ?? [])),
        catchError(() => {
          this.messageService.add({
            severity: 'error',
            summary: this.transloco.translate('common.error'),
            detail: this.transloco.translate('admin.sports.errors.unknown'),
          });
          this.sports.set([]);
          return of(null);
        }),
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  protected confirmDelete(sport: Sport): void {
    this.confirmationService.confirm({
      header: this.transloco.translate('admin.sports.actions.delete_confirm_title'),
      message: this.transloco.translate('admin.sports.actions.delete_confirm_message'),
      accept: () => this.deleteSport(sport),
    });
  }

  private deleteSport(sport: Sport): void {
    this.sportsService
      .sportsDestroy(sport.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate('admin.sports.actions.deleted'),
          });
          this.loadSports(this.includeInactive());
        },
        error: () => {
          this.messageService.add({
            severity: 'error',
            summary: this.transloco.translate('common.error'),
            detail: this.transloco.translate('admin.sports.errors.unknown'),
          });
        },
      });
  }

  protected restore(sport: Sport): void {
    // PATCH directly via HttpClient with ?include_inactive=true so the backend
    // queryset can find the inactive object (the generated service skips this
    // query param so a plain partialUpdate on an inactive sport returns 404).
    this.http
      .patch(
        `${environment.apiBase}/api/v1/sports/${sport.id}/`,
        { is_active: true },
        { params: { include_inactive: 'true' } },
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate('admin.sports.actions.restored'),
          });
          this.loadSports(this.includeInactive());
        },
        error: () => {
          this.messageService.add({
            severity: 'error',
            summary: this.transloco.translate('common.error'),
            detail: this.transloco.translate('admin.sports.errors.unknown'),
          });
        },
      });
  }

  protected get includeInactiveModel(): boolean {
    return this.includeInactive();
  }
  protected set includeInactiveModel(v: boolean) {
    this.includeInactive.set(v);
  }
}
