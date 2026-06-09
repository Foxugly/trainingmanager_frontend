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
export class EnergySystemsListComponent implements OnInit {
  private readonly energySystemsService = inject(EnergySystemsService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly energySystems = signal<EnergySystem[]>([]);
  protected readonly loading = signal(false);
  protected readonly includeInactive = signal(false);

  constructor() {
    effect(() => {
      const include = this.includeInactive();
      this.load(include);
    });
  }

  ngOnInit(): void {
    // initial load handled by the effect (fires once on init too)
  }

  private load(includeInactive: boolean): void {
    this.loading.set(true);
    this.energySystemsService
      .energySystemsList({ includeInactive: includeInactive || undefined })
      .pipe(
        tap((res) => this.energySystems.set(res.results ?? [])),
        catchError(() => {
          this.messageService.add({
            severity: 'error',
            summary: this.transloco.translate('common.error'),
            detail: this.transloco.translate('admin.energy_systems.errors.unknown'),
          });
          this.energySystems.set([]);
          return of(null);
        }),
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
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
          this.load(this.includeInactive());
        },
        error: () => this.notifyUnknownError(),
      });
  }

  protected restore(es: EnergySystem): void {
    this.energySystemsService
      .energySystemsPartialUpdate({ id: es.id, includeInactive: true, patchedEnergySystemAdmin: { is_active: true } })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate('admin.energy_systems.actions.restored'),
          });
          this.load(this.includeInactive());
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
