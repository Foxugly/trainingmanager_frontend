import { KeyValuePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { SportsService } from '../../../../api/api/sports.service';
import { ModalityAdmin } from '../../../../api/model/modality-admin';
import { PatchedModalityAdmin } from '../../../../api/model/patched-modality-admin';
import { Sport } from '../../../../api/model/sport';

interface FieldErrors {
  [field: string]: string[];
}

@Component({
  selector: 'app-modalities-form',
  imports: [
    KeyValuePipe,
    ReactiveFormsModule,
    RouterLink,
    InputText,
    Checkbox,
    Button,
    Message,
    Tabs,
    TabList,
    Tab,
    TabPanels,
    TabPanel,
    TranslocoPipe,
  ],
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
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly fieldErrors = signal<FieldErrors | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    name_fr: [''],
    name_nl: [''],
    name_en: [''],
    name_it: [''],
    name_es: [''],
    is_active: [true],
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
      .sportsRetrieve(sportId, true)
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
          }),
      });

    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      const modalityId = Number(idParam);
      this.modalityId.set(modalityId);
      this.loading.set(true);
      this.sportsService
        .sportsModalitiesRetrieve(modalityId, sportId, true)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (m) => {
            this.form.reset({
              name_fr: m.name_fr ?? '',
              name_nl: m.name_nl ?? '',
              name_en: m.name_en ?? '',
              name_it: m.name_it ?? '',
              name_es: m.name_es ?? '',
              is_active: m.is_active ?? true,
            });
            this.loading.set(false);
          },
          error: () => {
            this.errorMessage.set('admin.modalities.errors.unknown');
            this.loading.set(false);
          },
        });
    }
  }

  protected submit(): void {
    if (this.form.invalid) return;
    const sportId = this.sportId();
    if (sportId == null) return;

    this.saving.set(true);
    this.errorMessage.set(null);
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
      is_active: value.is_active,
    };

    const request$ = modalityId
      ? this.sportsService.sportsModalitiesPartialUpdate(
          modalityId,
          sportId,
          true,
          payload as PatchedModalityAdmin,
        )
      : this.sportsService.sportsModalitiesCreate(sportId, payload as ModalityAdmin);

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

  private applyServerError(err: HttpErrorResponse): void {
    const body = err?.error as
      | { code?: string; detail?: string; fields?: FieldErrors }
      | null
      | undefined;

    if (body?.fields && Object.keys(body.fields).length > 0) {
      this.fieldErrors.set(body.fields);
      return;
    }

    if (body && typeof body === 'object') {
      const fieldEntries: FieldErrors = {};
      for (const [key, value] of Object.entries(body)) {
        if (key === 'code' || key === 'detail' || key === 'fields') continue;
        if (Array.isArray(value)) {
          fieldEntries[key] = value.filter((m): m is string => typeof m === 'string');
        }
      }
      if (Object.keys(fieldEntries).length > 0) {
        this.fieldErrors.set(fieldEntries);
        return;
      }
    }

    this.errorMessage.set(body?.detail ?? 'admin.modalities.errors.unknown');
  }
}
