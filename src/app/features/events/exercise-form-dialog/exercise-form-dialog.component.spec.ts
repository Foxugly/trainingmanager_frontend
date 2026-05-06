import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EnergySegmentsService } from '../../../api/api/energy-segments.service';
import { ExercisesService } from '../../../api/api/exercises.service';
import { SportsService } from '../../../api/api/sports.service';
import { EnergySegment } from '../../../api/model/energy-segment';
import { EnergySystem } from '../../../api/model/energy-system';
import { Exercise } from '../../../api/model/exercise';
import { LanguageEnum } from '../../../api/model/language-enum';
import { Modality } from '../../../api/model/modality';
import { Sport } from '../../../api/model/sport';
import { ExerciseFormDialogComponent } from './exercise-form-dialog.component';

const sport: Sport = {
  id: 1,
  name: 'Natation',
  slug: 'natation',
  is_active: true,
  energy_systems: [],
  created_at: '2026-04-01T00:00:00Z',
};

const modCrawl: Modality = { id: 10, name: 'Crawl', sport, is_active: true };
const modBras: Modality = { id: 11, name: 'Brasse', sport, is_active: true };
const modInactive: Modality = { id: 12, name: 'Old', sport, is_active: false };

const energySystem: EnergySystem = { id: 1, name: 'Aerobic', is_active: true };
const segZ2: EnergySegment = {
  id: 21,
  abv: 'Z2',
  description: '',
  energy_system: energySystem,
  energy_system_id: 1,
  is_active: true,
};

const seedExercise = {
  id: 50,
  order: 1,
  repetition: 4,
  distance: 50,
  modality: modCrawl,
  modality_id: 10,
  energysegment: segZ2,
  energysegment_id: 21,
  language: LanguageEnum.Fr,
  usage_count: 0,
  created_at: '',
  updated_at: '',
} as unknown as Exercise;

interface Protected {
  form: { value: Record<string, unknown>; invalid: boolean };
  saving(): boolean;
  loadingOptions(): boolean;
  modalities(): Modality[];
  energySegments(): EnergySegment[];
  errorMessage(): string | null;
  fieldErrors(): Record<string, string[]> | null;
  hasOptions(): boolean;
  submit(): void;
  onCancel(): void;
}

describe('ExerciseFormDialogComponent', () => {
  let fixture: ComponentFixture<ExerciseFormDialogComponent>;
  let component: ExerciseFormDialogComponent;
  let exercisesMock: {
    exercisesCreate: ReturnType<typeof vi.fn>;
    exercisesPartialUpdate: ReturnType<typeof vi.fn>;
  };
  let sportsMock: { sportsModalitiesList: ReturnType<typeof vi.fn> };
  let segmentsMock: { energySegmentsList: ReturnType<typeof vi.fn> };
  let messageMock: { add: ReturnType<typeof vi.fn> };

  const access = (c: ExerciseFormDialogComponent) => c as unknown as Protected;

  async function setup(
    inputs: {
      mode: 'create' | 'edit';
      exercise?: Exercise | null;
      roundId?: number | null;
      sportId?: number | null;
      language?: string;
      visible?: boolean;
    },
    mocks: {
      exercisesCreate?: ReturnType<typeof vi.fn>;
      modalitiesList?: ReturnType<typeof vi.fn>;
      segmentsList?: ReturnType<typeof vi.fn>;
    } = {},
  ) {
    TestBed.resetTestingModule();
    exercisesMock = {
      exercisesCreate:
        mocks.exercisesCreate ??
        vi.fn().mockReturnValue(of({ ...seedExercise, id: 99 })),
      exercisesPartialUpdate: vi.fn().mockReturnValue(of(seedExercise)),
    };
    sportsMock = {
      sportsModalitiesList:
        mocks.modalitiesList ??
        vi.fn().mockReturnValue(of({ count: 3, results: [modCrawl, modBras, modInactive] })),
    };
    segmentsMock = {
      energySegmentsList:
        mocks.segmentsList ?? vi.fn().mockReturnValue(of({ count: 1, results: [segZ2] })),
    };
    messageMock = { add: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [
        ExerciseFormDialogComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        { provide: ExercisesService, useValue: exercisesMock },
        { provide: SportsService, useValue: sportsMock },
        { provide: EnergySegmentsService, useValue: segmentsMock },
        { provide: MessageService, useValue: messageMock },
      ],
    })
      .overrideComponent(ExerciseFormDialogComponent, {
        set: { template: '', imports: [] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ExerciseFormDialogComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('visible', inputs.visible ?? true);
    fixture.componentRef.setInput('mode', inputs.mode);
    fixture.componentRef.setInput('exercise', inputs.exercise ?? null);
    fixture.componentRef.setInput('roundId', inputs.roundId ?? null);
    fixture.componentRef.setInput('sportId', inputs.sportId ?? null);
    fixture.componentRef.setInput('language', inputs.language ?? 'fr');
    fixture.detectChanges();
    // Allow microtasks for the loadOptions Promise.all to settle
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  }

  it('mount fetches modalities scoped by sport and energy segments', async () => {
    await setup({ mode: 'create', roundId: 11, sportId: 1 });
    expect(sportsMock.sportsModalitiesList).toHaveBeenCalledWith(1);
    expect(segmentsMock.energySegmentsList).toHaveBeenCalled();
  });

  it('filters out inactive modalities', async () => {
    await setup({ mode: 'create', roundId: 11, sportId: 1 });
    expect(access(component).modalities().map((m) => m.id)).toEqual([10, 11]);
  });

  it('mode=create: form starts with default repetition=1, distance=50', async () => {
    await setup({ mode: 'create', roundId: 11, sportId: 1 });
    expect(access(component).form.value['repetition']).toBe(1);
    expect(access(component).form.value['distance']).toBe(50);
  });

  it('mode=edit: form pre-fills from exercise', async () => {
    await setup({ mode: 'edit', exercise: seedExercise, sportId: 1 });
    expect(access(component).form.value['modality_id']).toBe(10);
    expect(access(component).form.value['energysegment_id']).toBe(21);
    expect(access(component).form.value['repetition']).toBe(4);
    expect(access(component).form.value['distance']).toBe(50);
  });

  it('submit create: calls exercisesCreate with {round_id, modality_id, energysegment_id, repetition, distance, language}', async () => {
    await setup({ mode: 'create', roundId: 11, sportId: 1, language: 'fr' });
    // Patch the form to a valid state with a modality + segment
    (component as unknown as { form: { patchValue(v: Record<string, unknown>): void } }).form.patchValue(
      { modality_id: 10, energysegment_id: 21, repetition: 4, distance: 100 },
    );
    let emitted: Exercise | null = null;
    component.closed.subscribe((e) => (emitted = e));
    access(component).submit();
    expect(exercisesMock.exercisesCreate).toHaveBeenCalledWith({
      round_id: 11,
      modality_id: 10,
      energysegment_id: 21,
      repetition: 4,
      distance: 100,
      t_start: null,
      t_break: null,
      notes: '',
      language: 'fr',
    });
    expect((emitted as Exercise | null)?.id).toBe(99);
  });

  it('submit 403 not_authorized_round → messageService.add error toast', async () => {
    await setup(
      { mode: 'create', roundId: 11, sportId: 1, language: 'fr' },
      {
        exercisesCreate: vi.fn().mockReturnValue(
          throwError(() => ({
            status: 403,
            error: { code: 'not_authorized_round', detail: 'forbidden' },
          })),
        ),
      },
    );
    (component as unknown as { form: { patchValue(v: Record<string, unknown>): void } }).form.patchValue(
      { modality_id: 10, energysegment_id: 21, repetition: 4, distance: 100 },
    );
    access(component).submit();
    expect(messageMock.add).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'error' }),
    );
  });

  it('hasOptions returns false when modalities are empty (blocking message displayed)', async () => {
    await setup(
      { mode: 'create', roundId: 11, sportId: 1 },
      { modalitiesList: vi.fn().mockReturnValue(of({ count: 0, results: [] })) },
    );
    expect(access(component).hasOptions()).toBe(false);
  });
});
