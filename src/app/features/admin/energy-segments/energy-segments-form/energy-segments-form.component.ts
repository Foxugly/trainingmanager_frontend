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
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Select } from 'primeng/select';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { Textarea } from 'primeng/textarea';
import { EnergySegmentsService } from '../../../../api/api/energy-segments.service';
import { EnergySystemsService } from '../../../../api/api/energy-systems.service';
import { EnergySegmentAdmin } from '../../../../api/model/energy-segment-admin';
import { EnergySystem } from '../../../../api/model/energy-system';
import { PatchedEnergySegmentAdmin } from '../../../../api/model/patched-energy-segment-admin';

interface FieldErrors {
  [field: string]: string[];
}

@Component({
  selector: 'app-energy-segments-form',
  imports: [
    KeyValuePipe,
    ReactiveFormsModule,
    RouterLink,
    InputText,
    Textarea,
    Select,
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
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly fieldErrors = signal<FieldErrors | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    abv: ['', Validators.required],
    energy_system_id: this.fb.control<number | null>(null, Validators.required),
    description_fr: [''],
    description_nl: [''],
    description_en: [''],
    description_it: [''],
    description_es: [''],
    is_active: [true],
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
        .energySegmentsRetrieve(id, true)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (seg) => {
            this.form.reset({
              abv: seg.abv,
              energy_system_id: seg.energy_system_id,
              description_fr: seg.description_fr ?? '',
              description_nl: seg.description_nl ?? '',
              description_en: seg.description_en ?? '',
              description_it: seg.description_it ?? '',
              description_es: seg.description_es ?? '',
              is_active: seg.is_active ?? true,
            });
            this.loading.set(false);
          },
          error: () => {
            this.errorMessage.set('admin.energy_segments.errors.unknown');
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
    const id = this.segmentId();

    const payload = {
      abv: value.abv,
      energy_system_id: value.energy_system_id as number,
      description_fr: value.description_fr || null,
      description_nl: value.description_nl || null,
      description_en: value.description_en || null,
      description_it: value.description_it || null,
      description_es: value.description_es || null,
      is_active: value.is_active,
    };

    const request$ = id
      ? this.service.energySegmentsPartialUpdate(id, true, payload as PatchedEnergySegmentAdmin)
      : this.service.energySegmentsCreate(payload as EnergySegmentAdmin);

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

    this.errorMessage.set(body?.detail ?? 'admin.energy_segments.errors.unknown');
  }
}
