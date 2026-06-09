import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// qrcode's toDataURL uses a browser <canvas> path under jsdom, which jsdom can't
// rasterize. Mock it (a node_module, so vi.mock is allowed) to a deterministic
// data-URL so the component's QR wiring is testable without a real canvas.
vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn(async (url: string) => `data:image/png;base64,QR(${url})`),
  },
}));
import { EventsService } from '../../../api/api/events.service';
import { Event } from '../../../api/model/event';
import { EventRoundDetail } from '../../../api/model/event-round-detail';
import { Exercise } from '../../../api/model/exercise';
import { LanguageEnum } from '../../../api/model/language-enum';
import { Sport } from '../../../api/model/sport';
import { TrainingTypeEnum } from '../../../api/model/training-type-enum';
import { EventPrintComponent } from './event-print.component';

const sport: Sport = {
  id: 1,
  name: 'Natation',
  slug: 'natation',
  is_active: true,
  energy_systems: [],
  created_at: '2026-04-01T00:00:00Z',
  default_training_type: TrainingTypeEnum.Structured,
};

const exercise1 = {
  id: 201,
  order: 1,
  repetition: 4,
  distance: 50,
  notes: '',
  t_start: null,
  t_break: '00:30',
  modality: { id: 1, name: 'Crawl', sport, is_active: true },
  modality_id: 1,
  energysegment: {
    id: 1,
    abv: 'Z2',
    description: '',
    energy_system: { id: 1, name: 'Aérobie', abbreviation: 'AE' },
    is_active: true,
  },
  energysegment_id: 1,
  language: LanguageEnum.Fr,
  usage_count: 0,
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
} as unknown as Exercise;

const exercise2 = { ...exercise1, id: 202, order: 2, distance: 100 } as Exercise;

// A round with its exercises fully nested, as the backend embeds it under the
// event's `rounds_detail` (the whole session in one request — no per-round/
// per-exercise fetch). Exercises are intentionally out of order to assert sort.
const roundDetail1 = {
  id: 11,
  order: 1,
  count: 2,
  t_start: null,
  t_break: null,
  sport,
  exercises: [exercise2, exercise1],
} as unknown as EventRoundDetail;

const eventWithRounds: Event = {
  id: 7,
  name: 'Séance 1',
  goal: null,
  color: undefined,
  date: '2026-05-02',
  hour_start: null,
  hour_end: null,
  total: undefined,
  refer_program: { id: 4, name: 'Cycle aérobie' },
  sport,
  place: null,
  equipment_items: [],
  rounds_detail: [roundDetail1],
  rounds: [11],
  members: [],
  generated_by_ai: false,
  ai_response: '',
  ai_generated_at: null,
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
  is_public: false,
  public_token: null,
};

interface ProtectedFields {
  event(): Event | null;
  notFound(): boolean;
  rounds(): EventRoundDetail[];
  exercisesByRound(): Map<number, Exercise[]>;
  publicUrl(): string;
  qrDataUrl(): string | null;
  eventTotalDistance(): number;
  exerciseDistance(ex: Exercise): number;
  roundTotalDistance(round: EventRoundDetail): number;
  formatDistance(meters: number): string;
}

describe('EventPrintComponent', () => {
  let fixture: ComponentFixture<EventPrintComponent>;
  let component: EventPrintComponent;
  let eventsMock: { eventsRetrieve: ReturnType<typeof vi.fn> };
  let routeIdParam: string | null;

  const access = (c: EventPrintComponent) => c as unknown as ProtectedFields;

  async function setup(
    idParam: string | null = '7',
    eventResult: Event | null = eventWithRounds,
  ) {
    TestBed.resetTestingModule();
    routeIdParam = idParam;
    eventsMock = {
      eventsRetrieve: vi
        .fn()
        .mockReturnValue(eventResult ? of(eventResult) : throwError(() => new Error('404'))),
    };

    await TestBed.configureTestingModule({
      imports: [
        EventPrintComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: EventsService, useValue: eventsMock },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => routeIdParam } } },
        },
      ],
    })
      .overrideComponent(EventPrintComponent, {
        set: { template: '', imports: [] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(EventPrintComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(async () => {
    // jsdom has no real print(); stub it so the optional auto-print is a no-op.
    vi.spyOn(window, 'print').mockImplementation(() => {});
    await setup();
  });

  it('builds the public URL from window.location.origin and the route id', () => {
    expect(access(component).publicUrl()).toBe(`${window.location.origin}/events/7`);
  });

  it('generates a QR data-URL encoding the public URL', async () => {
    // QRCode.toDataURL is async; let the microtask settle.
    await new Promise((r) => setTimeout(r, 0));
    const qr = access(component).qrDataUrl();
    expect(qr).toBeTruthy();
    expect(qr).toMatch(/^data:image\/png;base64,/);
    // The QR encodes the session's public URL (origin + /events/:id).
    expect(qr).toContain(`${window.location.origin}/events/7`);
  });

  it('loads the event for the route :id', () => {
    expect(eventsMock.eventsRetrieve).toHaveBeenCalledWith({ id: 7 });
    expect(access(component).event()?.id).toBe(7);
  });

  it('flags notFound when the id is not numeric', async () => {
    await setup('abc');
    expect(access(component).notFound()).toBe(true);
    expect(eventsMock.eventsRetrieve).not.toHaveBeenCalled();
  });

  it('flags notFound when eventsRetrieve fails', async () => {
    await setup('7', null);
    expect(access(component).notFound()).toBe(true);
  });

  it('builds rounds + ordered exercises from the embedded rounds_detail (no fetch)', () => {
    expect(access(component).rounds().length).toBe(1);
    const exercises = access(component).exercisesByRound().get(11);
    expect(exercises?.length).toBe(2);
    // Sorted by order despite being embedded out of order.
    expect(exercises?.[0].order).toBeLessThanOrEqual(exercises?.[1].order ?? 999);
  });

  it('computes the total distance like events-detail (count × Σ rep×dist)', () => {
    // round count=2, exercises 4×50=200 + 4×100=400 = 600 → 2×600 = 1200
    expect(access(component).eventTotalDistance()).toBe(1200);
  });

  it('formatDistance formats meters and km consistently', () => {
    const fd = (n: number) => access(component).formatDistance(n);
    expect(fd(200)).toBe('200 m');
    expect(fd(1000)).toBe('1 km');
    expect(fd(1500)).toBe('1.5 km');
  });

  // --- Freeform branch: print the richtext, not the (empty) rounds table ---

  const freeformEvent: Event = {
    ...eventWithRounds,
    training_type: TrainingTypeEnum.Freeform,
    training_richtext: '<p>Easy swim, your own pace.</p>',
    rounds: [],
    rounds_detail: [],
  };

  /** Mounts the real template (no override) so we can assert the rendered DOM. */
  async function setupRendered(eventResult: Event) {
    TestBed.resetTestingModule();
    routeIdParam = '7';
    eventsMock = { eventsRetrieve: vi.fn().mockReturnValue(of(eventResult)) };
    await TestBed.configureTestingModule({
      imports: [
        EventPrintComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: { events: { training: { freeform_heading: 'Texte libre' } } } },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: EventsService, useValue: eventsMock },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => routeIdParam } } } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(EventPrintComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('renders the freeform richtext (not the rounds table) for a freeform event', async () => {
    await setupRendered(freeformEvent);
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    const html = (fixture.nativeElement as HTMLElement).innerHTML;
    expect(html).toContain('Easy swim, your own pace.');
    // The structured rounds/exercises table must not render for freeform.
    expect((fixture.nativeElement as HTMLElement).querySelector('table.exercises')).toBeNull();
  });

  it('renders the rounds table (not freeform) for a structured event', async () => {
    await setupRendered({ ...eventWithRounds, training_type: TrainingTypeEnum.Structured });
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('table.exercises')).not.toBeNull();
  });
});
