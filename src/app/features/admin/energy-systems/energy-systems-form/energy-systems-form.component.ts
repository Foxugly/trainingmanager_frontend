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
import { EnergySystemsService } from '../../../../api/api/energy-systems.service';
import { EnergySystemAdmin } from '../../../../api/model/energy-system-admin';
import { PatchedEnergySystemAdmin } from '../../../../api/model/patched-energy-system-admin';

interface FieldErrors {
  [field: string]: string[];
}

@Component({
  selector: 'app-energy-systems-form',
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
  templateUrl: './energy-systems-form.component.html',
  styleUrl: './energy-systems-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnergySystemsFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly energySystemsService = inject(EnergySystemsService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly esId = signal<number | null>(null);
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
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      const id = Number(idParam);
      this.esId.set(id);
      this.loading.set(true);
      this.energySystemsService
        .energySystemsRetrieve(id, true)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (es) => {
            this.form.reset({
              name_fr: es.name_fr ?? '',
              name_nl: es.name_nl ?? '',
              name_en: es.name_en ?? '',
              name_it: es.name_it ?? '',
              name_es: es.name_es ?? '',
              is_active: es.is_active ?? true,
            });
            this.loading.set(false);
          },
          error: () => {
            this.errorMessage.set('admin.energy_systems.errors.unknown');
            this.loading.set(false);
          },
        });
    }
  }

  protected submit(): void {
    if (this.form.invalid) {
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    this.fieldErrors.set(null);

    const value = this.form.getRawValue();
    const id = this.esId();

    const payload = {
      name_fr: value.name_fr || null,
      name_nl: value.name_nl || null,
      name_en: value.name_en || null,
      name_it: value.name_it || null,
      name_es: value.name_es || null,
      is_active: value.is_active,
    };

    const request$ = id
      ? this.energySystemsService.energySystemsPartialUpdate(
          id,
          true,
          payload as PatchedEnergySystemAdmin,
        )
      : this.energySystemsService.energySystemsCreate(payload as EnergySystemAdmin);

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: this.transloco.translate('common.success'),
          detail: this.transloco.translate('admin.energy_systems.actions.saved'),
        });
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

    this.errorMessage.set(body?.detail ?? 'admin.energy_systems.errors.unknown');
  }
}
