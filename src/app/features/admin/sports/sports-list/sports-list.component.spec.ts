import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SportsService } from '../../../../api/api/sports.service';
import { Sport } from '../../../../api/model/sport';
import { TrainingTypeEnum } from '../../../../api/model/training-type-enum';
import { SportsListComponent } from './sports-list.component';

const sport1: Sport = {
  id: 1,
  name: 'Natation',
  slug: 'natation',
  is_active: true,
  energy_systems: [10, 20],
  created_at: '2026-04-01T00:00:00Z',
  default_training_type: TrainingTypeEnum.Structured,
};
const sport2: Sport = {
  id: 2,
  name: 'Yoga',
  slug: 'yoga',
  is_active: false,
  energy_systems: [],
  created_at: '2026-04-02T00:00:00Z',
  default_training_type: TrainingTypeEnum.Structured,
};

interface ProtectedFields {
  sports(): Sport[];
  loading(): boolean;
  includeInactive(): boolean;
  includeInactiveModel: boolean;
  confirmDelete(s: Sport): void;
  restore(s: Sport): void;
}

describe('SportsListComponent', () => {
  let fixture: ComponentFixture<SportsListComponent>;
  let component: SportsListComponent;

  let sportsServiceMock: {
    sportsList: ReturnType<typeof vi.fn>;
    sportsDestroy: ReturnType<typeof vi.fn>;
    sportsPartialUpdate: ReturnType<typeof vi.fn>;
  };
  let confirmMock: { confirm: ReturnType<typeof vi.fn> };
  let messageMock: { add: ReturnType<typeof vi.fn> };

  const access = (c: SportsListComponent) => c as unknown as ProtectedFields;

  beforeEach(async () => {
    sportsServiceMock = {
      sportsList: vi.fn().mockReturnValue(of({ count: 1, results: [sport1] })),
      sportsDestroy: vi.fn().mockReturnValue(of({})),
      sportsPartialUpdate: vi.fn().mockReturnValue(of({})),
    };
    confirmMock = { confirm: vi.fn() };
    messageMock = { add: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [
        SportsListComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: SportsService, useValue: sportsServiceMock },
        { provide: MessageService, useValue: messageMock },
      ],
    })
      .overrideComponent(SportsListComponent, {
        set: {
          template: '',
          imports: [],
          providers: [{ provide: ConfirmationService, useValue: confirmMock }],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(SportsListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads active sports on init (no includeInactive)', () => {
    expect(sportsServiceMock.sportsList).toHaveBeenCalledTimes(1);
    expect(sportsServiceMock.sportsList.mock.calls[0][0].includeInactive).toBeUndefined();
    expect(access(component).sports()).toEqual([sport1]);
  });

  it('reloads with includeInactive=true when the toggle flips', () => {
    sportsServiceMock.sportsList.mockReturnValue(of({ count: 2, results: [sport1, sport2] }));
    access(component).includeInactiveModel = true;
    fixture.detectChanges();

    expect(sportsServiceMock.sportsList).toHaveBeenCalledTimes(2);
    expect(sportsServiceMock.sportsList.mock.calls[1][0].includeInactive).toBe(true);
    expect(access(component).sports()).toEqual([sport1, sport2]);
  });

  it('confirmDelete() opens the confirmation dialog and runs sportsDestroy on accept', () => {
    access(component).confirmDelete(sport1);
    expect(confirmMock.confirm).toHaveBeenCalledTimes(1);

    const opts = confirmMock.confirm.mock.calls[0][0] as { accept: () => void };
    opts.accept();

    expect(sportsServiceMock.sportsDestroy).toHaveBeenCalledWith({ id: sport1.id });
    expect(messageMock.add).toHaveBeenCalledTimes(1);
    expect(messageMock.add.mock.calls[0][0].severity).toBe('success');
  });

  it('restore() calls sportsPartialUpdate(id, true, {is_active:true}) and reloads', () => {
    sportsServiceMock.sportsList.mockClear();
    access(component).restore(sport2);

    expect(sportsServiceMock.sportsPartialUpdate).toHaveBeenCalledWith({
      id: sport2.id,
      includeInactive: true,
      patchedSportAdminRequest: { is_active: true },
    });
    expect(messageMock.add).toHaveBeenCalledTimes(1);
    expect(sportsServiceMock.sportsList).toHaveBeenCalled();
  });
});
