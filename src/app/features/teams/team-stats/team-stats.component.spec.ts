import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamsService } from '../../../api/api/teams.service';
import { ReviewBlockResponse } from '../../../api/model/review-block-response';
import { TeamStats } from '../../../api/model/team-stats';
import { TeamStatsComponent } from './team-stats.component';

const aggregateStats: TeamStats = {
  period: { from: '2026-03-01', to: '2026-05-24' },
  member: null,
  attendance: {
    team_rate: 0.75,
    by_session: [
      { event_id: 1, name: 'Séance A', date: '2026-05-01', present: 8, total: 10, rate: 0.8 },
      { event_id: 2, name: 'Séance B', date: '2026-05-08', present: 6, total: 10, rate: 0.6 },
    ],
    by_member: [
      {
        member_id: 23,
        name: 'Renaud Vilain',
        present: 7,
        total: 10,
        rate: 0.7,
        last_present_date: '2026-05-08',
      },
      {
        member_id: 24,
        name: 'Alice Dupont',
        present: 9,
        total: 10,
        rate: 0.9,
        last_present_date: '2026-05-08',
      },
    ],
  },
  volume: {
    total_distance: 12500,
    by_week: [
      { week_start: '2026-05-04', distance: 6000 },
      { week_start: '2026-05-11', distance: 6500 },
    ],
    by_member: [
      { member_id: 23, name: 'Renaud Vilain', distance: 6000 },
      { member_id: 24, name: 'Alice Dupont', distance: 6500 },
    ],
  },
  roti: { series: [], average: null, count: 0 },
  intensity: {
    by_segment: [
      { abv: 'Z1', label: 'Endurance', distance: 8000 },
      { abv: 'Z3', label: 'Seuil', distance: 4500 },
    ],
  },
};

interface ProtectedFields {
  stats(): TeamStats | null;
  loading(): boolean;
  isAggregate(): boolean;
  isEmpty(): boolean;
  attendanceRatePct(): number | null;
  totalDistanceLabel(): string;
  formatDistance(m: number): string;
  attendanceChart(): { data: unknown; options: unknown } | null;
  volumeChart(): { data: unknown; options: unknown } | null;
  intensityChart(): { data: unknown; options: unknown } | null;
  attendanceByMember(): unknown[];
  volumeByMember(): unknown[];
  onMemberRowClick(id: number): void;
  setPreset(weeks: number | 'all'): void;
  range(): Date[];
  showControls(): boolean;
  exportVisible(): boolean;
  exportCsv(): void;
  exportPdf(): void;
  reviewVisible(): boolean;
  reviewDialogVisible(): boolean;
  reviewLoading(): boolean;
  reviewError(): boolean;
  review(): ReviewBlockResponse | null;
  runReview(): void;
  severityClass(s: string): string;
}

const reviewResult: ReviewBlockResponse = {
  period: { from: '2026-03-01', to: '2026-05-24' },
  summary: 'Solid aerobic base.',
  load_assessment: 'balanced',
  findings: [{ area: 'attendance', severity: 'warning', observation: 'Dip mid-block.' }],
  adjustments: [{ recommendation: 'Add a threshold set.', rationale: 'Broaden zones.' }],
  confidence: 'medium',
  model: 'claude-haiku-4-5',
  tokens_used: { input: 300, output: 400 },
};

describe('TeamStatsComponent', () => {
  let fixture: ComponentFixture<TeamStatsComponent>;
  let component: TeamStatsComponent;
  let teamsMock: {
    teamsStatsRetrieve: ReturnType<typeof vi.fn>;
    teamsReviewBlockCreate: ReturnType<typeof vi.fn>;
  };

  const access = (c: TeamStatsComponent) => c as unknown as ProtectedFields;

  async function setup(memberId: number | null = null, result: TeamStats | null = aggregateStats) {
    TestBed.resetTestingModule();
    teamsMock = {
      teamsStatsRetrieve: vi.fn().mockReturnValue(of(result ?? aggregateStats)),
      teamsReviewBlockCreate: vi.fn().mockReturnValue(of(reviewResult)),
    };
    await TestBed.configureTestingModule({
      imports: [
        TeamStatsComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [provideNoopAnimations(), { provide: TeamsService, useValue: teamsMock }],
    })
      .overrideComponent(TeamStatsComponent, { set: { template: '', imports: [] } })
      .compileComponents();

    fixture = TestBed.createComponent(TeamStatsComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('teamId', 4);
    fixture.componentRef.setInput('memberId', memberId);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await setup();
  });

  it('fetches stats with YYYY-MM-DD formatted dates on init (aggregate: no member)', () => {
    expect(teamsMock.teamsStatsRetrieve).toHaveBeenCalledTimes(1);
    const { id, from, member, to } = teamsMock.teamsStatsRetrieve.mock.calls[0][0];
    expect(id).toBe(4);
    expect(from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(member).toBeUndefined();
  });

  it('passes the member id positionally when scoped to an athlete', async () => {
    await setup(23);
    const { id, member } = teamsMock.teamsStatsRetrieve.mock.calls[0][0];
    expect(id).toBe(4);
    expect(member).toBe(23);
    expect(access(component).isAggregate()).toBe(false);
  });

  it('stores the payload and is not empty', () => {
    expect(access(component).stats()?.volume.total_distance).toBe(12500);
    expect(access(component).isEmpty()).toBe(false);
  });

  it('computes the team attendance rate as a rounded percentage', () => {
    expect(access(component).attendanceRatePct()).toBe(75);
  });

  it('formats total distance as km once over 1 km', () => {
    expect(access(component).totalDistanceLabel()).toContain('km');
    expect(access(component).formatDistance(500)).toBe('500 m');
  });

  it('builds attendance, volume and intensity chart data', () => {
    const att = access(component).attendanceChart();
    const vol = access(component).volumeChart();
    const inten = access(component).intensityChart();
    expect(att).not.toBeNull();
    expect((att!.data as { labels: unknown[] }).labels).toHaveLength(2);
    expect((vol!.data as { labels: unknown[] }).labels).toEqual(['2026-05-04', '2026-05-11']);
    expect((inten!.data as { datasets: { data: number[] }[] }).datasets[0].data).toEqual([
      8000, 4500,
    ]);
  });

  it('exposes the by_member tables in aggregate mode', () => {
    expect(access(component).attendanceByMember()).toHaveLength(2);
    expect(access(component).volumeByMember()).toHaveLength(2);
  });

  it('emits selectMember when an athlete row is clicked (aggregate mode)', () => {
    const spy = vi.fn();
    component.selectMember.subscribe(spy);
    access(component).onMemberRowClick(24);
    expect(spy).toHaveBeenCalledWith(24);
  });

  it('does NOT emit selectMember in member mode', async () => {
    await setup(23);
    const spy = vi.fn();
    component.selectMember.subscribe(spy);
    access(component).onMemberRowClick(23);
    expect(spy).not.toHaveBeenCalled();
  });

  // ---- AI review ----------------------------------------------------------

  it('review button is hidden unless canReview + aggregate + interactive', async () => {
    expect(access(component).reviewVisible()).toBe(false); // canReview defaults false
    fixture.componentRef.setInput('canReview', true);
    fixture.detectChanges();
    expect(access(component).reviewVisible()).toBe(true);
    // not on a per-athlete scope
    await setup(23);
    fixture.componentRef.setInput('canReview', true);
    fixture.detectChanges();
    expect(access(component).reviewVisible()).toBe(false);
  });

  it('runReview opens the dialog and stores the structured critique', () => {
    fixture.componentRef.setInput('canReview', true);
    fixture.detectChanges();
    access(component).runReview();
    expect(teamsMock.teamsReviewBlockCreate).toHaveBeenCalledTimes(1);
    const { id, from, to } = teamsMock.teamsReviewBlockCreate.mock.calls[0][0];
    expect(id).toBe(4);
    expect(from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(access(component).reviewDialogVisible()).toBe(true);
    expect(access(component).reviewLoading()).toBe(false);
    expect(access(component).review()?.load_assessment).toBe('balanced');
    expect(access(component).reviewError()).toBe(false);
  });

  it('runReview surfaces an error flag when the call fails', () => {
    teamsMock.teamsReviewBlockCreate.mockReturnValue(throwError(() => new Error('boom')));
    access(component).runReview();
    expect(access(component).reviewError()).toBe(true);
    expect(access(component).reviewLoading()).toBe(false);
    expect(access(component).review()).toBeNull();
  });

  it('severityClass maps severities to colors', () => {
    expect(access(component).severityClass('critical')).toContain('red');
    expect(access(component).severityClass('warning')).toContain('amber');
    expect(access(component).severityClass('info')).toContain('gray');
  });

  it('setPreset updates the range and refetches', () => {
    teamsMock.teamsStatsRetrieve.mockClear();
    access(component).setPreset('all'); // ~2 years back, clearly differs from the 12-wk default
    const [from] = access(component).range();
    const yearsBack = (Date.now() - from.getTime()) / (365 * 24 * 3600 * 1000);
    expect(yearsBack).toBeGreaterThan(1.5);
    fixture.detectChanges(); // flush the refetch effect
    expect(teamsMock.teamsStatsRetrieve).toHaveBeenCalled();
  });

  it('shows controls + export buttons by default (interactive mode)', () => {
    expect(access(component).showControls()).toBe(true);
    expect(access(component).exportVisible()).toBe(true);
  });

  it('print mode hides the date-range controls and export buttons', async () => {
    TestBed.resetTestingModule();
    await setup();
    fixture.componentRef.setInput('print', true);
    fixture.detectChanges();
    expect(access(component).showControls()).toBe(false);
    expect(access(component).exportVisible()).toBe(false);
  });

  it('showExport=false hides export buttons but keeps controls', () => {
    fixture.componentRef.setInput('showExport', false);
    fixture.detectChanges();
    expect(access(component).exportVisible()).toBe(false);
    expect(access(component).showControls()).toBe(true);
  });

  it('seeds the range from initialFrom/initialTo and refetches with them', async () => {
    TestBed.resetTestingModule();
    teamsMock = {
      teamsStatsRetrieve: vi.fn().mockReturnValue(of(aggregateStats)),
      teamsReviewBlockCreate: vi.fn().mockReturnValue(of(reviewResult)),
    };
    await TestBed.configureTestingModule({
      imports: [
        TeamStatsComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [provideNoopAnimations(), { provide: TeamsService, useValue: teamsMock }],
    })
      .overrideComponent(TeamStatsComponent, { set: { template: '', imports: [] } })
      .compileComponents();
    fixture = TestBed.createComponent(TeamStatsComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('teamId', 4);
    fixture.componentRef.setInput('initialFrom', '2026-01-01');
    fixture.componentRef.setInput('initialTo', '2026-02-01');
    fixture.detectChanges();
    const call = teamsMock.teamsStatsRetrieve.mock.calls.at(-1)![0];
    expect(call.from).toBe('2026-01-01');
    expect(call.to).toBe('2026-02-01');
  });

  it('exportCsv triggers a Blob download with a scoped filename', () => {
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const clicked: HTMLAnchorElement[] = [];
    const origCreate = document.createElement.bind(document);
    const createSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag) as HTMLElement;
      if (tag === 'a') {
        (el as HTMLAnchorElement).click = () => clicked.push(el as HTMLAnchorElement);
      }
      return el;
    });
    try {
      access(component).exportCsv();
      expect(createUrl).toHaveBeenCalled();
      expect(clicked).toHaveLength(1);
      expect(clicked[0].download).toMatch(/^stats-.*\.csv$/);
      expect(revokeUrl).toHaveBeenCalled();
    } finally {
      createSpy.mockRestore();
      createUrl.mockRestore();
      revokeUrl.mockRestore();
    }
  });

  it('exportPdf opens the print route in a new tab with member/from/to query params', async () => {
    await setup(23);
    const openSpy = vi
      .spyOn(window, 'open')
      .mockImplementation(() => null) as unknown as ReturnType<typeof vi.fn>;
    try {
      access(component).exportPdf();
      const url = (openSpy.mock.calls[0] as unknown[])[0] as string;
      const target = (openSpy.mock.calls[0] as unknown[])[1] as string;
      expect(url).toContain('/teams/4/stats/print');
      expect(url).toContain('member=23');
      expect(url).toContain('from=');
      expect(url).toContain('to=');
      expect(target).toBe('_blank');
    } finally {
      (openSpy as unknown as { mockRestore: () => void }).mockRestore();
    }
  });

  it('flags empty payloads', async () => {
    const emptyStats: TeamStats = {
      period: { from: '2026-03-01', to: '2026-05-24' },
      member: null,
      attendance: { team_rate: null, by_session: [], by_member: [] },
      volume: { total_distance: 0, by_week: [], by_member: [] },
      roti: { series: [], average: null, count: 0 },
      intensity: { by_segment: [] },
    };
    await setup(null, emptyStats);
    expect(access(component).isEmpty()).toBe(true);
  });
});
