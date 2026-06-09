import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EnergySegmentsService } from '../../../api/api/energy-segments.service';
import { ExercisesService } from '../../../api/api/exercises.service';
import { RoundsService } from '../../../api/api/rounds.service';
import { SportsService } from '../../../api/api/sports.service';
import { Exercise } from '../../../api/model/exercise';
import { Round } from '../../../api/model/round';
import { RoundExercisesComponent } from './round-exercises.component';

interface Protected {
  localExercises(): Exercise[];
  modalities(): { id: number }[];
  energySegments(): { id: number }[];
  exerciseDistance(ex: Exercise): number;
  startAddExercise(): void;
  startEditExercise(ex: Exercise): void;
  saveNewRow(row: { key: string }): void;
  saveEditExercise(ex: Exercise): void;
  cancelNewRow(key: string): void;
  isEditingExercise(ex: Exercise): boolean;
  rowKeyForExercise(ex: Exercise): string;
  newRows(): { key: string }[];
  moveExercise(ex: Exercise, direction: 'up' | 'down'): void;
  confirmDeleteExercise(ex: Exercise): void;
  formFor(key: string): {
    getRawValue(): Record<string, unknown>;
    controls: Record<string, { setValue(v: unknown): void }>;
  } | null;
}

const exercise1 = { id: 201, order: 1, repetition: 4, distance: 50, modality: { id: 1 }, energysegment: { id: 1 } } as unknown as Exercise;
const exercise2 = { id: 202, order: 2, repetition: 4, distance: 100, t_break: '00:30', modality: { id: 1 }, energysegment: { id: 1 } } as unknown as Exercise;
const round = ({ id: 11, order: 1, count: 2, exercises: [201, 202] } as unknown as Round);

describe('RoundExercisesComponent', () => {
  let fixture: ComponentFixture<RoundExercisesComponent>;
  let component: RoundExercisesComponent;
  let roundsMock: { roundsExercisesReorderCreate: ReturnType<typeof vi.fn> };
  let exercisesMock: {
    exercisesCreate: ReturnType<typeof vi.fn>;
    exercisesPartialUpdate: ReturnType<typeof vi.fn>;
    exercisesDestroy: ReturnType<typeof vi.fn>;
  };
  let sportsMock: { sportsModalitiesList: ReturnType<typeof vi.fn> };
  let energyMock: { energySegmentsList: ReturnType<typeof vi.fn> };
  const access = (c: RoundExercisesComponent) => c as unknown as Protected;

  async function setup(canManage = true) {
    TestBed.resetTestingModule();
    roundsMock = {
      roundsExercisesReorderCreate: vi.fn().mockReturnValue(of({})),
    };
    exercisesMock = {
      exercisesCreate: vi.fn().mockReturnValue(of({ ...exercise1, id: 999 })),
      exercisesPartialUpdate: vi
        .fn()
        .mockImplementation((p: { id: number; patchedExerciseRequest?: { repetition?: number } }) =>
          of({ ...exercise1, id: p.id, repetition: p.patchedExerciseRequest?.repetition ?? 4 }),
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

    await TestBed.configureTestingModule({
      imports: [
        RoundExercisesComponent,
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
        { provide: MessageService, useValue: { add: vi.fn() } },
      ],
    })
      // The component provides its own ConfirmationService — override it here so
      // confirm() auto-accepts; strip the template/imports for logic-only tests.
      .overrideComponent(RoundExercisesComponent, {
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

    fixture = TestBed.createComponent(RoundExercisesComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('round', round);
    fixture.componentRef.setInput('exercises', [exercise1, exercise2]);
    fixture.componentRef.setInput('sportId', 1);
    fixture.componentRef.setInput('language', 'fr');
    fixture.componentRef.setInput('canManage', canManage);
    fixture.detectChanges();
    return fixture;
  }

  const tick = () => new Promise((r) => setTimeout(r, 0));

  beforeEach(() => setup());

  it('mirrors the exercises input into a local working copy', () => {
    expect(access(component).localExercises().map((e) => e.id)).toEqual([201, 202]);
  });

  it('loads modality + energy-segment options from the sport input', async () => {
    await tick();
    expect(sportsMock.sportsModalitiesList).toHaveBeenCalledWith({ sportPk: 1 });
    expect(access(component).modalities().length).toBe(1);
    expect(access(component).energySegments().length).toBe(1);
  });

  it('computes per-exercise distance', () => {
    expect(access(component).exerciseDistance(exercise1)).toBe(200);
  });

  it('startAddExercise + saveNewRow creates the exercise, appends it and emits the new list', async () => {
    await tick();
    const changed: Exercise[][] = [];
    component.exercisesChanged.subscribe((l) => changed.push(l));
    access(component).startAddExercise();
    const row = access(component).newRows()[0];
    const form = access(component).formFor(row.key)!;
    form.controls['modality_id'].setValue(1);
    form.controls['energysegment_id'].setValue(1);
    access(component).saveNewRow(row);
    await tick();
    expect(exercisesMock.exercisesCreate).toHaveBeenCalledTimes(1);
    expect(exercisesMock.exercisesCreate.mock.calls[0][0].exerciseRequest.round_id).toBe(round.id);
    expect(access(component).newRows().length).toBe(0);
    expect(access(component).localExercises().some((e) => e.id === 999)).toBe(true);
    expect(changed.at(-1)?.some((e) => e.id === 999)).toBe(true);
  });

  it('startEditExercise + saveEditExercise patches (with round_id fork hint) and exits edit mode', async () => {
    await tick();
    const changed: Exercise[][] = [];
    component.exercisesChanged.subscribe((l) => changed.push(l));
    access(component).startEditExercise(exercise1);
    expect(access(component).isEditingExercise(exercise1)).toBe(true);
    const form = access(component).formFor(access(component).rowKeyForExercise(exercise1))!;
    form.controls['repetition'].setValue(8);
    access(component).saveEditExercise(exercise1);
    await tick();
    const call = exercisesMock.exercisesPartialUpdate.mock.calls[0][0];
    expect(call.patchedExerciseRequest.repetition).toBe(8);
    expect(call.patchedExerciseRequest.round_id).toBe(round.id);
    expect(access(component).isEditingExercise(exercise1)).toBe(false);
    expect(changed.length).toBeGreaterThan(0);
  });

  it('moveExercise reorders within the round, persists the order and emits the new list', () => {
    const changed: Exercise[][] = [];
    component.exercisesChanged.subscribe((l) => changed.push(l));
    expect(access(component).localExercises().map((e) => e.id)).toEqual([201, 202]);
    access(component).moveExercise(exercise1, 'down');
    expect(access(component).localExercises().map((e) => e.id)).toEqual([202, 201]);
    expect(roundsMock.roundsExercisesReorderCreate).toHaveBeenCalledWith({
      id: round.id,
      reorderExercisesRequestRequest: { exercise_ids: [202, 201] },
    });
    expect(changed.at(-1)?.map((e) => e.id)).toEqual([202, 201]);
  });

  it('cancelNewRow drops a fresh row without any API call', () => {
    access(component).startAddExercise();
    const row = access(component).newRows()[0];
    access(component).cancelNewRow(row.key);
    expect(access(component).newRows().length).toBe(0);
    expect(exercisesMock.exercisesCreate).not.toHaveBeenCalled();
  });

  it('confirmDeleteExercise deletes then requests a reload', async () => {
    let reloads = 0;
    component.reloadRequested.subscribe(() => reloads++);
    access(component).confirmDeleteExercise(exercise1);
    expect(exercisesMock.exercisesDestroy).toHaveBeenCalledWith({ id: 201 });
    expect(reloads).toBe(1);
  });
});
