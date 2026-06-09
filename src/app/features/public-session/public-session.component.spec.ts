import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicService } from '../../api/api/public.service';
import { EventPublic } from '../../api/model/event-public';
import { PublicSessionComponent } from './public-session.component';

const fullSession: EventPublic = {
  name: 'Threshold set',
  date: '2026-06-10',
  hour_start: '18:30:00',
  hour_end: '20:00:00',
  location: 'Olympic pool',
  equipment: 'Fins, pull buoy',
  program_name: 'Spring block',
  team_name: 'RBP WP Senior',
  total: 3200,
  goal: 'Aerobic threshold',
  rounds: [
    {
      count: 4,
      t_start: '00:30',
      t_break: '00:15',
      exercises: [
        {
          modality: { name: 'Freestyle' },
          energysegment: { abv: 'EN2' },
          distance: 100,
          repetition: 8,
          notes: 'descending',
        },
      ],
    },
  ],
};

interface ProtectedFields {
  loading(): boolean;
  error(): boolean;
  session(): EventPublic | null;
  formattedDate(): string | null;
  formattedTime(): string | null;
  hasRounds(): boolean;
  rounds(): { count: number | null; exercises: unknown[] }[];
}

describe('PublicSessionComponent', () => {
  let fixture: ComponentFixture<PublicSessionComponent>;
  let component: PublicSessionComponent;
  let publicMock: { publicEventsRetrieve: ReturnType<typeof vi.fn> };
  let routeToken: string | null;

  const access = (c: PublicSessionComponent) => c as unknown as ProtectedFields;

  async function setup(
    token: string | null = 'tok-abc',
    ret: 'default' | { ok: EventPublic } | { err: unknown } = 'default',
  ) {
    TestBed.resetTestingModule();
    routeToken = token;
    const retrieve = vi.fn();
    if (ret === 'default') {
      retrieve.mockReturnValue(of(fullSession));
    } else if ('ok' in ret) {
      retrieve.mockReturnValue(of(ret.ok));
    } else {
      retrieve.mockReturnValue(throwError(() => ret.err));
    }
    publicMock = { publicEventsRetrieve: retrieve };

    await TestBed.configureTestingModule({
      imports: [
        PublicSessionComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        { provide: PublicService, useValue: publicMock },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => routeToken } } },
        },
      ],
    })
      .overrideComponent(PublicSessionComponent, {
        set: { template: '', imports: [] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(PublicSessionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await setup();
  });

  it('fetches the session on init with the route token', () => {
    expect(publicMock.publicEventsRetrieve).toHaveBeenCalledWith({ token: 'tok-abc' });
    expect(access(component).loading()).toBe(false);
    expect(access(component).error()).toBe(false);
    expect(access(component).session()?.name).toBe('Threshold set');
  });

  it('renders always-public fields and computed date/time', () => {
    const c = access(component);
    expect(c.formattedTime()).toBe('18:30 – 20:00');
    expect(c.formattedDate()).not.toBeNull();
    expect(c.session()?.location).toBe('Olympic pool');
    expect(c.session()?.equipment).toBe('Fins, pull buoy');
  });

  it('normalizes rounds and nested exercises defensively', () => {
    const rounds = access(component).rounds();
    expect(rounds.length).toBe(1);
    expect(rounds[0].count).toBe(4);
    const ex = rounds[0].exercises[0] as {
      modality: string | null;
      energysegment: string | null;
      distance: number | null;
    };
    expect(ex.modality).toBe('Freestyle');
    expect(ex.energysegment).toBe('EN2');
    expect(ex.distance).toBe(100);
    expect(access(component).hasRounds()).toBe(true);
  });

  it('shows the error state on a 404 response', async () => {
    await setup('bad-tok', { err: { status: 404 } });
    expect(access(component).error()).toBe(true);
    expect(access(component).loading()).toBe(false);
    expect(access(component).session()).toBeNull();
  });

  it('shows the error state when no token is present', async () => {
    await setup(null);
    expect(access(component).error()).toBe(true);
    expect(publicMock.publicEventsRetrieve).not.toHaveBeenCalled();
  });

  it('handles redacted (null/empty) sensitive fields gracefully', async () => {
    await setup('tok-redacted', {
      ok: { ...fullSession, total: null, goal: null, rounds: [] },
    });
    const c = access(component);
    expect(c.session()?.total).toBeNull();
    expect(c.hasRounds()).toBe(false);
    expect(c.error()).toBe(false);
  });
});
