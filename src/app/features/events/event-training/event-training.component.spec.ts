import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EnergySegmentsService } from '../../../api/api/energy-segments.service';
import { EventsService } from '../../../api/api/events.service';
import { ExercisesService } from '../../../api/api/exercises.service';
import { RoundsService } from '../../../api/api/rounds.service';
import { SportsService } from '../../../api/api/sports.service';
import { Event } from '../../../api/model/event';
import { Exercise } from '../../../api/model/exercise';
import { Round } from '../../../api/model/round';
import { Team } from '../../../api/model/team';
import { EventTrainingComponent, TrainingState } from './event-training.component';

interface Protected {
  rounds(): Round[];
  exercisesByRound(): Map<number, Exercise[]>;
  modalities(): { id: number }[];
  energySegments(): { id: number }[];
  totalDistance(): number;
  exerciseDistance(ex: Exercise): number;
  roundTotalDistance(r: Round): number;
  formatDistance(m: number): string;
  showRoundDialog(): boolean;
  roundDialogMode(): 'create' | 'edit';
  openCreateRound(): void;
  onRoundDialogClosed(r: Round | null): void;
  confirmDeleteRound(r: Round): void;
  confirmDeleteExercise(ex: Exercise): void;
  startAddExercise(roundId: number): void;
  startEditExercise(ex: Exercise): void;
  saveNewRow(row: { key: string; roundId: number }): void;
  saveEditExercise(ex: Exercise): void;
  cancelNewRow(key: string): void;
  isEditingExercise(ex: Exercise): boolean;
  rowKeyForExercise(ex: Exercise): string;
  newRowsFor(roundId: number): { key: string; roundId: number }[];
  formFor(key: string): {
    getRawValue(): Record<string, unknown>;
    controls: Record<string, { setValue(v: unknown): void }>;
  } | null;
}

const exercise1 = { id: 201, order: 1, repetition: 4, distance: 50, modality: { id: 1 }, energysegment: { id: 1 } } as unknown as Exercise;
const exercise2 = { id: 202, order: 2, repetition: 4, distance: 100, t_break: '00:30', modality: { id: 1 }, energysegment: { id: 1 } } as unknown as Exercise;
const round = (id: number): Round =>
  ({ id, order: id - 10, count: 2, exercises: [201, 202] }) as unknown as Round;

const team = { id: 4, language: 'fr', sport: { id: 1 } } as unknown as Team;
const eventWithRounds = { id: 7, rounds: [11, 12, 13], sport: { id: 1 } } as unknown as Event;
const eventNoRounds = { id: 7, rounds: [], sport: { id: 1 } } as unknown as Event;

describe('EventTrainingComponent', () => {
  let fixture: ComponentFixture<EventTrainingComponent>;
  let component: EventTrainingComponent;
  let roundsMock: {
    roundsRetrieve: ReturnType<typeof vi.fn>;
    roundsDestroy: ReturnType<typeof vi.fn>;
    roundsExercisesReorderCreate: ReturnType<typeof vi.fn>;
  };
  let exercisesMock: {
    exercisesRetrieve: ReturnType<typeof vi.fn>;
    exercisesCreate: ReturnType<typeof vi.fn>;
    exercisesPartialUpdate: ReturnType<typeof vi.fn>;
    exercisesDestroy: ReturnType<typeof vi.fn>;
  };
  let sportsMock: { sportsModalitiesList: ReturnType<typeof vi.fn> };
  let energyMock: { energySegmentsList: ReturnType<typeof vi.fn> };
  let eventsMock: { eventsRoundsReorderCreate: ReturnType<typeof vi.fn> };
  const access = (c: EventTrainingComponent) => c as unknown as Protected;

  async function setup(event: Event = eventWithRounds, canManage = true) {
    TestBed.resetTestingModule();
    roundsMock = {
      roundsRetrieve: vi.fn().mockImplementation((id: number) => of(round(id))),
      roundsDestroy: vi.fn().mockReturnValue(of(undefined)),
      roundsExercisesReorderCreate: vi.fn().mockReturnValue(of({})),
    };
    exercisesMock = {
      exercisesRetrieve: vi
        .fn()
        .mockImplementation((id: number) => of(id === 201 ? exercise1 : exercise2)),
      exercisesCreate: vi.fn().mockReturnValue(of({ ...exercise1, id: 999 })),
      exercisesPartialUpdate: vi
        .fn()
        .mockImplementation((id: number, b: { repetition?: number }) =>
          of({ ...exercise1, id, repetition: b.repetition ?? 4 }),
        ),
      exercisesDestroy: vi.fn().mockReturnValue(of(undefined)),
    };
    sportsMock = {
      sportsModalitiesList: vi
        .fn()
        .mockReturnValue(of({ results: [{ id: 1, name: 'Crawl', is_active: true }] })),
    };
    energyMock = {
      energySegmentsList: vi
        .fn()
        .mockReturnValue(of({ results: [{ id: 1, abv: 'Z2', is_active: true }] })),
    };
    eventsMock = { eventsRoundsReorderCreate: vi.fn().mockReturnValue(of({})) };

    await TestBed.configureTestingModule({
      imports: [
        EventTrainingComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        { provide: RoundsService, useValue: roundsMock },
        { provide: ExercisesService, useValue: exercisesMock },
        { provide: SportsService, useValue: sportsMock },
        { provide: EnergySegmentsService, useValue: energyMock },
        { provide: EventsService, useValue: eventsMock },
        { provide: MessageService, useValue: { add: vi.fn() } },
      ],
    })
      // The component provides its own ConfirmationService — override it here so
      // confirm() auto-accepts; strip the template/imports for logic-only tests.
      .overrideComponent(EventTrainingComponent, {
        set: {
          template: '',
          imports: [],
          providers: [
            {
              provide: ConfirmationService,
              useValue: {
                confirm: vi.fn().mockImplementation((o: { accept?: () => void }) => o.accept?.()),
              },
            },
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(EventTrainingComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('event', event);
    fixture.componentRef.setInput('team', team);
    fixture.componentRef.setInput('canManage', canManage);
    fixture.componentRef.setInput('restrictedViewer', false);
    fixture.detectChanges();
    return fixture;
  }

  const tick = () => new Promise((r) => setTimeout(r, 0));

  beforeEach(() => setup());

  it('loads rounds + their exercises from the event round id list', async () => {
    await tick();
    await tick();
    expect(roundsMock.roundsRetrieve).toHaveBeenCalledTimes(3);
    expect(access(component).rounds().length).toBe(3);
    expect(access(component).exercisesByRound().get(11)?.length).toBe(2);
  });

  it('does not fetch rounds for an event with none', async () => {
    await setup(eventNoRounds);
    expect(roundsMock.roundsRetrieve).not.toHaveBeenCalled();
    expect(access(component).rounds()).toEqual([]);
  });

  it('loads modality + energy-segment options from the event sport', async () => {
    await tick();
    expect(sportsMock.sportsModalitiesList).toHaveBeenCalledWith(1);
    expect(access(component).modalities().length).toBe(1);
    expect(access(component).energySegments().length).toBe(1);
  });

  it('distance helpers compute per-exercise, per-round and format', () => {
    expect(access(component).exerciseDistance(exercise1)).toBe(200);
    expect(access(component).formatDistance(1500)).toBe('1.5 km');
    expect(access(component).formatDistance(200)).toBe('200 m');
  });

  it('emits the computed total distance via stateChange once loaded', async () => {
    const states: TrainingState[] = [];
    await setup(eventWithRounds);
    component.stateChange.subscribe((s) => states.push(s));
    await tick();
    await tick();
    // each round: count 2 × (200 + 400) = 1200; × 3 rounds = 3600
    expect(access(component).totalDistance()).toBe(3600);
    expect(states.at(-1)?.totalDistance).toBe(3600);
  });

  it('openCreateRound opens the dialog in create mode', () => {
    access(component).openCreateRound();
    expect(access(component).showRoundDialog()).toBe(true);
    expect(access(component).roundDialogMode()).toBe('create');
  });

  it('onRoundDialogClosed(round) requests a reload; null does not', async () => {
    let reloads = 0;
    component.reloadRequested.subscribe(() => reloads++);
    access(component).onRoundDialogClosed(null);
    expect(reloads).toBe(0);
    access(component).onRoundDialogClosed(round(11));
    expect(reloads).toBe(1);
  });

  it('confirmDeleteRound deletes then requests a reload', async () => {
    let reloads = 0;
    component.reloadRequested.subscribe(() => reloads++);
    access(component).confirmDeleteRound(round(11));
    expect(roundsMock.roundsDestroy).toHaveBeenCalledWith(11);
    expect(reloads).toBe(1);
  });

  it('confirmDeleteExercise deletes then requests a reload', async () => {
    await tick();
    await tick();
    let reloads = 0;
    component.reloadRequested.subscribe(() => reloads++);
    access(component).confirmDeleteExercise(exercise1);
    expect(exercisesMock.exercisesDestroy).toHaveBeenCalledWith(201);
    expect(reloads).toBe(1);
  });

  it('startAddExercise + saveNewRow creates the exercise and appends it', async () => {
    await tick();
    await tick();
    access(component).startAddExercise(11);
    const row = access(component).newRowsFor(11)[0];
    const form = access(component).formFor(row.key)!;
    form.controls['modality_id'].setValue(1);
    form.controls['energysegment_id'].setValue(1);
    access(component).saveNewRow(row);
    await tick();
    expect(exercisesMock.exercisesCreate).toHaveBeenCalledTimes(1);
    expect(exercisesMock.exercisesCreate.mock.calls[0][0].round_id).toBe(11);
    expect(access(component).newRowsFor(11).length).toBe(0);
    expect((access(component).exercisesByRound().get(11) ?? []).some((e) => e.id === 999)).toBe(true);
  });

  it('startEditExercise + saveEditExercise patches and exits edit mode', async () => {
    await tick();
    await tick();
    access(component).startEditExercise(exercise1);
    expect(access(component).isEditingExercise(exercise1)).toBe(true);
    const form = access(component).formFor(access(component).rowKeyForExercise(exercise1))!;
    form.controls['repetition'].setValue(8);
    access(component).saveEditExercise(exercise1);
    await tick();
    expect(exercisesMock.exercisesPartialUpdate.mock.calls[0][1].repetition).toBe(8);
    expect(access(component).isEditingExercise(exercise1)).toBe(false);
  });

  it('cancelNewRow drops a fresh row without any API call', async () => {
    access(component).startAddExercise(11);
    const row = access(component).newRowsFor(11)[0];
    access(component).cancelNewRow(row.key);
    expect(access(component).newRowsFor(11).length).toBe(0);
    expect(exercisesMock.exercisesCreate).not.toHaveBeenCalled();
  });
});
