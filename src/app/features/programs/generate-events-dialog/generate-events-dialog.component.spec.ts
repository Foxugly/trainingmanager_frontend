import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProgramsService } from '../../../api/api/programs.service';
import { TeamsService } from '../../../api/api/teams.service';
import { LanguageEnum } from '../../../api/model/language-enum';
import { Program } from '../../../api/model/program';
import { TrainingTemplate } from '../../../api/model/training-template';
import {
  GenerateEventsDialogComponent,
  GenerateEventsResult,
} from './generate-events-dialog.component';

const team = { id: 4, name: 'RBP WP Senior', language: LanguageEnum.Fr } as const;
const program: Program = {
  id: 4,
  name: 'Cycle aérobie',
  date_start: '2026-05-01',
  date_end: '2026-08-31',
  team,
  team_id: 4,
  events: [],
  frequency_per_week: 3,
  description: 'Programme de test',
  generated_by_ai: false,
  ai_response: '',
  ai_generated_at: null,
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
};

interface ProtectedFields {
  loading(): boolean;
  errorMessage(): string | null;
  overlapOptions(): Array<{ value: string; label: string }>;
  hasTemplate(): boolean;
  templateSummary(): string;
  form: {
    getRawValue(): Record<string, unknown>;
    patchValue(v: Record<string, unknown>): void;
    invalid: boolean;
  };
  submit(): void;
  cancel(): void;
}

describe('GenerateEventsDialogComponent', () => {
  let fixture: ComponentFixture<GenerateEventsDialogComponent>;
  let component: GenerateEventsDialogComponent;
  let serviceMock: { programsGenerateEventsCreate: ReturnType<typeof vi.fn> };
  let teamsMock: { teamsTrainingTemplateRetrieve: ReturnType<typeof vi.fn> };
  let lastEmitted: GenerateEventsResult | null;

  const emptyTemplate: TrainingTemplate = {
    slots: [],
    default_pool: '',
    season_start: null,
    season_end: null,
  };

  const access = (c: GenerateEventsDialogComponent) => c as unknown as ProtectedFields;

  async function setup(visible = true, template: TrainingTemplate = emptyTemplate) {
    TestBed.resetTestingModule();
    serviceMock = {
      programsGenerateEventsCreate: vi.fn().mockReturnValue(
        of({
          created_count: 12,
          deleted_count: 0,
          rationale: 'Plan progressif',
          model: 'gpt-test',
          tokens_used: { input: 0, output: 0, total: 0 },
        }),
      ),
    };
    teamsMock = {
      teamsTrainingTemplateRetrieve: vi.fn().mockReturnValue(of(template)),
    };

    await TestBed.configureTestingModule({
      imports: [
        GenerateEventsDialogComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: ProgramsService, useValue: serviceMock },
        { provide: TeamsService, useValue: teamsMock },
      ],
    })
      .overrideComponent(GenerateEventsDialogComponent, {
        set: { template: '', imports: [] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(GenerateEventsDialogComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('program', program);
    fixture.componentRef.setInput('visible', visible);
    lastEmitted = null;
    component.generated.subscribe((r) => (lastEmitted = r));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await setup();
  });

  it('pre-fills form from the program when dialog becomes visible', () => {
    const value = access(component).form.getRawValue();
    expect(value['frequency_per_week']).toBe(3);
    expect(value['description']).toBe('Programme de test');
    expect(value['overlap_strategy']).toBe('add_only');
    expect((value['date_start'] as Date).toISOString().slice(0, 10)).toBe('2026-05-01');
    expect((value['date_end'] as Date).toISOString().slice(0, 10)).toBe('2026-08-31');
  });

  it('only exposes add_only and replace overlap options (no merge)', () => {
    const opts = access(component).overlapOptions();
    expect(opts.map((o) => o.value).sort()).toEqual(['add_only', 'replace']);
  });

  it('submits an ISO-formatted payload and emits generated on success', () => {
    access(component).submit();
    expect(serviceMock.programsGenerateEventsCreate).toHaveBeenCalledTimes(1);
    const [id, payload] = serviceMock.programsGenerateEventsCreate.mock.calls[0];
    expect(id).toBe(4);
    expect(payload.date_start).toBe('2026-05-01');
    expect(payload.date_end).toBe('2026-08-31');
    expect(payload.frequency_per_week).toBe(3);
    expect(payload.overlap_strategy).toBe('add_only');
    expect(lastEmitted).toEqual({ created: 12, deleted: 0, rationale: 'Plan progressif' });
  });

  it('parses Retry-After on 429 and exposes a localized error message', () => {
    const err = new HttpErrorResponse({
      status: 429,
      error: { code: 'throttled' },
      headers: new HttpHeaders({ 'Retry-After': '600' }),
    });
    serviceMock.programsGenerateEventsCreate.mockReturnValueOnce(throwError(() => err));
    access(component).submit();
    expect(access(component).errorMessage()).toBeTruthy();
    expect(access(component).loading()).toBe(false);
  });

  it('exposes a date_range_invalid error from a 400 fields payload', () => {
    const err = new HttpErrorResponse({
      status: 400,
      error: {
        code: 'validation_error',
        fields: { date_end: [{ code: 'date_range_invalid', detail: 'fin avant début' }] },
      },
    });
    serviceMock.programsGenerateEventsCreate.mockReturnValueOnce(throwError(() => err));
    access(component).submit();
    expect(access(component).errorMessage()).toBeTruthy();
  });

  it('blocks submit while form is invalid', () => {
    access(component).form.patchValue({ frequency_per_week: 0 });
    expect(access(component).form.invalid).toBe(true);
    access(component).submit();
    expect(serviceMock.programsGenerateEventsCreate).not.toHaveBeenCalled();
  });

  // ── Team training template integration ────────────────────────────────────

  it('fetches the team training template for the program team on open', () => {
    expect(teamsMock.teamsTrainingTemplateRetrieve).toHaveBeenCalledWith(4);
  });

  it('with no slots: hasTemplate is false and frequency stays required', () => {
    expect(access(component).hasTemplate()).toBe(false);
    const payload = (() => {
      access(component).submit();
      return serviceMock.programsGenerateEventsCreate.mock.calls[0][1];
    })();
    expect(payload.frequency_per_week).toBe(3);
  });

  const richTemplate: TrainingTemplate = {
    slots: [
      { weekday: 0, hour_start: '18:00:00', hour_end: '19:30:00' },
      { weekday: 5, hour_start: '10:00:00', hour_end: '12:00:00' },
    ],
    default_pool: 'Piscine X',
    season_start: '2026-09-01',
    season_end: '2027-06-30',
  };

  it('with slots: hasTemplate true, frequency omitted from the payload', async () => {
    await setup(true, richTemplate);
    expect(access(component).hasTemplate()).toBe(true);
    access(component).submit();
    const payload = serviceMock.programsGenerateEventsCreate.mock.calls[0][1];
    expect(payload.frequency_per_week).toBeUndefined();
  });

  it('with slots: prefills date_start/date_end from the season window', async () => {
    await setup(true, richTemplate);
    const value = access(component).form.getRawValue();
    expect((value['date_start'] as Date).toISOString().slice(0, 10)).toBe('2026-09-01');
    expect((value['date_end'] as Date).toISOString().slice(0, 10)).toBe('2027-06-30');
  });

  it('with slots: builds a readable template summary', async () => {
    await setup(true, richTemplate);
    const summary = access(component).templateSummary();
    expect(summary).toContain('18:00–19:30');
    expect(summary).toContain('10:00–12:00');
    expect(summary).toContain('Piscine X');
  });

  it('with slots: form is valid even when frequency is 0 (field hidden)', async () => {
    await setup(true, richTemplate);
    access(component).form.patchValue({ frequency_per_week: 0 });
    expect(access(component).form.invalid).toBe(false);
  });
});
