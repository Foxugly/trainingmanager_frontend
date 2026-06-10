import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { TableModule } from 'primeng/table';
import { Observable, catchError, finalize, of, switchMap, tap } from 'rxjs';
import { EnergySystemsService } from '../../../../api/api/energy-systems.service';
import { EnergySystem } from '../../../../api/model/energy-system';

@Component({
  selector: 'app-energy-systems-list',
  imports: [
    FormsModule,
    RouterLink,
    TableModule,
    Checkbox,
    Button,
    ConfirmDialog,
    TranslocoPipe,
  ],
  templateUrl: './energy-systems-list.component.html',
  styleUrl: './energy-systems-list.component.scss',
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnergySystemsListComponent {
  private readonly energySystemsService = inject(EnergySystemsService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly energySystems = signal<EnergySystem[]>([]);
  protected readonly loading = signal(false);
  protected readonly includeInactive = signal(false);

  constructor() {
    // switchMap cancels an in-flight request on rapid toggle (convention > effect()).
    toObservable(this.includeInactive)
      .pipe(
        switchMap((include) => this.fetch(include)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  private fetch(includeInactive: boolean): Observable<unknown> {
    this.loading.set(true);
    return this.energySystemsService
      .energySystemsList({ includeInactive: includeInactive || undefined })
      .pipe(
        tap((res) => this.energySystems.set(res.results ?? [])),
        catchError(() => {
          this.notifyUnknownError();
          this.energySystems.set([]);
          return of(null);
        }),
        finalize(() => this.loading.set(false)),
      );
  }

  private reload(): void {
    this.fetch(this.includeInactive()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
  }

  protected confirmDelete(es: EnergySystem): void {
    this.confirmationService.confirm({
      header: this.transloco.translate('admin.energy_systems.actions.delete_confirm_title'),
      message: this.transloco.translate('admin.energy_systems.actions.delete_confirm_message'),
      accept: () => this.deleteOne(es),
    });
  }

  private deleteOne(es: EnergySystem): void {
    this.energySystemsService
      .energySystemsDestroy({ id: es.id })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate('admin.energy_systems.actions.deleted'),
          });
          this.reload();
        },
        error: () => this.notifyUnknownError(),
      });
  }

  protected restore(es: EnergySystem): void {
    this.energySystemsService
      .energySystemsPartialUpdate({ id: es.id, includeInactive: true, patchedEnergySystemAdminRequest: { is_active: true } })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate('admin.energy_systems.actions.restored'),
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
      detail: this.transloco.translate('admin.energy_systems.errors.unknown'),
    });
  }

  protected get includeInactiveModel(): boolean {
    return this.includeInactive();
  }
  protected set includeInactiveModel(v: boolean) {
    this.includeInactive.set(v);
  }
}
