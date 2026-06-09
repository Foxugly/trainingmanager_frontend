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
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { Textarea } from 'primeng/textarea';
import { EnergySegmentsService } from '../../../../api/api/energy-segments.service';
import { EnergySystemsService } from '../../../../api/api/energy-systems.service';
import { EnergySystem } from '../../../../api/model/energy-system';
import { type FieldErrors, extractServerError } from '../../../../shared/forms/notify-error';
import {
  ActiveToggleComponent,
  type ActiveToggleLabels,
} from '../../../../shared/ui/active-toggle/active-toggle.component';
import { FormFooterComponent } from '../../../../shared/ui/form-footer/form-footer.component';
import { MetaFieldComponent } from '../../../../shared/ui/meta-field/meta-field.component';
import { PageHeaderComponent } from '../../../../shared/ui/page-header/page-header.component';
import { StatusBadgeComponent } from '../../../../shared/ui/status-badge/status-badge.component';
import { AriaDescribesDirective } from '../../../../shared/a11y/aria-describes.directive';

@Component({
  selector: 'app-energy-segments-form',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    InputText,
    Textarea,
    Select,
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
    AriaDescribesDirective,
    TranslocoPipe,
  ],
  providers: [ConfirmationService],
  templateUrl: './energy-segments-form.component.html',
  styleUrl: './energy-segments-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnergySegmentsFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(EnergySegmentsService);
  private readonly energySystemsService = inject(EnergySystemsService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly segmentId = signal<number | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly availableEnergySystems = signal<EnergySystem[]>([]);
  protected readonly fieldErrors = signal<FieldErrors | null>(null);
  protected readonly activeValue = signal(true);

  protected readonly patchActive = (id: number, value: boolean) =>
    this.service.energySegmentsPartialUpdate({
      id,
      patchedEnergySegmentAdminRequest: {
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

  protected readonly form = this.fb.nonNullable.group({
    abv: ['', Validators.required],
    energy_system_id: this.fb.control<number | null>(null, Validators.required),
    description_fr: [''],
    description_nl: [''],
    description_en: [''],
    description_it: [''],
    description_es: [''],
  });

  ngOnInit(): void {
    this.energySystemsService
      .energySystemsList()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((res) => this.availableEnergySystems.set(res.results ?? []));

    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      const id = Number(idParam);
      this.segmentId.set(id);
      this.loading.set(true);
      this.service
        .energySegmentsRetrieve({ id, includeInactive: true })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (seg) => {
            this.activeValue.set(seg.is_active ?? true);
            this.form.reset({
              abv: seg.abv,
              energy_system_id: seg.energy_system_id,
              description_fr: seg.description_fr ?? '',
              description_nl: seg.description_nl ?? '',
              description_en: seg.description_en ?? '',
              description_it: seg.description_it ?? '',
              description_es: seg.description_es ?? '',
            });
            this.loading.set(false);
          },
          error: () => {
            this.notifyLoadError();
            this.loading.set(false);
          },
        });
    }
  }

  protected fieldError(name: string): string | null {
    return this.fieldErrors()?.[name]?.join(', ') ?? null;
  }

  protected cancel(): void {
    this.router.navigate(['/admin/energy-segments']);
  }

  protected submit(): void {
    if (this.form.invalid) {
      return;
    }
    this.saving.set(true);
    this.fieldErrors.set(null);

    const value = this.form.getRawValue();
    const id = this.segmentId();

    const payload = {
      abv: value.abv,
      energy_system_id: value.energy_system_id as number,
      description_fr: value.description_fr || null,
      description_nl: value.description_nl || null,
      description_en: value.description_en || null,
      description_it: value.description_it || null,
      description_es: value.description_es || null,
    };

    const request$ = id
      ? this.service.energySegmentsPartialUpdate({
          id,
          patchedEnergySegmentAdminRequest: payload,
        })
      : this.service.energySegmentsCreate({ energySegmentAdminRequest: payload });

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: this.transloco.translate('common.success'),
          detail: this.transloco.translate('admin.energy_segments.actions.saved'),
        });
        this.saving.set(false);
        this.router.navigate(['/admin/energy-segments']);
      },
      error: (err: HttpErrorResponse) => {
        this.applyServerError(err);
        this.saving.set(false);
      },
    });
  }

  private notifyLoadError(): void {
    this.messageService.add({
      severity: 'error',
      summary: this.transloco.translate('common.error'),
      detail: this.transloco.translate('admin.energy_segments.errors.unknown'),
    });
  }

  private applyServerError(err: HttpErrorResponse): void {
    const { fields, detail } = extractServerError(err);
    this.fieldErrors.set(fields);
    if (!fields) {
      this.messageService.add({
        severity: 'error',
        summary: this.transloco.translate('common.error'),
        detail: detail
          ? this.transloco.translate(detail)
          : this.transloco.translate('admin.energy_segments.errors.unknown'),
      });
    }
  }
}
