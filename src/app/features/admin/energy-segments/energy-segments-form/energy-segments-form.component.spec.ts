import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EnergySegmentsService } from '../../../../api/api/energy-segments.service';
import { EnergySystemsService } from '../../../../api/api/energy-systems.service';
import { EnergySegmentAdmin } from '../../../../api/model/energy-segment-admin';
import { EnergySystem } from '../../../../api/model/energy-system';
import { EnergySegmentsFormComponent } from './energy-segments-form.component';

const parents: EnergySystem[] = [
  { id: 1, name: 'Relax', is_active: true },
  { id: 2, name: 'Endurance', is_active: true },
];

const fakeAdmin: EnergySegmentAdmin = {
  id: 3,
  abv: 'Z3',
  description_fr: 'vo2max',
  description_nl: null,
  description_en: null,
  description_it: null,
  description_es: null,
  energy_system_id: 2,
  is_active: true,
};

interface ProtectedFields {
  form: {
    invalid: boolean;
    valid: boolean;
    value: Record<string, unknown>;
    patchValue: (v: Record<string, unknown>) => void;
  };
  segmentId(): number | null;
  saving(): boolean;
  activeValue(): boolean;
  patchActive: (id: number, value: boolean) => unknown;
  fieldErrors(): Record<string, string[]> | null;
  availableEnergySystems(): EnergySystem[];
  submit(): void;
}

describe('EnergySegmentsFormComponent', () => {
  let fixture: ComponentFixture<EnergySegmentsFormComponent>;
  let component: EnergySegmentsFormComponent;
  let segmentsServiceMock: {
    energySegmentsRetrieve: ReturnType<typeof vi.fn>;
    energySegmentsCreate: ReturnType<typeof vi.fn>;
    energySegmentsPartialUpdate: ReturnType<typeof vi.fn>;
  };
  let energySystemsMock: { energySystemsList: ReturnType<typeof vi.fn> };
  let messageMock: { add: ReturnType<typeof vi.fn> };
  let router: Router;
  let routeIdParam: string | null;

  const access = (c: EnergySegmentsFormComponent) => c as unknown as ProtectedFields;

  async function setup(idParam: string | null = null) {
    TestBed.resetTestingModule();
    routeIdParam = idParam;
    segmentsServiceMock = {
      energySegmentsRetrieve: vi.fn().mockReturnValue(of(fakeAdmin)),
      energySegmentsCreate: vi.fn().mockReturnValue(of(fakeAdmin)),
      energySegmentsPartialUpdate: vi.fn().mockReturnValue(of(fakeAdmin)),
    };
    energySystemsMock = {
      energySystemsList: vi.fn().mockReturnValue(of({ count: 2, results: parents })),
    };
    messageMock = { add: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [
        EnergySegmentsFormComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: EnergySegmentsService, useValue: segmentsServiceMock },
        { provide: EnergySystemsService, useValue: energySystemsMock },
        { provide: MessageService, useValue: messageMock },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => routeIdParam } } },
        },
      ],
    })
      .overrideComponent(EnergySegmentsFormComponent, {
        set: { template: '', imports: [] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(EnergySegmentsFormComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await setup();
  });

  it('starts in create mode (no segmentId, abv + energy_system_id required → form invalid)', () => {
    expect(access(component).segmentId()).toBeNull();
    expect(access(component).form.invalid).toBe(true);
    access(component).form.patchValue({ abv: 'Z9', energy_system_id: 1 });
    expect(access(component).form.valid).toBe(true);
  });

  it('defaults activeValue to true in create mode', () => {
    expect(access(component).activeValue()).toBe(true);
  });

  it('loads the energy systems list for the parent select', () => {
    expect(energySystemsMock.energySystemsList).toHaveBeenCalled();
    expect(access(component).availableEnergySystems()).toEqual(parents);
  });

  it('hydrates the form from energySegmentsRetrieve(id, true) in edit mode', async () => {
    await setup('3');

    expect(access(component).segmentId()).toBe(3);
    expect(segmentsServiceMock.energySegmentsRetrieve).toHaveBeenCalledWith({
      id: 3,
      includeInactive: true,
    });
    expect(access(component).activeValue()).toBe(true);
    expect(access(component).form.value).toMatchObject({
      abv: 'Z3',
      energy_system_id: 2,
      description_fr: 'vo2max',
      description_nl: '',
    });
  });

  it('seeds activeValue from energySegment.is_active in edit mode', async () => {
    fakeAdmin.is_active = false;
    await setup('3');
    expect(access(component).activeValue()).toBe(false);
    fakeAdmin.is_active = true;
  });

  it('patchActive calls energySegmentsPartialUpdate with undefined 2nd arg and is_active body', async () => {
    await setup('3');
    access(component).patchActive(3, false);
    expect(segmentsServiceMock.energySegmentsPartialUpdate).toHaveBeenCalledWith({
      id: 3,
      patchedEnergySegmentAdmin: { is_active: false },
    });
  });

  it('submit() in create mode calls energySegmentsCreate with the full payload', async () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    access(component).form.patchValue({
      abv: 'ZTEST',
      energy_system_id: 1,
      description_fr: 'Pour test',
    });

    access(component).submit();

    expect(segmentsServiceMock.energySegmentsCreate).toHaveBeenCalledTimes(1);
    expect(segmentsServiceMock.energySegmentsCreate.mock.calls[0][0].energySegmentAdmin).toMatchObject({
      abv: 'ZTEST',
      energy_system_id: 1,
      description_fr: 'Pour test',
      description_nl: null,
    });
    expect(navigate).toHaveBeenCalledWith(['/admin/energy-segments']);
  });

  it('submit() in edit mode calls energySegmentsPartialUpdate(id, undefined, payload)', async () => {
    await setup('3');
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    access(component).form.patchValue({ description_nl: 'beschrijving' });

    access(component).submit();

    expect(segmentsServiceMock.energySegmentsPartialUpdate).toHaveBeenCalledTimes(1);
    const { id, includeInactive, patchedEnergySegmentAdmin } =
      segmentsServiceMock.energySegmentsPartialUpdate.mock.calls[0][0];
    expect(id).toBe(3);
    expect(includeInactive).toBeUndefined();
    expect(patchedEnergySegmentAdmin).toMatchObject({ description_nl: 'beschrijving' });
    expect(navigate).toHaveBeenCalledWith(['/admin/energy-segments']);
  });

  it('maps backend field errors into fieldErrors()', () => {
    segmentsServiceMock.energySegmentsCreate.mockReturnValue(
      throwError(() => ({
        status: 400,
        error: { fields: { abv: ['Already exists.'] } },
      })),
    );
    access(component).form.patchValue({ abv: 'Z1', energy_system_id: 1 });
    access(component).submit();

    expect(access(component).fieldErrors()).toEqual({ abv: ['Already exists.'] });
    expect(access(component).saving()).toBe(false);
  });

  it('toasts the detail when no fields are returned', () => {
    segmentsServiceMock.energySegmentsCreate.mockReturnValue(
      throwError(() => ({ status: 500, error: { detail: 'Server unhappy' } })),
    );
    access(component).form.patchValue({ abv: 'ZX', energy_system_id: 1 });
    access(component).submit();

    expect(access(component).fieldErrors()).toBeNull();
    expect(messageMock.add).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'error', detail: 'Server unhappy' }),
    );
  });
});
