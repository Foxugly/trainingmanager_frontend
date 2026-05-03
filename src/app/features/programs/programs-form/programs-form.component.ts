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
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { DatePicker } from 'primeng/datepicker';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Select } from 'primeng/select';
import { Textarea } from 'primeng/textarea';
import { ProgramsService } from '../../../api/api/programs.service';
import { TeamsService } from '../../../api/api/teams.service';
import { PatchedProgram } from '../../../api/model/patched-program';
import { Program } from '../../../api/model/program';
import { Team } from '../../../api/model/team';
import { AuthService } from '../../../core/auth/auth.service';
import { TeamRole, computeTeamRole } from '../../teams/teams-list/teams-list.component';

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

function fromIsoDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

@Component({
  selector: 'app-programs-form',
  imports: [
    KeyValuePipe,
    ReactiveFormsModule,
    RouterLink,
    InputText,
    Textarea,
    InputNumber,
    DatePicker,
    Select,
    Button,
    Message,
    TranslocoPipe,
  ],
  templateUrl: './programs-form.component.html',
  styleUrl: './programs-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgramsFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly programsService = inject(ProgramsService);
  private readonly teamsService = inject(TeamsService);
  private readonly authService = inject(AuthService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly programId = signal<number | null>(null);
  protected readonly program = signal<Program | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly availableTeams = signal<Team[]>([]);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly fieldErrors = signal<FieldErrors | null>(null);

  protected readonly isEditMode = computed(() => this.programId() !== null);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
    team_id: this.fb.nonNullable.control<number | null>(null, [Validators.required]),
    date_start: this.fb.nonNullable.control<Date | null>(null),
    date_end: this.fb.nonNullable.control<Date | null>(null),
    frequency_per_week: this.fb.nonNullable.control<number | null>(null),
    description: [''],
  });

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      const id = Number(idParam);
      if (!Number.isFinite(id)) {
        this.errorMessage.set('programs.errors.unknown');
        return;
      }
      this.programId.set(id);
      this.loadProgram(id);
      return;
    }

    this.loadManagerTeams();

    const teamQ = this.route.snapshot.queryParamMap.get('team');
    if (teamQ) {
      const tid = Number(teamQ);
      if (Number.isFinite(tid)) {
        this.form.patchValue({ team_id: tid });
      }
    }
  }

  private loadProgram(id: number): void {
    this.loading.set(true);
    this.programsService
      .programsRetrieve(id, true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (p) => {
          this.program.set(p);
          this.form.reset({
            name: p.name,
            team_id: p.team?.id ?? null,
            date_start: fromIsoDate(p.date_start),
            date_end: fromIsoDate(p.date_end),
            frequency_per_week: p.frequency_per_week ?? null,
            description: p.description ?? '',
          });
          this.form.controls.team_id.disable();
          this.loading.set(false);
        },
        error: () => {
          this.errorMessage.set('programs.errors.unknown');
          this.loading.set(false);
        },
      });
  }

  private loadManagerTeams(): void {
    const userId = this.authService.currentUser()?.id;
    if (userId == null) return;
    this.teamsService
      .teamsList(true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const teams = (res.results ?? []).filter((t) => {
            const role: TeamRole = computeTeamRole(t, userId);
            return role === 'owner' || role === 'manager';
          });
          this.availableTeams.set(teams);
        },
      });
  }

  protected submit(): void {
    if (this.form.invalid) return;
    this.saving.set(true);
    this.errorMessage.set(null);
    this.fieldErrors.set(null);

    const value = this.form.getRawValue();
    const id = this.programId();

    if (id === null) {
      const createPayload = {
        name: value.name,
        team_id: value.team_id,
        date_start: toIsoDate(value.date_start),
        date_end: toIsoDate(value.date_end),
        frequency_per_week: value.frequency_per_week,
        description: value.description,
      };
      this.programsService
        .programsCreate(createPayload as unknown as Program)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (created) => {
            this.notifySaved('programs.form.saved_create');
            this.saving.set(false);
            this.router.navigate(['/programs', created.id]);
          },
          error: (err: HttpErrorResponse) => {
            this.applyServerError(err);
            this.saving.set(false);
          },
        });
      return;
    }

    const patch: PatchedProgram = {
      name: value.name,
      date_start: toIsoDate(value.date_start),
      date_end: toIsoDate(value.date_end),
      frequency_per_week: value.frequency_per_week,
      description: value.description,
    };
    this.programsService
      .programsPartialUpdate(id, undefined, patch)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.notifySaved('programs.form.saved_edit');
          this.saving.set(false);
          this.router.navigate(['/programs', id]);
        },
        error: (err: HttpErrorResponse) => {
          this.applyServerError(err);
          this.saving.set(false);
        },
      });
  }

  private notifySaved(detailKey: string): void {
    this.messageService.add({
      severity: 'success',
      summary: this.transloco.translate('common.success'),
      detail: this.transloco.translate(detailKey),
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

    this.errorMessage.set(body?.detail ?? 'programs.errors.unknown');
  }
}
