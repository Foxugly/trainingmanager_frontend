import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProgramsService } from '../../../api/api/programs.service';
import { LanguageEnum } from '../../../api/model/language-enum';
import { Program } from '../../../api/model/program';
import { ProgramsListComponent } from './programs-list.component';

const team = { id: 4, name: 'RBP WP Senior', language: LanguageEnum.Fr } as const;

const programs: Program[] = [
  {
    id: 1,
    name: 'Cycle aérobie',
    date_start: '2026-05-01',
    date_end: '2026-08-31',
    team,
    team_id: 4,
    events: [],
    frequency_per_week: 3,
    description: '',
    generated_by_ai: false,
    ai_response: '',
    ai_generated_at: null,
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
  },
  {
    id: 2,
    name: 'Plan IA été',
    date_start: '2026-06-01',
    date_end: '2026-08-31',
    team,
    team_id: 4,
    events: [10, 11, 12],
    frequency_per_week: 4,
    description: '',
    generated_by_ai: true,
    ai_response: '',
    ai_generated_at: '2026-04-15T00:00:00Z',
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
  },
];

interface ProtectedFields {
  programs(): Program[];
  loading(): boolean;
}

describe('ProgramsListComponent', () => {
  let fixture: ComponentFixture<ProgramsListComponent>;
  let component: ProgramsListComponent;
  let serviceMock: { programsList: ReturnType<typeof vi.fn> };

  const access = (c: ProgramsListComponent) => c as unknown as ProtectedFields;

  async function setup(teamFilter: number | null = null, results: Program[] = programs) {
    TestBed.resetTestingModule();
    serviceMock = {
      programsList: vi.fn().mockReturnValue(of({ count: results.length, results })),
    };

    await TestBed.configureTestingModule({
      imports: [
        ProgramsListComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: ProgramsService, useValue: serviceMock },
      ],
    })
      .overrideComponent(ProgramsListComponent, {
        set: { template: '', imports: [] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ProgramsListComponent);
    component = fixture.componentInstance;
    if (teamFilter !== null) {
      fixture.componentRef.setInput('teamFilter', teamFilter);
    }
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await setup();
  });

  it('loads programs without team filter when teamFilter is null', () => {
    expect(serviceMock.programsList).toHaveBeenCalledTimes(1);
    expect(serviceMock.programsList).toHaveBeenCalledWith(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );
    expect(access(component).programs()).toHaveLength(2);
  });

  it('passes the team filter to the API when teamFilter input is set', async () => {
    await setup(4);
    expect(serviceMock.programsList).toHaveBeenCalledWith(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      4,
    );
  });

  it('shows empty state when results is empty', async () => {
    await setup(null, []);
    expect(access(component).programs()).toEqual([]);
  });

  it('exposes a program flagged as AI-generated', () => {
    const ai = access(component).programs().find((p) => p.generated_by_ai);
    expect(ai?.id).toBe(2);
    expect(ai?.ai_generated_at).toBe('2026-04-15T00:00:00Z');
  });

  it('reloads when the teamFilter input changes', async () => {
    await setup(4);
    expect(serviceMock.programsList).toHaveBeenCalledWith(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      4,
    );
    fixture.componentRef.setInput('teamFilter', null);
    fixture.detectChanges();
    expect(serviceMock.programsList).toHaveBeenCalledWith(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );
  });
});
