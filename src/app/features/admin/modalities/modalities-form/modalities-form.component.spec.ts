import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SportsService } from '../../../../api/api/sports.service';
import { ModalityAdmin } from '../../../../api/model/modality-admin';
import { ModalitiesFormComponent } from './modalities-form.component';

const sportAdminPayload = {
  id: 1,
  slug: 'natation',
  name_fr: 'Natation',
  name_nl: null,
  name_en: 'Swimming',
  name_it: null,
  name_es: null,
  is_active: true,
  energy_systems: [],
  created_at: '2026-04-01T00:00:00Z',
};

const fakeAdmin: ModalityAdmin = {
  id: 11,
  name_fr: 'Crawl',
  name_nl: null,
  name_en: 'Front crawl',
  name_it: null,
  name_es: null,
  sport: 1,
  is_active: true,
};

interface ProtectedFields {
  form: {
    invalid: boolean;
    valid: boolean;
    value: Record<string, unknown>;
    patchValue: (v: Record<string, unknown>) => void;
  };
  sportId(): number | null;
  modalityId(): number | null;
  saving(): boolean;
  activeValue(): boolean;
  patchActive: (id: number, value: boolean) => unknown;
  fieldErrors(): Record<string, string[]> | null;
  submit(): void;
}

describe('ModalitiesFormComponent', () => {
  let fixture: ComponentFixture<ModalitiesFormComponent>;
  let component: ModalitiesFormComponent;
  let serviceMock: {
    sportsRetrieve: ReturnType<typeof vi.fn>;
    sportsModalitiesRetrieve: ReturnType<typeof vi.fn>;
    sportsModalitiesCreate: ReturnType<typeof vi.fn>;
    sportsModalitiesPartialUpdate: ReturnType<typeof vi.fn>;
  };
  let messageMock: { add: ReturnType<typeof vi.fn> };
  let router: Router;
  let routeIdParam: string | null;

  const access = (c: ModalitiesFormComponent) => c as unknown as ProtectedFields;

  async function setup(idParam: string | null = null) {
    TestBed.resetTestingModule();
    routeIdParam = idParam;
    serviceMock = {
      sportsRetrieve: vi.fn().mockReturnValue(of(sportAdminPayload)),
      sportsModalitiesRetrieve: vi.fn().mockReturnValue(of(fakeAdmin)),
      sportsModalitiesCreate: vi.fn().mockReturnValue(of(fakeAdmin)),
      sportsModalitiesPartialUpdate: vi.fn().mockReturnValue(of(fakeAdmin)),
    };
    messageMock = { add: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [
        ModalitiesFormComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: SportsService, useValue: serviceMock },
        { provide: MessageService, useValue: messageMock },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: {
                get: (key: string) => {
                  if (key === 'sportId') return '1';
                  if (key === 'id') return routeIdParam;
                  return null;
                },
              },
            },
          },
        },
      ],
    })
      .overrideComponent(ModalitiesFormComponent, {
        set: { template: '', imports: [] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ModalitiesFormComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await setup();
  });

  it('reads sportId from route, loads sport for the title (create mode)', () => {
    expect(access(component).sportId()).toBe(1);
    expect(access(component).modalityId()).toBeNull();
    expect(serviceMock.sportsRetrieve).toHaveBeenCalledWith({ id: 1, includeInactive: true });
    expect(access(component).form.valid).toBe(true);
  });

  it('defaults activeValue to true in create mode', () => {
    expect(access(component).activeValue()).toBe(true);
  });

  it('hydrates the form from sportsModalitiesRetrieve(modalityId, sportPk, true) in edit mode', async () => {
    await setup('11');

    expect(access(component).modalityId()).toBe(11);
    expect(serviceMock.sportsModalitiesRetrieve).toHaveBeenCalledWith({
      id: 11,
      sportPk: 1,
      includeInactive: true,
    });
    expect(access(component).activeValue()).toBe(true);
    expect(access(component).form.value).toMatchObject({
      name_fr: 'Crawl',
      name_nl: '',
      name_en: 'Front crawl',
    });
  });

  it('seeds activeValue from modality.is_active in edit mode', async () => {
    fakeAdmin.is_active = false;
    await setup('11');
    expect(access(component).activeValue()).toBe(false);
    fakeAdmin.is_active = true;
  });

  it('patchActive calls sportsModalitiesPartialUpdate(id, sportPk, true, {is_active})', async () => {
    await setup('11');
    access(component).patchActive(11, false);
    expect(serviceMock.sportsModalitiesPartialUpdate).toHaveBeenCalledWith({
      id: 11,
      sportPk: 1,
      includeInactive: true,
      patchedModalityAdmin: { is_active: false },
    });
  });

  it('submit() in create mode calls sportsModalitiesCreate(sportPk, payload) and navigates', async () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    access(component).form.patchValue({ name_fr: 'Papillon' });

    access(component).submit();

    expect(serviceMock.sportsModalitiesCreate).toHaveBeenCalledTimes(1);
    const { sportPk, modalityAdmin } = serviceMock.sportsModalitiesCreate.mock.calls[0][0];
    expect(sportPk).toBe(1);
    expect(modalityAdmin).toMatchObject({ name_fr: 'Papillon', sport: 1 });
    expect(navigate).toHaveBeenCalledWith(['/admin/sports', 1, 'modalities']);
  });

  it('submit() in edit mode calls sportsModalitiesPartialUpdate(id, sportPk, undefined, payload)', async () => {
    await setup('11');
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    access(component).form.patchValue({ name_nl: 'Crawl NL' });

    access(component).submit();

    expect(serviceMock.sportsModalitiesPartialUpdate).toHaveBeenCalledTimes(1);
    const { id, sportPk, includeInactive, patchedModalityAdmin } =
      serviceMock.sportsModalitiesPartialUpdate.mock.calls[0][0];
    expect(id).toBe(11);
    expect(sportPk).toBe(1);
    expect(includeInactive).toBeUndefined();
    expect(patchedModalityAdmin).toMatchObject({ name_nl: 'Crawl NL', sport: 1 });
    expect(navigate).toHaveBeenCalledWith(['/admin/sports', 1, 'modalities']);
  });

  it('maps backend field errors into fieldErrors()', () => {
    serviceMock.sportsModalitiesCreate.mockReturnValue(
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
    serviceMock.sportsModalitiesCreate.mockReturnValue(
      throwError(() => ({ status: 500, error: { detail: 'Server unhappy' } })),
    );
    access(component).submit();

    expect(access(component).fieldErrors()).toBeNull();
    expect(messageMock.add).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'error', detail: 'Server unhappy' }),
    );
  });
});
