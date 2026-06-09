import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamsService } from '../../../api/api/teams.service';
import { Place } from '../../../api/model/place';
import { TeamSlotsEditorComponent } from './team-slots-editor.component';

interface SlotRow {
  id: number;
  weekday: number;
  hour_start: string;
  hour_end: string;
  place: { id: number; name: string } | null;
}

interface Protected {
  slots: {
    length: number;
    at(i: number): { patchValue(v: unknown): void; controls: { place_id: { value: number | null } } };
  };
  addSlot(): void;
  removeSlot(i: number): void;
  editSlot(i: number): void;
  confirmSlot(i: number): void;
  isSlotEditing(i: number): boolean;
  slotStart(i: number): string;
  slotEnd(i: number): string;
  slotHasTimeError(i: number): boolean;
}

describe('TeamSlotsEditorComponent', () => {
  let fixture: ComponentFixture<TeamSlotsEditorComponent>;
  let component: TeamSlotsEditorComponent;
  let teamsMock: {
    teamsTrainingSlotsList: ReturnType<typeof vi.fn>;
    teamsTrainingSlotsCreate: ReturnType<typeof vi.fn>;
    teamsTrainingSlotsPartialUpdate: ReturnType<typeof vi.fn>;
    teamsTrainingSlotsDestroy: ReturnType<typeof vi.fn>;
  };
  let messageMock: { add: ReturnType<typeof vi.fn> };
  const access = (c: TeamSlotsEditorComponent) => c as unknown as Protected;

  function fillSlot(i: number, weekday = 0, place_id: number | null = null): void {
    const start = new Date();
    start.setHours(18, 0, 0, 0);
    const end = new Date();
    end.setHours(19, 30, 0, 0);
    access(component).slots.at(i).patchValue({ weekday, hour_start: start, hour_end: end, place_id });
  }

  async function setup(
    opts: { slots?: SlotRow[]; places?: Place[]; defaultPlaceId?: number | null } = {},
  ) {
    TestBed.resetTestingModule();
    const echo = (id: number, b: { place_id?: number | null }) => ({
      id,
      ...b,
      place: b.place_id != null ? { id: b.place_id, name: 'X' } : null,
    });
    teamsMock = {
      teamsTrainingSlotsList: vi.fn().mockReturnValue(of(opts.slots ?? [])),
      teamsTrainingSlotsCreate: vi
        .fn()
        .mockImplementation((p: { trainingSlot: { place_id?: number | null } }) =>
          of(echo(100, p.trainingSlot)),
        ),
      teamsTrainingSlotsPartialUpdate: vi
        .fn()
        .mockImplementation((p: { id: number; patchedTrainingSlot: { place_id?: number | null } }) =>
          of(echo(p.id, p.patchedTrainingSlot)),
        ),
      teamsTrainingSlotsDestroy: vi.fn().mockReturnValue(of(undefined)),
    };
    messageMock = { add: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [
        TeamSlotsEditorComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        { provide: TeamsService, useValue: teamsMock },
        { provide: MessageService, useValue: messageMock },
        // Auto-accept the delete confirmation dialog.
        {
          provide: ConfirmationService,
          useValue: { confirm: vi.fn().mockImplementation((o: { accept?: () => void }) => o.accept?.()) },
        },
      ],
    })
      .overrideComponent(TeamSlotsEditorComponent, { set: { template: '', imports: [] } })
      .compileComponents();

    fixture = TestBed.createComponent(TeamSlotsEditorComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('teamId', 5);
    fixture.componentRef.setInput('places', opts.places ?? []);
    fixture.componentRef.setInput('defaultPlaceId', opts.defaultPlaceId ?? null);
    fixture.detectChanges(); // runs the effect → loadSlots
    return fixture;
  }

  beforeEach(() => setup());

  it('loads the team weekly slots on init', () => {
    expect(teamsMock.teamsTrainingSlotsList).toHaveBeenCalledWith({ teamPk: 5 });
  });

  it('hydrates existing slot rows from the list response', async () => {
    await setup({ slots: [{ id: 7, weekday: 1, hour_start: '18:00', hour_end: '19:30', place: null }] });
    expect(access(component).slots.length).toBe(1);
    expect(access(component).isSlotEditing(0)).toBe(false);
    expect(access(component).slotStart(0)).toBe('18:00');
    expect(access(component).slotEnd(0)).toBe('19:30');
  });

  it('addSlot appends an editable row; dropping an unsaved row needs no API call', () => {
    expect(access(component).slots.length).toBe(0);
    access(component).addSlot();
    access(component).addSlot();
    expect(access(component).slots.length).toBe(2);
    expect(access(component).isSlotEditing(0)).toBe(true);
    access(component).removeSlot(0); // unsaved (id=null) → just dropped
    expect(access(component).slots.length).toBe(1);
    expect(teamsMock.teamsTrainingSlotsDestroy).not.toHaveBeenCalled();
  });

  it('addSlot defaults the new row lieu to the team default place', async () => {
    await setup({ defaultPlaceId: 7 });
    access(component).addSlot();
    expect(access(component).slots.at(0).controls.place_id.value).toBe(7);
  });

  it('confirmSlot on a new row POSTs the créneau and collapses on success', () => {
    access(component).addSlot();
    fillSlot(0, 2, null);
    access(component).confirmSlot(0);
    expect(teamsMock.teamsTrainingSlotsCreate).toHaveBeenCalledTimes(1);
    const { teamPk, trainingSlot: body } = teamsMock.teamsTrainingSlotsCreate.mock.calls[0][0];
    expect(teamPk).toBe(5);
    expect(body).toMatchObject({ weekday: 2, hour_start: '18:00', hour_end: '19:30', place_id: null });
    expect(access(component).isSlotEditing(0)).toBe(false);
  });

  it('confirmSlot sends place_id', () => {
    access(component).addSlot();
    fillSlot(0, 0, 7);
    access(component).confirmSlot(0);
    expect(teamsMock.teamsTrainingSlotsCreate.mock.calls[0][0].trainingSlot.place_id).toBe(7);
  });

  it('confirmSlot on an existing row PATCHes by id + teamPk', async () => {
    await setup({ slots: [{ id: 42, weekday: 1, hour_start: '18:00', hour_end: '19:30', place: null }] });
    access(component).editSlot(0);
    fillSlot(0, 3, null);
    access(component).confirmSlot(0);
    expect(teamsMock.teamsTrainingSlotsPartialUpdate).toHaveBeenCalledTimes(1);
    const {
      id,
      teamPk,
      patchedTrainingSlot: body,
    } = teamsMock.teamsTrainingSlotsPartialUpdate.mock.calls[0][0];
    expect(id).toBe(42);
    expect(teamPk).toBe(5);
    expect(body).toMatchObject({ weekday: 3, hour_start: '18:00', hour_end: '19:30' });
    expect(access(component).isSlotEditing(0)).toBe(false);
  });

  it('confirmSlot keeps an invalid row editable and makes no request', () => {
    access(component).addSlot();
    access(component).confirmSlot(0); // no times → invalid
    expect(access(component).isSlotEditing(0)).toBe(true);
    expect(teamsMock.teamsTrainingSlotsCreate).not.toHaveBeenCalled();
  });

  it('removeSlot on a persisted row confirms then DELETEs by id + teamPk', async () => {
    await setup({ slots: [{ id: 88, weekday: 1, hour_start: '18:00', hour_end: '19:30', place: null }] });
    expect(access(component).slots.length).toBe(1);
    access(component).removeSlot(0);
    expect(teamsMock.teamsTrainingSlotsDestroy).toHaveBeenCalledWith({ id: 88, teamPk: 5 });
    expect(access(component).slots.length).toBe(0);
  });

  it('confirmSlot surfaces a save error as a toast and stays editable', () => {
    teamsMock.teamsTrainingSlotsCreate.mockReturnValueOnce(
      throwError(() => ({ status: 400, error: { code: 'place_not_in_team' } })),
    );
    access(component).addSlot();
    fillSlot(0, 0, 9);
    access(component).confirmSlot(0);
    expect(messageMock.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
    expect(access(component).isSlotEditing(0)).toBe(true);
  });

  it('slotHasTimeError flags a slot whose end is before its start', () => {
    access(component).addSlot();
    const start = new Date();
    start.setHours(19, 0, 0, 0);
    const end = new Date();
    end.setHours(18, 0, 0, 0);
    access(component).slots.at(0).patchValue({ weekday: 0, hour_start: start, hour_end: end });
    expect(access(component).slotHasTimeError(0)).toBe(true);
  });
});
