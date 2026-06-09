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
import { ConfirmationService, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { InputText } from 'primeng/inputtext';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { EMPTY, Observable } from 'rxjs';
import { SportsService } from '../../../../api/api/sports.service';
import { Sport } from '../../../../api/model/sport';
import { TrainingTypeEnum } from '../../../../api/model/training-type-enum';
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
  selector: 'app-modalities-form',
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
  templateUrl: './modalities-form.component.html',
  styleUrl: './modalities-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalitiesFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sportsService = inject(SportsService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly sportId = signal<number | null>(null);
  protected readonly modalityId = signal<number | null>(null);
  protected readonly sport = signal<Sport | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly fieldErrors = signal<FieldErrors | null>(null);
  protected readonly activeValue = signal(true);

  protected readonly patchActive = (id: number, value: boolean): Observable<unknown> => {
    const sportId = this.sportId();
    if (sportId == null) return EMPTY;
    return this.sportsService.sportsModalitiesPartialUpdate({
      id,
      sportPk: sportId,
      includeInactive: true,
      patchedModalityAdminRequest: {
        is_active: value,
      },
    });
  };

  protected readonly pageTitle = computed<string>(() => {
    const base = this.transloco.translate(
      this.modalityId() ? 'admin.modalities.form.edit_title' : 'admin.modalities.form.new_title',
    );
    const s = this.sport();
    return s ? `${base} — ${s.name}` : base;
  });

  protected readonly activeLabels = computed<ActiveToggleLabels>(() => ({
    active: this.transloco.translate('common.active'),
    inactive: this.transloco.translate('common.inactive'),
    confirm: this.transloco.translate('common.confirm_deactivate'),
    errorSummary: this.transloco.translate('common.error'),
    errorDetail: this.transloco.translate('common.update_failed'),
  }));

  protected readonly form = this.fb.nonNullable.group({
    name_fr: [''],
    name_nl: [''],
    name_en: [''],
    name_it: [''],
    name_es: [''],
  });

  ngOnInit(): void {
    const sportIdParam = this.route.snapshot.paramMap.get('sportId');
    const sportId = sportIdParam ? Number(sportIdParam) : NaN;
    if (!Number.isFinite(sportId)) {
      this.router.navigate(['/admin/modalities']);
      return;
    }
    this.sportId.set(sportId);

    this.sportsService
      .sportsRetrieve({ id: sportId, includeInactive: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (s) =>
          this.sport.set({
            id: s.id,
            name: s.name_fr || s.name_en || s.slug,
            slug: s.slug,
            is_active: s.is_active ?? true,
            energy_systems: s.energy_systems ?? [],
            created_at: s.created_at,
            default_training_type: TrainingTypeEnum.Structured,
          }),
      });

    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      const modalityId = Number(idParam);
      this.modalityId.set(modalityId);
      this.loading.set(true);
      this.sportsService
        .sportsModalitiesRetrieve({ id: modalityId, sportPk: sportId, includeInactive: true })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (m) => {
            this.activeValue.set(m.is_active ?? true);
            this.form.reset({
              name_fr: m.name_fr ?? '',
              name_nl: m.name_nl ?? '',
              name_en: m.name_en ?? '',
              name_it: m.name_it ?? '',
              name_es: m.name_es ?? '',
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
    this.router.navigate(['/admin/sports', this.sportId(), 'modalities']);
  }

  protected submit(): void {
    if (this.form.invalid) return;
    const sportId = this.sportId();
    if (sportId == null) return;

    this.saving.set(true);
    this.fieldErrors.set(null);

    const value = this.form.getRawValue();
    const modalityId = this.modalityId();

    const payload = {
      name_fr: value.name_fr || null,
      name_nl: value.name_nl || null,
      name_en: value.name_en || null,
      name_it: value.name_it || null,
      name_es: value.name_es || null,
      sport: sportId,
    };

    const request$ = modalityId
      ? this.sportsService.sportsModalitiesPartialUpdate({
          id: modalityId,
          sportPk: sportId,
          patchedModalityAdminRequest: payload,
        })
      : this.sportsService.sportsModalitiesCreate({
          sportPk: sportId,
          modalityAdminRequest: payload,
        });

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: this.transloco.translate('common.success'),
          detail: this.transloco.translate('admin.modalities.actions.saved'),
        });
        this.saving.set(false);
        this.router.navigate(['/admin/sports', sportId, 'modalities']);
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
      detail: this.transloco.translate('admin.modalities.errors.unknown'),
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
          : this.transloco.translate('admin.modalities.errors.unknown'),
      });
    }
  }
}
