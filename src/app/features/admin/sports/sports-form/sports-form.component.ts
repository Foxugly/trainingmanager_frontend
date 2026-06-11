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
import { ConfirmationService } from 'primeng/api';
import { Button } from 'primeng/button';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { InputText } from 'primeng/inputtext';
import { MultiSelect } from 'primeng/multiselect';
import { Select } from 'primeng/select';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { Tooltip } from 'primeng/tooltip';
import { EnergySystemsService } from '../../../../api/api/energy-systems.service';
import { SportsService } from '../../../../api/api/sports.service';
import { EnergySystem } from '../../../../api/model/energy-system';
import { TrainingTypeEnum } from '../../../../api/model/training-type-enum';
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
  selector: 'app-sports-form',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    InputText,
    MultiSelect,
    Select,
    Button,
    ConfirmDialog,
    Tabs,
    TabList,
    Tab,
    TabPanels,
    TabPanel,
    Tooltip,
    PageHeaderComponent,
    StatusBadgeComponent,
    ActiveToggleComponent,
    MetaFieldComponent,
    FormFooterComponent,
    TranslocoPipe,
  ],
  providers: [ConfirmationService],
  templateUrl: './sports-form.component.html',
  styleUrl: './sports-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SportsFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sportsService = inject(SportsService);
  private readonly energySystemsService = inject(EnergySystemsService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly sportId = signal<number | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly availableEnergySystems = signal<EnergySystem[]>([]);
  protected readonly fieldErrors = signal<FieldErrors | null>(null);
  protected readonly activeValue = signal(true);

  protected readonly patchActive = (id: number, value: boolean) =>
    this.sportsService.sportsPartialUpdate({
      id,
      patchedSportAdminRequest: { is_active: value },
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
      slug: ['', Validators.required],
      energy_systems: [[] as number[]],
      default_training_type: ['structured'],
    },
    { validators: [atLeastOneName] },
  );

  /** Training-type select options, re-translated on language change. */
  protected readonly trainingTypeOptions = computed(() => {
    this.transloco.getActiveLang();
    return [
      {
        label: this.transloco.translate('events.training.type_structured'),
        value: TrainingTypeEnum.Structured,
      },
      {
        label: this.transloco.translate('events.training.type_freeform'),
        value: TrainingTypeEnum.Freeform,
      },
    ];
  });

  ngOnInit(): void {
    // Always load energy systems for the multiselect
    this.energySystemsService
      .energySystemsList()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((res) => this.availableEnergySystems.set(res.results ?? []));

    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      const id = Number(idParam);
      this.sportId.set(id);
      this.loading.set(true);
      this.sportsService
        .sportsRetrieve({ id, includeInactive: true })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (sport) => {
            this.activeValue.set(sport.is_active ?? true);
            this.form.reset({
              name_fr: sport.name_fr ?? '',
              name_nl: sport.name_nl ?? '',
              name_en: sport.name_en ?? '',
              name_it: sport.name_it ?? '',
              name_es: sport.name_es ?? '',
              slug: sport.slug,
              energy_systems: sport.energy_systems ?? [],
              default_training_type:
                (sport.default_training_type as string | undefined) ?? 'structured',
            });
            this.loading.set(false);
          },
          error: () => {
            this.toast.error('admin.sports.errors.unknown');
            this.loading.set(false);
          },
        });
    }
  }

  protected fieldError(name: string): string | null {
    return this.fieldErrors()?.[name]?.join(', ') ?? null;
  }

  protected cancel(): void {
    this.router.navigate(['/admin/sports']);
  }

  protected submit(): void {
    if (this.form.invalid) {
      return;
    }
    this.saving.set(true);
    this.fieldErrors.set(null);

    const value = this.form.getRawValue();
    const id = this.sportId();

    const payload = {
      name_fr: value.name_fr || null,
      name_nl: value.name_nl || null,
      name_en: value.name_en || null,
      name_it: value.name_it || null,
      name_es: value.name_es || null,
      slug: value.slug,
      energy_systems: value.energy_systems,
      default_training_type: value.default_training_type as TrainingTypeEnum,
    };

    const request$ = id
      ? this.sportsService.sportsPartialUpdate({ id, patchedSportAdminRequest: payload })
      : this.sportsService.sportsCreate({ sportAdminRequest: payload });

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.toast.success('admin.sports.actions.saved');
        this.saving.set(false);
        this.router.navigate(['/admin/sports']);
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
      this.toast.error(detail ?? 'admin.sports.errors.unknown');
    }
  }
}
