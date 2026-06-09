import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RoundsService } from '../../../api/api/rounds.service';
import { LanguageEnum } from '../../../api/model/language-enum';
import { Round } from '../../../api/model/round';
import { Sport } from '../../../api/model/sport';
import { RoundFormDialogComponent } from './round-form-dialog.component';

const sport: Sport = {
  id: 1,
  name: 'Natation',
  slug: 'natation',
  is_active: true,
  energy_systems: [],
  created_at: '2026-04-01T00:00:00Z',
};

const seedRound: Round = {
  id: 11,
  sport,
  sport_id: 1,
  language: LanguageEnum.Fr,
  count: 3,
  exercises: [],
  usage_count: 0,
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
};

interface Protected {
  form: { value: { count: number }; invalid: boolean };
  saving(): boolean;
  fieldErrors(): Record<string, string[]> | null;
  submit(): void;
  onCancel(): void;
  onVisibleChange(value: boolean): void;
}

describe('RoundFormDialogComponent', () => {
  let fixture: ComponentFixture<RoundFormDialogComponent>;
  let component: RoundFormDialogComponent;
  let roundsMock: {
    roundsCreate: ReturnType<typeof vi.fn>;
    roundsPartialUpdate: ReturnType<typeof vi.fn>;
  };
  let messageMock: { add: ReturnType<typeof vi.fn> };

  const access = (c: RoundFormDialogComponent) => c as unknown as Protected;

  async function setup(
    inputs: {
      mode: 'create' | 'edit';
      round?: Round | null;
      eventId?: number | null;
      teamSportId?: number | null;
      teamLanguage?: string;
      visible?: boolean;
    },
    mocks: {
      roundsCreate?: ReturnType<typeof vi.fn>;
      roundsPartialUpdate?: ReturnType<typeof vi.fn>;
    } = {},
  ) {
    TestBed.resetTestingModule();
    roundsMock = {
      roundsCreate:
        mocks.roundsCreate ?? vi.fn().mockReturnValue(of({ ...seedRound, id: 99 })),
      roundsPartialUpdate:
        mocks.roundsPartialUpdate ?? vi.fn().mockReturnValue(of({ ...seedRound, count: 5 })),
    };
    messageMock = { add: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [
        RoundFormDialogComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        { provide: RoundsService, useValue: roundsMock },
        { provide: MessageService, useValue: messageMock },
      ],
    })
      .overrideComponent(RoundFormDialogComponent, {
        set: { template: '', imports: [] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(RoundFormDialogComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('visible', inputs.visible ?? true);
    fixture.componentRef.setInput('mode', inputs.mode);
    fixture.componentRef.setInput('round', inputs.round ?? null);
    fixture.componentRef.setInput('eventId', inputs.eventId ?? null);
    fixture.componentRef.setInput('teamSportId', inputs.teamSportId ?? null);
    fixture.componentRef.setInput('teamLanguage', inputs.teamLanguage ?? 'fr');
    fixture.detectChanges();
  }

  it('mode=create: form starts with count=1', async () => {
    await setup({ mode: 'create', eventId: 7, teamSportId: 1 });
    expect(access(component).form.value.count).toBe(1);
  });

  it('mode=edit: form pre-fills count from round', async () => {
    await setup({ mode: 'edit', round: seedRound });
    expect(access(component).form.value.count).toBe(3);
  });

  it('submit create: calls roundsCreate with payload {event_id, sport_id, language, count} and emits closed', async () => {
    await setup({ mode: 'create', eventId: 7, teamSportId: 1, teamLanguage: 'fr' });
    let emitted: Round | null = null;
    component.closed.subscribe((r) => (emitted = r));
    access(component).submit();
    expect(roundsMock.roundsCreate).toHaveBeenCalledWith({
      round: {
        event_id: 7,
        sport_id: 1,
        language: 'fr',
        count: 1,
        t_start: null,
        t_break: null,
      },
    });
    expect((emitted as Round | null)?.id).toBe(99);
  });

  it('submit edit: calls roundsPartialUpdate with {count, t_start, t_break} and emits closed', async () => {
    await setup({ mode: 'edit', round: seedRound });
    let emitted: Round | null = null;
    component.closed.subscribe((r) => (emitted = r));
    access(component).submit();
    expect(roundsMock.roundsPartialUpdate).toHaveBeenCalledWith({
      id: 11,
      patchedRound: {
        count: 3,
        t_start: null,
        t_break: null,
      },
    });
    expect((emitted as Round | null)?.count).toBe(5);
  });

  it('submit 400 with fields → fieldErrors set, no closed emit', async () => {
    await setup(
      { mode: 'create', eventId: 7, teamSportId: 1 },
      {
        roundsCreate: vi.fn().mockReturnValue(
          throwError(() => ({
            error: { fields: { count: ['must be at least 1'] } },
          })),
        ),
      },
    );
    let emittedCalls = 0;
    component.closed.subscribe(() => emittedCalls++);
    access(component).submit();
    expect(access(component).fieldErrors()).toEqual({ count: ['must be at least 1'] });
    expect(emittedCalls).toBe(0);
  });

  it('submit 403 not_authorized_event → messageService.add called with error toast', async () => {
    await setup(
      { mode: 'create', eventId: 7, teamSportId: 1 },
      {
        roundsCreate: vi.fn().mockReturnValue(
          throwError(() => ({
            status: 403,
            error: { code: 'not_authorized_event', detail: 'forbidden' },
          })),
        ),
      },
    );
    access(component).submit();
    expect(messageMock.add).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'error' }),
    );
  });

  it('onCancel emits closed(null)', async () => {
    await setup({ mode: 'create', eventId: 7, teamSportId: 1 });
    let emitted: Round | null | undefined = undefined;
    component.closed.subscribe((r) => (emitted = r));
    access(component).onCancel();
    expect(emitted).toBeNull();
  });
});
