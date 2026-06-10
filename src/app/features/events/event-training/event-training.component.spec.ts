import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventsService } from '../../../api/api/events.service';
import { RoundsService } from '../../../api/api/rounds.service';
import { Event } from '../../../api/model/event';
import { Exercise } from '../../../api/model/exercise';
import { Round } from '../../../api/model/round';
import { Team } from '../../../api/model/team';
import { EventTrainingComponent, TrainingState } from './event-training.component';

interface Protected {
  rounds(): Round[];
  exercisesByRound(): Map<number, Exercise[]>;
  totalDistance(): number;
  exerciseDistance(ex: Exercise): number;
  roundTotalDistance(r: Round): number;
  formatDistance(m: number): string;
  exercisesForRound(roundId: number): Exercise[];
  onRoundExercisesChanged(roundId: number, exercises: Exercise[]): void;
  sportId(): number | null;
  showRoundDialog(): boolean;
  roundDialogMode(): 'create' | 'edit';
  openCreateRound(): void;
  onRoundDialogClosed(r: Round | null): void;
  confirmDeleteRound(r: Round): void;
  moveRound(r: Round, direction: 'up' | 'down'): void;
}

const exercise1 = {
  id: 201,
  order: 1,
  repetition: 4,
  distance: 50,
  modality: { id: 1 },
  energysegment: { id: 1 },
} as unknown as Exercise;
const exercise2 = {
  id: 202,
  order: 2,
  repetition: 4,
  distance: 100,
  t_break: '00:30',
  modality: { id: 1 },
  energysegment: { id: 1 },
} as unknown as Exercise;
const round = (id: number): Round =>
  ({ id, order: id - 10, count: 2, exercises: [201, 202] }) as unknown as Round;
/** A rounds_detail entry as the backend embeds it on the event (retrieve). */
const roundDetail = (id: number) => ({
  id,
  order: id - 10,
  count: 2,
  t_start: null,
  t_break: null,
  sport: { id: 1 },
  exercises: [exercise1, exercise2],
});

const team = { id: 4, language: 'fr', sport: { id: 1 } } as unknown as Team;
const eventWithRounds = {
  id: 7,
  rounds: [11, 12, 13],
  rounds_detail: [roundDetail(11), roundDetail(12), roundDetail(13)],
  sport: { id: 1 },
} as unknown as Event;
const eventNoRounds = {
  id: 7,
  rounds: [],
  rounds_detail: [],
  sport: { id: 1 },
} as unknown as Event;

describe('EventTrainingComponent', () => {
  let fixture: ComponentFixture<EventTrainingComponent>;
  let component: EventTrainingComponent;
  let roundsMock: {
    roundsDestroy: ReturnType<typeof vi.fn>;
  };
  let eventsMock: { eventsRoundsReorderCreate: ReturnType<typeof vi.fn> };
  const access = (c: EventTrainingComponent) => c as unknown as Protected;

  async function setup(event: Event = eventWithRounds, canManage = true) {
    TestBed.resetTestingModule();
    roundsMock = {
      roundsDestroy: vi.fn().mockReturnValue(of(undefined)),
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

  beforeEach(() => setup());

  it('builds rounds + exercises from the embedded event.rounds_detail (no fetch)', () => {
    expect(access(component).rounds().length).toBe(3);
    expect(access(component).exercisesByRound().get(11)?.length).toBe(2);
    expect(access(component).exercisesForRound(11).length).toBe(2);
  });

  it('shows no rounds for an event with empty rounds_detail', async () => {
    await setup(eventNoRounds);
    expect(access(component).rounds()).toEqual([]);
  });

  it('exposes the sport id (event sport, team fallback) for the row option lists', () => {
    expect(access(component).sportId()).toBe(1);
  });

  it('distance helpers compute per-exercise, per-round and format', () => {
    expect(access(component).exerciseDistance(exercise1)).toBe(200);
    expect(access(component).formatDistance(1500)).toBe('1.5 km');
    expect(access(component).formatDistance(200)).toBe('200 m');
  });

  it('computes + emits the total distance to the parent', async () => {
    // Subscribe before the build so we capture the initial emission.
    const states: TrainingState[] = [];
    TestBed.resetTestingModule();
    await setup(eventNoRounds);
    component.stateChange.subscribe((s) => states.push(s));
    // Feed the rounds-bearing event; the rebuild re-emits the new total.
    fixture.componentRef.setInput('event', eventWithRounds);
    fixture.detectChanges();
    // each round: count 2 × (200 + 400) = 1200; × 3 rounds = 3600
    expect(access(component).totalDistance()).toBe(3600);
    expect(states.at(-1)?.totalDistance).toBe(3600);
    expect(states.at(-1)?.loading).toBe(false);
  });

  it('onRoundExercisesChanged swaps a round list and recomputes the total', () => {
    const states: TrainingState[] = [];
    component.stateChange.subscribe((s) => states.push(s));
    // Drop one exercise from round 11: that round now contributes only
    // count 2 × 200 = 400 instead of 1200, so the total falls by 800 → 2800.
    access(component).onRoundExercisesChanged(11, [exercise1]);
    fixture.detectChanges(); // flush the stateChange effect (CD-driven, like the parent)
    expect(access(component).exercisesByRound().get(11)?.length).toBe(1);
    expect(access(component).totalDistance()).toBe(2800);
    expect(states.at(-1)?.totalDistance).toBe(2800);
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
    expect(roundsMock.roundsDestroy).toHaveBeenCalledWith({ id: 11 });
    expect(reloads).toBe(1);
  });

  it('moveRound reorders the rounds list and persists the new order', () => {
    expect(
      access(component)
        .rounds()
        .map((r) => r.id),
    ).toEqual([11, 12, 13]);
    access(component).moveRound(round(11), 'down');
    expect(
      access(component)
        .rounds()
        .map((r) => r.id),
    ).toEqual([12, 11, 13]);
    expect(eventsMock.eventsRoundsReorderCreate).toHaveBeenCalledWith({
      id: 7,
      reorderRoundsRequestRequest: { round_ids: [12, 11, 13] },
    });
  });
});
