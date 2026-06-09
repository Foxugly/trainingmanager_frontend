import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamsService } from '../../../api/api/teams.service';
import { Note } from '../../../api/model/note';
import { MemberNotesComponent } from './member-notes.component';

function makeNote(over: Partial<Note> = {}): Note {
  return {
    id: 1,
    team: 7,
    member: 3,
    author: 9,
    author_username: 'coach',
    content: '<p>Bonjour</p>',
    visible_to_athlete: false,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

interface ProtectedFields {
  notes(): Note[];
  loading(): boolean;
  saving(): boolean;
  editingId(): number | null;
  isEmpty(): boolean;
  form: {
    patchValue: (v: Partial<{ content: string; visible_to_athlete: boolean }>) => void;
    reset: (v?: unknown) => void;
  };
  startEdit(note: Note): void;
  cancelEdit(): void;
  submit(): void;
  confirmDelete(note: Note): void;
}

describe('MemberNotesComponent', () => {
  let fixture: ComponentFixture<MemberNotesComponent>;
  let component: MemberNotesComponent;
  let teamsMock: {
    teamsMembersNotesList: ReturnType<typeof vi.fn>;
    teamsMembersNotesCreate: ReturnType<typeof vi.fn>;
    teamsMembersNotesPartialUpdate: ReturnType<typeof vi.fn>;
    teamsMembersNotesDestroy: ReturnType<typeof vi.fn>;
  };
  let confirmationService: ConfirmationService;

  const access = (c: MemberNotesComponent) => c as unknown as ProtectedFields;

  async function setup(canEdit = true, listResult: Note[] = [makeNote()]) {
    TestBed.resetTestingModule();
    teamsMock = {
      teamsMembersNotesList: vi.fn().mockReturnValue(of({ count: listResult.length, results: listResult })),
      teamsMembersNotesCreate: vi.fn(),
      teamsMembersNotesPartialUpdate: vi.fn(),
      teamsMembersNotesDestroy: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [
        MemberNotesComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideHttpClient(),
        provideNoopAnimations(),
        MessageService,
        ConfirmationService,
        { provide: TeamsService, useValue: teamsMock },
      ],
    })
      .overrideComponent(MemberNotesComponent, { set: { template: '', imports: [] } })
      .compileComponents();

    fixture = TestBed.createComponent(MemberNotesComponent);
    component = fixture.componentInstance;
    confirmationService = fixture.debugElement.injector.get(ConfirmationService);
    fixture.componentRef.setInput('teamId', 7);
    fixture.componentRef.setInput('memberId', 3);
    fixture.componentRef.setInput('canEdit', canEdit);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await setup();
  });

  it('loads the notes for the (member, team) scope on init', () => {
    expect(teamsMock.teamsMembersNotesList).toHaveBeenCalledWith({ memberPk: 3, teamPk: 7 });
    expect(access(component).notes().length).toBe(1);
    expect(access(component).loading()).toBe(false);
  });

  it('reports empty state when no notes are returned', async () => {
    await setup(false, []);
    expect(access(component).isEmpty()).toBe(true);
  });

  it('create prepends the new note and sends the visible_to_athlete flag', () => {
    const created = makeNote({ id: 2, content: '<p>Nouvelle</p>', visible_to_athlete: true });
    teamsMock.teamsMembersNotesCreate.mockReturnValue(of(created));
    access(component).form.patchValue({ content: '<p>Nouvelle</p>', visible_to_athlete: true });

    access(component).submit();

    expect(teamsMock.teamsMembersNotesCreate).toHaveBeenCalledWith({
      memberPk: 3,
      teamPk: 7,
      note: expect.objectContaining({ content: '<p>Nouvelle</p>', visible_to_athlete: true }),
    });
    expect(access(component).notes()[0].id).toBe(2);
    expect(access(component).notes().length).toBe(2);
  });

  it('does not submit when content is blank', () => {
    access(component).form.patchValue({ content: '   ' });
    access(component).submit();
    expect(teamsMock.teamsMembersNotesCreate).not.toHaveBeenCalled();
  });

  it('edit calls partialUpdate with the toggled visibility and replaces the note in the list', () => {
    const existing = makeNote();
    const updated = makeNote({ visible_to_athlete: true, content: '<p>MAJ</p>' });
    teamsMock.teamsMembersNotesPartialUpdate.mockReturnValue(of(updated));

    access(component).startEdit(existing);
    expect(access(component).editingId()).toBe(existing.id);
    access(component).form.patchValue({ content: '<p>MAJ</p>', visible_to_athlete: true });
    access(component).submit();

    expect(teamsMock.teamsMembersNotesPartialUpdate).toHaveBeenCalledWith({
      id: existing.id,
      memberPk: 3,
      teamPk: 7,
      patchedNote: expect.objectContaining({ content: '<p>MAJ</p>', visible_to_athlete: true }),
    });
    expect(access(component).notes()[0].visible_to_athlete).toBe(true);
    expect(access(component).editingId()).toBeNull();
  });

  it('confirmDelete → accept removes the note via destroy (soft-delete)', () => {
    teamsMock.teamsMembersNotesDestroy.mockReturnValue(of(null));
    vi.spyOn(confirmationService, 'confirm').mockImplementation((opts) => {
      opts.accept?.();
      return confirmationService;
    });

    access(component).confirmDelete(makeNote());

    expect(teamsMock.teamsMembersNotesDestroy).toHaveBeenCalledWith({ id: 1, memberPk: 3, teamPk: 7 });
    expect(access(component).notes().length).toBe(0);
  });

  it('keeps the list intact when create fails', () => {
    teamsMock.teamsMembersNotesCreate.mockReturnValue(
      throwError(() => ({ status: 500 })),
    );
    access(component).form.patchValue({ content: '<p>x</p>' });
    access(component).submit();
    expect(access(component).notes().length).toBe(1);
    expect(access(component).saving()).toBe(false);
  });
});
