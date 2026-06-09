import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SportsService } from '../../../../api/api/sports.service';
import { Modality } from '../../../../api/model/modality';
import { Sport } from '../../../../api/model/sport';
import { ModalitiesListComponent } from './modalities-list.component';

const parentSport: Sport = {
  id: 1,
  name: 'Natation',
  slug: 'natation',
  is_active: true,
  energy_systems: [],
  created_at: '2026-04-01T00:00:00Z',
};

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

const m1: Modality = { id: 11, name: 'Crawl', sport: parentSport, is_active: true };
const m2: Modality = { id: 12, name: 'Brasse', sport: parentSport, is_active: false };

interface ProtectedFields {
  sportId(): number | null;
  modalities(): Modality[];
  loading(): boolean;
  includeInactive(): boolean;
  includeInactiveModel: boolean;
  confirmDelete(m: Modality): void;
  restore(m: Modality): void;
}

describe('ModalitiesListComponent', () => {
  let fixture: ComponentFixture<ModalitiesListComponent>;
  let component: ModalitiesListComponent;
  let serviceMock: {
    sportsRetrieve: ReturnType<typeof vi.fn>;
    sportsModalitiesList: ReturnType<typeof vi.fn>;
    sportsModalitiesDestroy: ReturnType<typeof vi.fn>;
    sportsModalitiesPartialUpdate: ReturnType<typeof vi.fn>;
  };
  let confirmMock: { confirm: ReturnType<typeof vi.fn> };
  let messageMock: { add: ReturnType<typeof vi.fn> };

  const access = (c: ModalitiesListComponent) => c as unknown as ProtectedFields;

  beforeEach(async () => {
    serviceMock = {
      sportsRetrieve: vi.fn().mockReturnValue(of(sportAdminPayload)),
      sportsModalitiesList: vi.fn().mockReturnValue(of({ count: 1, results: [m1] })),
      sportsModalitiesDestroy: vi.fn().mockReturnValue(of({})),
      sportsModalitiesPartialUpdate: vi.fn().mockReturnValue(of({})),
    };
    confirmMock = { confirm: vi.fn() };
    messageMock = { add: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [
        ModalitiesListComponent,
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
          useValue: { snapshot: { paramMap: { get: (k: string) => (k === 'sportId' ? '1' : null) } } },
        },
      ],
    })
      .overrideComponent(ModalitiesListComponent, {
        set: {
          template: '',
          imports: [],
          providers: [{ provide: ConfirmationService, useValue: confirmMock }],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ModalitiesListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('reads sportId from route, loads sport + active modalities on init', () => {
    expect(access(component).sportId()).toBe(1);
    expect(serviceMock.sportsRetrieve).toHaveBeenCalledWith({ id: 1, includeInactive: true });
    expect(serviceMock.sportsModalitiesList).toHaveBeenCalledTimes(1);
    const { sportPk, includeInactive } = serviceMock.sportsModalitiesList.mock.calls[0][0];
    expect(sportPk).toBe(1);
    expect(includeInactive).toBeUndefined();
    expect(access(component).modalities()).toEqual([m1]);
  });

  it('reloads with includeInactive=true when the toggle flips', () => {
    serviceMock.sportsModalitiesList.mockReturnValue(of({ count: 2, results: [m1, m2] }));
    access(component).includeInactiveModel = true;
    fixture.detectChanges();

    expect(serviceMock.sportsModalitiesList).toHaveBeenCalledTimes(2);
    const { sportPk, includeInactive } = serviceMock.sportsModalitiesList.mock.calls[1][0];
    expect(sportPk).toBe(1);
    expect(includeInactive).toBe(true);
  });

  it('confirmDelete() runs sportsModalitiesDestroy(modalityId, sportPk) on accept', () => {
    access(component).confirmDelete(m1);
    expect(confirmMock.confirm).toHaveBeenCalledTimes(1);

    const opts = confirmMock.confirm.mock.calls[0][0] as { accept: () => void };
    opts.accept();

    expect(serviceMock.sportsModalitiesDestroy).toHaveBeenCalledWith({ id: m1.id, sportPk: 1 });
    expect(messageMock.add).toHaveBeenCalledTimes(1);
    expect(messageMock.add.mock.calls[0][0].severity).toBe('success');
  });

  it('restore() calls sportsModalitiesPartialUpdate(modalityId, sportPk, true, {is_active:true})', () => {
    serviceMock.sportsModalitiesList.mockClear();
    access(component).restore(m2);

    expect(serviceMock.sportsModalitiesPartialUpdate).toHaveBeenCalledWith({
      id: m2.id,
      sportPk: 1,
      includeInactive: true,
      patchedModalityAdmin: { is_active: true },
    });
    expect(messageMock.add).toHaveBeenCalledTimes(1);
    expect(serviceMock.sportsModalitiesList).toHaveBeenCalled();
  });
});
