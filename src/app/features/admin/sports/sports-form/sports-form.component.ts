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
import { MultiSelect } from 'primeng/multiselect';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { EnergySystemsService } from '../../../../api/api/energy-systems.service';
import { SportsService } from '../../../../api/api/sports.service';
import { EnergySystem } from '../../../../api/model/energy-system';
import { PatchedSportAdmin } from '../../../../api/model/patched-sport-admin';
import { SportAdmin } from '../../../../api/model/sport-admin';

interface FieldErrors {
  [field: string]: string[];
}

@Component({
  selector: 'app-sports-form',
  imports: [
    KeyValuePipe,
    ReactiveFormsModule,
    RouterLink,
    InputText,
    MultiSelect,
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
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly sportId = signal<number | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly availableEnergySystems = signal<EnergySystem[]>([]);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly fieldErrors = signal<FieldErrors | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    name_fr: [''],
    name_nl: [''],
    name_en: [''],
    name_it: [''],
    name_es: [''],
    slug: ['', Validators.required],
    energy_systems: [[] as number[]],
    is_active: [true],
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
        .sportsRetrieve(id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (sport) => {
            this.form.reset({
              name_fr: sport.name_fr ?? '',
              name_nl: sport.name_nl ?? '',
              name_en: sport.name_en ?? '',
              name_it: sport.name_it ?? '',
              name_es: sport.name_es ?? '',
              slug: sport.slug,
              energy_systems: sport.energy_systems ?? [],
              is_active: sport.is_active ?? true,
            });
            this.loading.set(false);
          },
          error: () => {
            this.errorMessage.set('admin.sports.errors.unknown');
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
    const id = this.sportId();

    const payload = {
      name_fr: value.name_fr || null,
      name_nl: value.name_nl || null,
      name_en: value.name_en || null,
      name_it: value.name_it || null,
      name_es: value.name_es || null,
      slug: value.slug,
      energy_systems: value.energy_systems,
      is_active: value.is_active,
    };

    const request$ = id
      ? this.sportsService.sportsPartialUpdate(id, payload as PatchedSportAdmin)
      : this.sportsService.sportsCreate(payload as unknown as SportAdmin);

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: this.transloco.translate('common.success'),
          detail: this.transloco.translate('admin.sports.actions.saved'),
        });
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

    this.errorMessage.set(body?.detail ?? 'admin.sports.errors.unknown');
  }
}
