import { KeyValuePipe } from '@angular/common';
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
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { ColorPicker } from 'primeng/colorpicker';
import { DatePicker } from 'primeng/datepicker';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Select } from 'primeng/select';
import { firstValueFrom } from 'rxjs';
import { EventsService } from '../../../api/api/events.service';
import { ProgramsService } from '../../../api/api/programs.service';
import { TeamsService } from '../../../api/api/teams.service';
import { Event } from '../../../api/model/event';
import { PatchedEvent } from '../../../api/model/patched-event';
import { Program } from '../../../api/model/program';

interface FieldErrors {
  [field: string]: string[];
}

function toIsoDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toIsoTime(d: Date | null | undefined): string | null {
  if (!d) return null;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}:00`;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function parseTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = value.match(/^(\d{2}):(\d{2})/);
  if (!m) return null;
  const d = new Date();
  d.setHours(parseInt(m[1], 10), parseInt(m[2], 10), 0, 0);
  return d;
}

function timeRangeValidator(group: AbstractControl): ValidationErrors | null {
  const start = group.get('hour_start')?.value as Date | null;
  const end = group.get('hour_end')?.value as Date | null;
  if (!start || !end) return null;
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = end.getHours() * 60 + end.getMinutes();
  return endMinutes < startMinutes ? { time_range: true } : null;
}

@Component({
  selector: 'app-events-form',
  imports: [
    KeyValuePipe,
    ReactiveFormsModule,
    RouterLink,
    InputText,
    InputNumber,
    Select,
    DatePicker,
    ColorPicker,
    Button,
    Message,
    TranslocoPipe,
  ],
  templateUrl: './events-form.component.html',
  styleUrl: './events-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventsFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly eventsService = inject(EventsService);
  private readonly teamsService = inject(TeamsService);
  private readonly programsService = inject(ProgramsService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly eventId = signal<number | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly availablePrograms = signal<Program[]>([]);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly fieldErrors = signal<FieldErrors | null>(null);

  protected readonly isEditMode = computed(() => this.eventId() !== null);

  protected readonly form = this.fb.nonNullable.group(
    {
      name: ['', [Validators.required, Validators.maxLength(100)]],
      refer_program_id: this.fb.nonNullable.control<number | null>(null, [Validators.required]),
      goal: ['', [Validators.maxLength(100)]],
      date: this.fb.nonNullable.control<Date | null>(null, [Validators.required]),
      hour_start: this.fb.nonNullable.control<Date | null>(null),
      hour_end: this.fb.nonNullable.control<Date | null>(null),
      total: this.fb.nonNullable.control<number>(0, [Validators.min(0)]),
      color: ['#3B82F6', [Validators.maxLength(10)]],
    },
    { validators: [timeRangeValidator] },
  );

  ngOnInit(): void {
    this.loadAvailablePrograms();

    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      const id = Number(idParam);
      if (!Number.isFinite(id)) {
        this.errorMessage.set('events.errors.unknown');
        return;
      }
      this.eventId.set(id);
      this.loadEvent(id);
    } else {
      const programParam = this.route.snapshot.queryParamMap.get('program');
      if (programParam) {
        const pid = Number(programParam);
        if (Number.isFinite(pid)) {
          this.form.patchValue({ refer_program_id: pid });
          this.form.controls.refer_program_id.disable();
        }
      }
    }
  }

  private loadAvailablePrograms(): void {
    this.teamsService
      .teamsList(true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const teamIds = (res.results ?? []).map((t) => t.id);
          this.fetchProgramsForTeams(teamIds);
        },
      });
  }

  private async fetchProgramsForTeams(teamIds: number[]): Promise<void> {
    if (teamIds.length === 0) {
      this.availablePrograms.set([]);
      return;
    }
    const requests = teamIds.map((teamId) =>
      firstValueFrom(
        this.programsService.programsList(
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          teamId,
        ),
      ),
    );
    const responses = await Promise.all(requests);
    const all: Program[] = responses.flatMap((r) => r.results ?? []);
    const dedup = new Map<number, Program>();
    for (const p of all) dedup.set(p.id, p);
    this.availablePrograms.set(Array.from(dedup.values()));
  }

  private loadEvent(id: number): void {
    this.loading.set(true);
    this.eventsService
      .eventsRetrieve(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (e) => {
          this.form.reset({
            name: e.name,
            refer_program_id: e.refer_program?.id ?? null,
            goal: e.goal ?? '',
            date: parseDate(e.date),
            hour_start: parseTime(e.hour_start),
            hour_end: parseTime(e.hour_end),
            total: e.total ?? 0,
            color: e.color || '#3B82F6',
          });
          this.form.controls.refer_program_id.disable();
          this.loading.set(false);
        },
        error: () => {
          this.errorMessage.set('events.errors.unknown');
          this.loading.set(false);
        },
      });
  }

  protected submit(): void {
    if (this.form.invalid) return;
    this.saving.set(true);
    this.errorMessage.set(null);
    this.fieldErrors.set(null);

    const value = this.form.getRawValue();
    const id = this.eventId();

    if (id === null) {
      const createPayload = {
        name: value.name,
        refer_program_id: value.refer_program_id,
        goal: value.goal || null,
        date: toIsoDate(value.date),
        hour_start: toIsoTime(value.hour_start),
        hour_end: toIsoTime(value.hour_end),
        total: value.total,
        color: value.color,
      };
      this.eventsService
        .eventsCreate(createPayload as unknown as Event)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (created) => {
            this.notifySaved();
            this.saving.set(false);
            this.router.navigate(['/events', created.id]);
          },
          error: (err: HttpErrorResponse) => {
            this.applyServerError(err);
            this.saving.set(false);
          },
        });
      return;
    }

    const updatePayload: PatchedEvent = {
      name: value.name,
      refer_program_id: value.refer_program_id ?? undefined,
      goal: value.goal || undefined,
      date: toIsoDate(value.date) ?? undefined,
      hour_start: toIsoTime(value.hour_start) ?? undefined,
      hour_end: toIsoTime(value.hour_end) ?? undefined,
      total: value.total,
      color: value.color,
    };

    this.eventsService
      .eventsPartialUpdate(id, updatePayload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.notifySaved();
          this.saving.set(false);
          this.router.navigate(['/events', id]);
        },
        error: (err: HttpErrorResponse) => {
          this.applyServerError(err);
          this.saving.set(false);
        },
      });
  }

  private notifySaved(): void {
    this.messageService.add({
      severity: 'success',
      summary: this.transloco.translate('common.success'),
      detail: this.transloco.translate('events.form.saved'),
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

    this.errorMessage.set(body?.detail ?? 'events.errors.unknown');
  }
}
