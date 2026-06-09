import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EnergySystemsService } from '../../../../api/api/energy-systems.service';
import { SportsService } from '../../../../api/api/sports.service';
import { SportAdmin } from '../../../../api/model/sport-admin';
import { TrainingTypeEnum } from '../../../../api/model/training-type-enum';
import { SportsFormComponent } from './sports-form.component';

const sportAdmin: SportAdmin = {
  id: 7,
  name_fr: 'Course',
  name_nl: null,
  name_en: 'Running',
  name_it: null,
  name_es: null,
  slug: 'course',
  is_active: true,
  energy_systems: [10],
  created_at: '2026-01-01T00:00:00Z',
};

interface ProtectedFields {
  form: {
    invalid: boolean;
    valid: boolean;
    value: Record<string, unknown>;
    patchValue: (v: Record<string, unknown>) => void;
  };
  sportId(): number | null;
  saving(): boolean;
  activeValue(): boolean;
  patchActive: (id: number, value: boolean) => unknown;
  fieldErrors(): Record<string, string[]> | null;
  submit(): void;
}

describe('SportsFormComponent', () => {
  let fixture: ComponentFixture<SportsFormComponent>;
  let component: SportsFormComponent;
  let sportsServiceMock: {
    sportsRetrieve: ReturnType<typeof vi.fn>;
    sportsCreate: ReturnType<typeof vi.fn>;
    sportsPartialUpdate: ReturnType<typeof vi.fn>;
  };
  let energySystemsMock: { energySystemsList: ReturnType<typeof vi.fn> };
  let messageMock: { add: ReturnType<typeof vi.fn> };
  let router: Router;
  let routeIdParam: string | null;

  const access = (c: SportsFormComponent) => c as unknown as ProtectedFields;

  async function setup(idParam: string | null = null) {
    TestBed.resetTestingModule();
    routeIdParam = idParam;
    sportsServiceMock = {
      sportsRetrieve: vi.fn().mockReturnValue(of(sportAdmin)),
      sportsCreate: vi.fn().mockReturnValue(of(sportAdmin)),
      sportsPartialUpdate: vi.fn().mockReturnValue(of(sportAdmin)),
    };
    energySystemsMock = {
      energySystemsList: vi.fn().mockReturnValue(of({ count: 0, results: [] })),
    };
    messageMock = { add: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [
        SportsFormComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: SportsService, useValue: sportsServiceMock },
        { provide: EnergySystemsService, useValue: energySystemsMock },
        { provide: MessageService, useValue: messageMock },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => routeIdParam } } },
        },
      ],
    })
      .overrideComponent(SportsFormComponent, { set: { template: '', imports: [] } })
      .compileComponents();

    fixture = TestBed.createComponent(SportsFormComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await setup();
  });

  it('starts in create mode (no sportId, slug-required form invalid until filled)', () => {
    expect(access(component).sportId()).toBeNull();
    expect(access(component).form.invalid).toBe(true);
    access(component).form.patchValue({ slug: 'tennis' });
    expect(access(component).form.valid).toBe(true);
  });

  it('defaults activeValue to true in create mode', () => {
    expect(access(component).activeValue()).toBe(true);
  });

  it('hydrates the form from sportsRetrieve in edit mode', async () => {
    await setup('7');

    expect(access(component).sportId()).toBe(7);
    expect(sportsServiceMock.sportsRetrieve).toHaveBeenCalledWith({ id: 7, includeInactive: true });
    expect(access(component).activeValue()).toBe(true);
    expect(access(component).form.value).toMatchObject({
      name_fr: 'Course',
      name_nl: '',
      name_en: 'Running',
      slug: 'course',
      energy_systems: [10],
    });
  });

  it('seeds activeValue from sport.is_active in edit mode', async () => {
    sportAdmin.is_active = false;
    await setup('7');
    expect(access(component).activeValue()).toBe(false);
    sportAdmin.is_active = true;
  });

  it('patchActive calls sportsPartialUpdate with undefined 2nd arg and is_active body', async () => {
    await setup('7');
    access(component).patchActive(7, false);
    expect(sportsServiceMock.sportsPartialUpdate).toHaveBeenCalledWith({
      id: 7,
      patchedSportAdminRequest: { is_active: false },
    });
  });

  it('submit() in create mode calls sportsCreate and navigates to /admin/sports', async () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    access(component).form.patchValue({ slug: 'tennis', name_fr: 'Tennis' });

    access(component).submit();

    expect(sportsServiceMock.sportsCreate).toHaveBeenCalledTimes(1);
    const payload = sportsServiceMock.sportsCreate.mock.calls[0][0].sportAdminRequest;
    expect(payload).toMatchObject({ slug: 'tennis', name_fr: 'Tennis', name_nl: null });
    expect(navigate).toHaveBeenCalledWith(['/admin/sports']);
  });

  it('submit() in edit mode calls sportsPartialUpdate with undefined 2nd arg', async () => {
    await setup('7');
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    access(component).form.patchValue({ name_nl: 'Hardlopen' });

    access(component).submit();

    expect(sportsServiceMock.sportsPartialUpdate).toHaveBeenCalledTimes(1);
    const { id, includeInactive, patchedSportAdminRequest } =
      sportsServiceMock.sportsPartialUpdate.mock.calls[0][0];
    expect(id).toBe(7);
    expect(includeInactive).toBeUndefined();
    expect(patchedSportAdminRequest).toMatchObject({ name_nl: 'Hardlopen' });
    expect(navigate).toHaveBeenCalledWith(['/admin/sports']);
  });

  it('includes default_training_type in the create payload', () => {
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    access(component).form.patchValue({ slug: 'tennis', default_training_type: 'freeform' });
    access(component).submit();
    expect(sportsServiceMock.sportsCreate).toHaveBeenCalledWith({
      sportAdminRequest: expect.objectContaining({ default_training_type: 'freeform' }),
    });
  });

  it('seeds default_training_type from the loaded sport in edit mode', async () => {
    sportAdmin.default_training_type = TrainingTypeEnum.Freeform;
    await setup('7');
    expect(access(component).form.value).toMatchObject({ default_training_type: 'freeform' });
    delete sportAdmin.default_training_type;
  });

  it('maps backend field errors into fieldErrors()', () => {
    sportsServiceMock.sportsCreate.mockReturnValue(
      throwError(() => ({
        status: 400,
        error: { fields: { slug: ['Already exists.'] } },
      })),
    );
    access(component).form.patchValue({ slug: 'duplicate' });
    access(component).submit();

    expect(access(component).fieldErrors()).toEqual({ slug: ['Already exists.'] });
    expect(access(component).saving()).toBe(false);
  });

  it('toasts the detail when no fields are returned', () => {
    sportsServiceMock.sportsCreate.mockReturnValue(
      throwError(() => ({ status: 500, error: { detail: 'Server unhappy' } })),
    );
    access(component).form.patchValue({ slug: 'whatever' });
    access(component).submit();

    expect(access(component).fieldErrors()).toBeNull();
    expect(messageMock.add).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'error', detail: 'Server unhappy' }),
    );
  });
});
