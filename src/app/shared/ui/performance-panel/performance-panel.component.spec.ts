import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PerformancesService } from '../../../api/api/performances.service';
import { Performance } from '../../../api/model/performance';
import { UnitEnum } from '../../../api/model/unit-enum';
import { PerformancePanelComponent } from './performance-panel.component';

// Polyfill ResizeObserver for jsdom — PrimeNG UIChart / p-dialog use it.
class ResizeObserverPolyfill {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof globalThis.ResizeObserver === 'undefined') {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverPolyfill;
}

function makePerf(over: Partial<Performance> = {}): Performance {
  return {
    id: 1,
    team: 7,
    member: 3,
    label: '100m',
    value: '12.50',
    unit: UnitEnum.S,
    is_lower_better: true,
    recorded_on: '2026-01-01',
    notes: '',
    created_by: 9,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

interface PerformanceGroupView {
  label: string;
  unit: UnitEnum;
  pbLabel: string;
  entries: Performance[];
}

interface ProtectedFields {
  items(): Performance[];
  loading(): boolean;
  isEmpty(): boolean;
  canMutate(): boolean;
  groups(): PerformanceGroupView[];
  form: { setValue: (v: unknown) => void; reset: (v?: unknown) => void };
  editingId(): number | null;
  openAdd(): void;
  submit(): void;
  formatValue(value: number, unit: UnitEnum): string;
}

describe('PerformancePanelComponent', () => {
  let fixture: ComponentFixture<PerformancePanelComponent>;
  let component: PerformancePanelComponent;
  let perfMock: {
    performancesList: ReturnType<typeof vi.fn>;
    performancesCreate: ReturnType<typeof vi.fn>;
    performancesPartialUpdate: ReturnType<typeof vi.fn>;
    performancesDestroy: ReturnType<typeof vi.fn>;
  };

  const access = (c: PerformancePanelComponent) => c as unknown as ProtectedFields;

  async function setup(opts: { canEdit?: boolean; list?: Performance[] } = {}) {
    const { canEdit = true, list = [makePerf()] } = opts;
    TestBed.resetTestingModule();
    perfMock = {
      performancesList: vi.fn().mockReturnValue(of({ count: list.length, results: list })),
      performancesCreate: vi.fn(),
      performancesPartialUpdate: vi.fn(),
      performancesDestroy: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [
        PerformancePanelComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideHttpClient(),
        provideNoopAnimations(),
        MessageService,
        ConfirmationService,
        { provide: PerformancesService, useValue: perfMock },
      ],
    })
      .overrideComponent(PerformancePanelComponent, { set: { template: '', imports: [] } })
      .compileComponents();

    fixture = TestBed.createComponent(PerformancePanelComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('teamId', 7);
    fixture.componentRef.setInput('memberId', 3);
    fixture.componentRef.setInput('canEdit', canEdit);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await setup();
  });

  it('loads performances for the (member, team) scope on init', () => {
    expect(perfMock.performancesList).toHaveBeenCalledWith({ member: 3, team: 7 });
    expect(access(component).items().length).toBe(1);
    expect(access(component).loading()).toBe(false);
  });

  it('groups performances by label', async () => {
    await setup({
      list: [
        makePerf({ id: 1, label: '100m', value: '12.50' }),
        makePerf({ id: 2, label: '100m', value: '12.10', recorded_on: '2026-02-01' }),
        makePerf({ id: 3, label: 'Squat', value: '80', unit: UnitEnum.Kg, is_lower_better: false }),
      ],
    });
    const groups = access(component).groups();
    expect(groups.length).toBe(2);
    const labels = groups.map((g) => g.label).sort();
    expect(labels).toEqual(['100m', 'Squat']);
  });

  it('computes the personal best as the min for lower-is-better (time)', async () => {
    await setup({
      list: [
        makePerf({ id: 1, label: '100m', value: '12.50', is_lower_better: true }),
        makePerf({ id: 2, label: '100m', value: '11.90', is_lower_better: true, recorded_on: '2026-03-01' }),
      ],
    });
    const group = access(component).groups().find((g) => g.label === '100m');
    expect(group?.pbLabel).toBe('11.90 s');
  });

  it('computes the personal best as the max for higher-is-better (distance)', async () => {
    await setup({
      list: [
        makePerf({ id: 1, label: 'Long jump', value: '2800', unit: UnitEnum.M, is_lower_better: false }),
        makePerf({ id: 2, label: 'Long jump', value: '3100', unit: UnitEnum.M, is_lower_better: false, recorded_on: '2026-03-01' }),
      ],
    });
    const group = access(component).groups().find((g) => g.label === 'Long jump');
    expect(group?.pbLabel).toBe('3100 m');
  });

  it('formats seconds ≥ 60 as m:ss.dd', () => {
    expect(access(component).formatValue(62.5, UnitEnum.S)).toBe('1:02.50');
    expect(access(component).formatValue(45, UnitEnum.S)).toBe('45.00 s');
  });

  it('allows mutation only when canEdit and in fetch mode', async () => {
    expect(access(component).canMutate()).toBe(true);
    await setup({ canEdit: false });
    expect(access(component).canMutate()).toBe(false);
  });

  it('does not fetch in supplied mode and renders the supplied list', async () => {
    TestBed.resetTestingModule();
    perfMock = {
      performancesList: vi.fn(),
      performancesCreate: vi.fn(),
      performancesPartialUpdate: vi.fn(),
      performancesDestroy: vi.fn(),
    };
    await TestBed.configureTestingModule({
      imports: [
        PerformancePanelComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideHttpClient(),
        provideNoopAnimations(),
        MessageService,
        ConfirmationService,
        { provide: PerformancesService, useValue: perfMock },
      ],
    })
      .overrideComponent(PerformancePanelComponent, { set: { template: '', imports: [] } })
      .compileComponents();
    fixture = TestBed.createComponent(PerformancePanelComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('performances', [makePerf({ label: 'Bench' })]);
    fixture.detectChanges();

    expect(perfMock.performancesList).not.toHaveBeenCalled();
    expect(access(component).canMutate()).toBe(false);
    expect(access(component).groups()[0].label).toBe('Bench');
  });

  it('create sends value as a string with the team + member scope', () => {
    const created = makePerf({ id: 99, label: 'Squat', value: '90', unit: UnitEnum.Kg });
    perfMock.performancesCreate.mockReturnValue(of(created));
    access(component).openAdd();
    access(component).form.setValue({
      label: 'Squat',
      value: 90,
      unit: UnitEnum.Kg,
      recorded_on: new Date(2026, 0, 15),
      notes: '',
    });
    access(component).submit();

    expect(perfMock.performancesCreate).toHaveBeenCalledWith({
      performanceRequest: expect.objectContaining({
        team: 7,
        member: 3,
        label: 'Squat',
        value: '90',
        unit: UnitEnum.Kg,
        recorded_on: '2026-01-15',
      }),
    });
    expect(access(component).items()[0].id).toBe(99);
  });
});
