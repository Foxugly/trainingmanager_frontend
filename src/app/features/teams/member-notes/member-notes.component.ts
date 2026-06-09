import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Tag } from 'primeng/tag';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { Tooltip } from 'primeng/tooltip';
import { TeamsService } from '../../../api/api/teams.service';
import { Note } from '../../../api/model/note';
import { PatchedNote } from '../../../api/model/patched-note';
import { MetaFieldComponent } from '../../../shared/ui/meta-field/meta-field.component';
import { RichEditorComponent } from '../../../shared/ui/rich-editor/rich-editor.component';

/**
 * Reusable per-athlete coach-notes panel.
 *
 * Coach mode (`canEdit = true`): full CRUD — list + rich-text editor with a
 * "visible to athlete" toggle, plus per-note edit/delete (soft-delete server
 * side). Athlete mode (`canEdit = false`): read-only list of the notes the
 * backend already filtered to `visible_to_athlete = true && is_active`.
 *
 * Scoping uses the nested notes endpoints on TeamsService:
 *   teamsMembersNotesList / Create / PartialUpdate / Destroy
 * keyed by (memberPk, teamPk).
 */
@Component({
  selector: 'app-member-notes',
  imports: [
    ReactiveFormsModule,
    DatePipe,
    Button,
    ConfirmDialog,
    RichEditorComponent,
    Tag,
    ToggleSwitch,
    Tooltip,
    MetaFieldComponent,
    TranslocoPipe,
  ],
  templateUrl: './member-notes.component.html',
  styleUrl: './member-notes.component.scss',
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MemberNotesComponent {
  private readonly fb = inject(FormBuilder);
  private readonly teamsService = inject(TeamsService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  readonly teamId = input.required<number>();
  readonly memberId = input.required<number>();
  /** Coach = true (CRUD); athlete = false (read-only). */
  readonly canEdit = input<boolean>(false);

  protected readonly notes = signal<Note[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  /** Id of the note currently being edited, or null when adding a new one. */
  protected readonly editingId = signal<number | null>(null);

  protected readonly isEmpty = computed(() => !this.loading() && this.notes().length === 0);

  protected readonly form = this.fb.nonNullable.group({
    content: [''],
    visible_to_athlete: [false],
  });

  constructor() {
    // Reload whenever the (team, member) scope changes. Reads the input
    // signals so the effect re-runs on every reassignment.
    effect(() => {
      const team = this.teamId();
      const member = this.memberId();
      if (team != null && member != null) {
        this.load(team, member);
      }
    });
  }

  private load(team: number, member: number): void {
    this.loading.set(true);
    this.teamsService
      .teamsMembersNotesList({ memberPk: member, teamPk: team })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.notes.set(res.results ?? []);
          this.loading.set(false);
        },
        error: () => {
          this.notes.set([]);
          this.loading.set(false);
        },
      });
  }

  protected startEdit(note: Note): void {
    this.editingId.set(note.id);
    this.form.reset({
      content: note.content ?? '',
      visible_to_athlete: note.visible_to_athlete ?? false,
    });
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.form.reset({ content: '', visible_to_athlete: false });
  }

  protected submit(): void {
    const value = this.form.getRawValue();
    if (!value.content || !value.content.trim() || this.saving()) {
      return;
    }
    this.saving.set(true);
    const team = this.teamId();
    const member = this.memberId();
    const editingId = this.editingId();

    if (editingId !== null) {
      const payload: PatchedNote = {
        content: value.content,
        visible_to_athlete: value.visible_to_athlete,
      };
      this.teamsService
        .teamsMembersNotesPartialUpdate({
          id: editingId,
          memberPk: member,
          teamPk: team,
          patchedNote: payload,
        })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (updated) => {
            this.notes.update((list) => list.map((n) => (n.id === updated.id ? updated : n)));
            this.afterSave();
          },
          error: (err: HttpErrorResponse) => this.onError(err),
        });
      return;
    }

    const note: Note = {
      content: value.content,
      visible_to_athlete: value.visible_to_athlete,
    } as Note;
    this.teamsService
      .teamsMembersNotesCreate({ memberPk: member, teamPk: team, note })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this.notes.update((list) => [created, ...list]);
          this.afterSave();
        },
        error: (err: HttpErrorResponse) => this.onError(err),
      });
  }

  private afterSave(): void {
    this.saving.set(false);
    this.editingId.set(null);
    this.form.reset({ content: '', visible_to_athlete: false });
    this.messageService.add({
      severity: 'success',
      summary: this.transloco.translate('common.success'),
      detail: this.transloco.translate('notes.saved'),
    });
  }

  private onError(_err: HttpErrorResponse): void {
    this.saving.set(false);
    this.messageService.add({
      severity: 'error',
      summary: this.transloco.translate('common.error'),
      detail: this.transloco.translate('notes.errors.unknown'),
    });
  }

  protected confirmDelete(note: Note): void {
    this.confirmationService.confirm({
      message: this.transloco.translate('notes.delete_confirm'),
      header: this.transloco.translate('common.delete'),
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.deleteNote(note),
    });
  }

  private deleteNote(note: Note): void {
    const team = this.teamId();
    const member = this.memberId();
    this.teamsService
      .teamsMembersNotesDestroy({ id: note.id, memberPk: member, teamPk: team })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.notes.update((list) => list.filter((n) => n.id !== note.id));
          if (this.editingId() === note.id) {
            this.cancelEdit();
          }
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate('notes.deleted'),
          });
        },
        error: (err: HttpErrorResponse) => this.onError(err),
      });
  }
}
