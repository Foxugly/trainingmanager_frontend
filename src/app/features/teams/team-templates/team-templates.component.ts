import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ConfirmationService } from 'primeng/api';
import { Button } from 'primeng/button';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { DatePicker } from 'primeng/datepicker';
import { Dialog } from 'primeng/dialog';
import { Select } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { EventTemplatesService } from '../../../api/api/event-templates.service';
import { ProgramsService } from '../../../api/api/programs.service';
import { EventTemplate } from '../../../api/model/event-template';
import { Program } from '../../../api/model/program';
import { ToastService } from '../../../core/notifications/toast.service';
import { loadOn } from '../../../shared/data/load-on';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';

/**
 * Manager-only session-templates tab: list the team's reusable templates,
 * instantiate one onto a program + date (creating a new Event, then navigating
 * to it), or delete one.
 */
@Component({
  selector: 'app-team-templates',
  imports: [
    FormsModule,
    TableModule,
    Button,
    Dialog,
    Select,
    DatePicker,
    ConfirmDialog,
    TranslocoPipe,
    EmptyStateComponent,
  ],
  templateUrl: './team-templates.component.html',
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamTemplatesComponent {
  private readonly templatesService = inject(EventTemplatesService);
  private readonly programsService = inject(ProgramsService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly teamId = input.required<number>();

  private readonly state = loadOn(
    () => this.teamId(),
    (id) => this.templatesService.eventTemplatesList({ team: id }),
    this.destroyRef,
  );

  protected readonly templates = computed<EventTemplate[]>(() => this.state.data()?.results ?? []);
  protected readonly loading = this.state.loading;
  protected readonly error = this.state.error;

  // Instantiate dialog state.
  protected readonly dialogVisible = signal(false);
  protected readonly selected = signal<EventTemplate | null>(null);
  protected readonly programs = signal<Program[]>([]);
  protected readonly programId = signal<number | null>(null);
  protected readonly date = signal<Date | null>(null);
  protected readonly instantiating = signal(false);

  protected openInstantiate(tpl: EventTemplate): void {
    this.selected.set(tpl);
    this.programId.set(null);
    this.date.set(new Date());
    this.dialogVisible.set(true);
    // Load the team's active programs for the picker (once per open).
    this.programsService
      .programsList({ team: this.teamId() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => this.programs.set(res.results ?? []),
        error: () => this.toast.error(),
      });
  }

  protected instantiate(): void {
    const tpl = this.selected();
    const program = this.programId();
    const date = this.date();
    if (!tpl || program === null || !date || this.instantiating()) return;
    this.instantiating.set(true);
    const iso = `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
    this.templatesService
      .eventTemplatesInstantiateCreate({
        id: tpl.id,
        instantiateTemplateRequestRequest: { refer_program: program, date: iso },
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (event) => {
          this.toast.success('events.templates.instantiated');
          this.instantiating.set(false);
          this.dialogVisible.set(false);
          this.router.navigate(['/events', event.id]);
        },
        error: () => {
          this.toast.error();
          this.instantiating.set(false);
        },
      });
  }

  protected confirmDelete(tpl: EventTemplate): void {
    this.confirm.confirm({
      header: this.transloco.translate('events.templates.delete_confirm_title'),
      message: this.transloco.translate('events.templates.delete_confirm_message'),
      accept: () => {
        this.templatesService
          .eventTemplatesDestroy({ id: tpl.id })
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: () => {
              this.toast.success('events.templates.deleted');
              this.state.reload();
            },
            error: () => this.toast.error(),
          });
      },
    });
  }
}
