import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EnergySystemsService } from '../../../../api/api/energy-systems.service';
import { EnergySystemAdmin } from '../../../../api/model/energy-system-admin';
import { EnergySystemsFormComponent } from './energy-systems-form.component';

const fakeAdmin: EnergySystemAdmin = {
  id: 10,
  name_fr: 'Endurance',
  name_nl: null,
  name_en: 'Endurance',
  name_it: null,
  name_es: null,
  is_active: true,
};

interface ProtectedFields {
  form: {
    invalid: boolean;
    valid: boolean;
    value: Record<string, unknown>;
    patchValue: (v: Record<string, unknown>) => void;
  };
  esId(): number | null;
  saving(): boolean;
  activeValue(): boolean;
  patchActive: (id: number, value: boolean) => unknown;
  fieldErrors(): Record<string, string[]> | null;
  submit(): void;
}

describe('EnergySystemsFormComponent', () => {
  let fixture: ComponentFixture<EnergySystemsFormComponent>;
  let component: EnergySystemsFormComponent;
  let serviceMock: {
    energySystemsRetrieve: ReturnType<typeof vi.fn>;
    energySystemsCreate: ReturnType<typeof vi.fn>;
    energySystemsPartialUpdate: ReturnType<typeof vi.fn>;
  };
  let messageMock: { add: ReturnType<typeof vi.fn> };
  let router: Router;
  let routeIdParam: string | null;

  const access = (c: EnergySystemsFormComponent) => c as unknown as ProtectedFields;

  async function setup(idParam: string | null = null) {
    TestBed.resetTestingModule();
    routeIdParam = idParam;
    serviceMock = {
      energySystemsRetrieve: vi.fn().mockReturnValue(of(fakeAdmin)),
      energySystemsCreate: vi.fn().mockReturnValue(of(fakeAdmin)),
      energySystemsPartialUpdate: vi.fn().mockReturnValue(of(fakeAdmin)),
    };
    messageMock = { add: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [
        EnergySystemsFormComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: EnergySystemsService, useValue: serviceMock },
        { provide: MessageService, useValue: messageMock },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => routeIdParam } } },
        },
      ],
    })
      .overrideComponent(EnergySystemsFormComponent, {
        set: { template: '', imports: [] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(EnergySystemsFormComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await setup();
  });

  it('starts in create mode (no esId, form is valid even when empty)', () => {
    expect(access(component).esId()).toBeNull();
    // No required fields → valid by default
    expect(access(component).form.valid).toBe(true);
  });

  it('defaults activeValue to true in create mode', () => {
    expect(access(component).activeValue()).toBe(true);
  });

  it('hydrates the form from energySystemsRetrieve(id, true) in edit mode', async () => {
    await setup('10');

    expect(access(component).esId()).toBe(10);
    expect(serviceMock.energySystemsRetrieve).toHaveBeenCalledWith(10, true);
    expect(access(component).activeValue()).toBe(true);
    expect(access(component).form.value).toMatchObject({
      name_fr: 'Endurance',
      name_nl: '',
      name_en: 'Endurance',
    });
  });

  it('seeds activeValue from energySystem.is_active in edit mode', async () => {
    fakeAdmin.is_active = false;
    await setup('10');
    expect(access(component).activeValue()).toBe(false);
    fakeAdmin.is_active = true;
  });

  it('patchActive calls energySystemsPartialUpdate with undefined 2nd arg and is_active body', async () => {
    await setup('10');
    access(component).patchActive(10, false);
    expect(serviceMock.energySystemsPartialUpdate).toHaveBeenCalledWith(10, undefined, {
      is_active: false,
    });
  });

  it('submit() in create mode calls energySystemsCreate and navigates', async () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    access(component).form.patchValue({ name_fr: 'Test' });

    access(component).submit();

    expect(serviceMock.energySystemsCreate).toHaveBeenCalledTimes(1);
    expect(serviceMock.energySystemsCreate.mock.calls[0][0]).toMatchObject({
      name_fr: 'Test',
      name_nl: null,
    });
    expect(navigate).toHaveBeenCalledWith(['/admin/energy-systems']);
  });

  it('submit() in edit mode calls energySystemsPartialUpdate(id, undefined, payload)', async () => {
    await setup('10');
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    access(component).form.patchValue({ name_nl: 'Endurance NL' });

    access(component).submit();

    expect(serviceMock.energySystemsPartialUpdate).toHaveBeenCalledTimes(1);
    const [id, includeInactive, payload] = serviceMock.energySystemsPartialUpdate.mock.calls[0];
    expect(id).toBe(10);
    expect(includeInactive).toBeUndefined();
    expect(payload).toMatchObject({ name_nl: 'Endurance NL' });
    expect(navigate).toHaveBeenCalledWith(['/admin/energy-systems']);
  });

  it('maps backend field errors into fieldErrors()', () => {
    serviceMock.energySystemsCreate.mockReturnValue(
      throwError(() => ({
        status: 400,
        error: { fields: { name_fr: ['Required.'] } },
      })),
    );
    access(component).submit();

    expect(access(component).fieldErrors()).toEqual({ name_fr: ['Required.'] });
    expect(access(component).saving()).toBe(false);
  });

  it('toasts the detail when no fields are returned', () => {
    serviceMock.energySystemsCreate.mockReturnValue(
      throwError(() => ({ status: 500, error: { detail: 'Server unhappy' } })),
    );
    access(component).submit();

    expect(access(component).fieldErrors()).toBeNull();
    expect(messageMock.add).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'error', detail: 'Server unhappy' }),
    );
  });
});
