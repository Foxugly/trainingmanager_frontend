import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ConfirmationService } from 'primeng/api';
import { Button } from 'primeng/button';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { InputText } from 'primeng/inputtext';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { EnergySystemsService } from '../../../../api/api/energy-systems.service';
import { ToastService } from '../../../../core/notifications/toast.service';
import { atLeastOneName } from '../../../../shared/forms/at-least-one-name.validator';
import { type FieldErrors, extractServerError } from '../../../../shared/forms/notify-error';
import {
  ActiveToggleComponent,
  type ActiveToggleLabels,
} from '../../../../shared/ui/active-toggle/active-toggle.component';
import { FormFooterComponent } from '../../../../shared/ui/form-footer/form-footer.component';
import { MetaFieldComponent } from '../../../../shared/ui/meta-field/meta-field.component';
import { PageHeaderComponent } from '../../../../shared/ui/page-header/page-header.component';
import { StatusBadgeComponent } from '../../../../shared/ui/status-badge/status-badge.component';

@Component({
  selector: 'app-energy-systems-form',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    InputText,
    Button,
    ConfirmDialog,
    Tabs,
    TabList,
    Tab,
    TabPanels,
    TabPanel,
    PageHeaderComponent,
    StatusBadgeComponent,
    ActiveToggleComponent,
    MetaFieldComponent,
    FormFooterComponent,
    TranslocoPipe,
  ],
  providers: [ConfirmationService],
  templateUrl: './energy-systems-form.component.html',
  styleUrl: './energy-systems-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnergySystemsFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly energySystemsService = inject(EnergySystemsService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly esId = signal<number | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly fieldErrors = signal<FieldErrors | null>(null);
  protected readonly activeValue = signal(true);

  protected readonly patchActive = (id: number, value: boolean) =>
    this.energySystemsService.energySystemsPartialUpdate({
      id,
      patchedEnergySystemAdminRequest: {
        is_active: value,
      },
    });

  protected readonly activeLabels = computed<ActiveToggleLabels>(() => ({
    active: this.transloco.translate('common.active'),
    inactive: this.transloco.translate('common.inactive'),
    confirm: this.transloco.translate('common.confirm_deactivate'),
    errorSummary: this.transloco.translate('common.error'),
    errorDetail: this.transloco.translate('common.update_failed'),
  }));

  protected readonly form = this.fb.nonNullable.group(
    {
      name_fr: [''],
      name_nl: [''],
      name_en: [''],
      name_it: [''],
      name_es: [''],
    },
    { validators: [atLeastOneName] },
  );

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      const id = Number(idParam);
      this.esId.set(id);
      this.loading.set(true);
      this.energySystemsService
        .energySystemsRetrieve({ id, includeInactive: true })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (es) => {
            this.activeValue.set(es.is_active ?? true);
            this.form.reset({
              name_fr: es.name_fr ?? '',
              name_nl: es.name_nl ?? '',
              name_en: es.name_en ?? '',
              name_it: es.name_it ?? '',
              name_es: es.name_es ?? '',
            });
            this.loading.set(false);
          },
          error: () => {
            this.toast.error('admin.energy_systems.errors.unknown');
            this.loading.set(false);
          },
        });
    }
  }

  protected fieldError(name: string): string | null {
    return this.fieldErrors()?.[name]?.join(', ') ?? null;
  }

  protected cancel(): void {
    this.router.navigate(['/admin/energy-systems']);
  }

  protected submit(): void {
    if (this.form.invalid) {
      return;
    }
    this.saving.set(true);
    this.fieldErrors.set(null);

    const value = this.form.getRawValue();
    const id = this.esId();

    const payload = {
      name_fr: value.name_fr || null,
      name_nl: value.name_nl || null,
      name_en: value.name_en || null,
      name_it: value.name_it || null,
      name_es: value.name_es || null,
    };

    const request$ = id
      ? this.energySystemsService.energySystemsPartialUpdate({
          id,
          patchedEnergySystemAdminRequest: payload,
        })
      : this.energySystemsService.energySystemsCreate({
          energySystemAdminRequest: payload,
        });

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.toast.success('admin.energy_systems.actions.saved');
        this.saving.set(false);
        this.router.navigate(['/admin/energy-systems']);
      },
      error: (err: HttpErrorResponse) => {
        this.applyServerError(err);
        this.saving.set(false);
      },
    });
  }

  private applyServerError(err: HttpErrorResponse): void {
    const { fields, detail } = extractServerError(err);
    this.fieldErrors.set(fields);
    if (!fields) {
      this.toast.error(detail ?? 'admin.energy_systems.errors.unknown');
    }
  }
}
