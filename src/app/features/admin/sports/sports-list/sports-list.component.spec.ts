import { HttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SportsService } from '../../../../api/api/sports.service';
import { Sport } from '../../../../api/model/sport';
import { SportsListComponent } from './sports-list.component';

const sport1: Sport = {
  id: 1,
  name: 'Natation',
  slug: 'natation',
  is_active: true,
  energy_systems: [10, 20],
  created_at: '2026-04-01T00:00:00Z',
};
const sport2: Sport = {
  id: 2,
  name: 'Yoga',
  slug: 'yoga',
  is_active: false,
  energy_systems: [],
  created_at: '2026-04-02T00:00:00Z',
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
  let httpMock: { get: ReturnType<typeof vi.fn>; patch: ReturnType<typeof vi.fn> };
  let confirmMock: { confirm: ReturnType<typeof vi.fn> };
  let messageMock: { add: ReturnType<typeof vi.fn> };

  const access = (c: SportsListComponent) => c as unknown as ProtectedFields;

  beforeEach(async () => {
    sportsServiceMock = {
      sportsList: vi.fn().mockReturnValue(of({ count: 1, results: [sport1] })),
      sportsDestroy: vi.fn().mockReturnValue(of({})),
      sportsPartialUpdate: vi.fn().mockReturnValue(of({})),
    };
    httpMock = {
      get: vi.fn().mockReturnValue(of({ count: 2, results: [sport1, sport2] })),
      patch: vi.fn().mockReturnValue(of({})),
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
        { provide: HttpClient, useValue: httpMock },
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

  it('loads active sports through SportsService on init', () => {
    expect(sportsServiceMock.sportsList).toHaveBeenCalledTimes(1);
    expect(httpMock.get).not.toHaveBeenCalled();
    expect(access(component).sports()).toEqual([sport1]);
  });

  it('reloads via HttpClient with include_inactive=true when the toggle flips', () => {
    access(component).includeInactiveModel = true;
    fixture.detectChanges();

    expect(httpMock.get).toHaveBeenCalledTimes(1);
    const [url, options] = httpMock.get.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/sports\/$/);
    expect(options.params.include_inactive).toBe('true');
    expect(access(component).sports()).toEqual([sport1, sport2]);
  });

  it('confirmDelete() opens the confirmation dialog and runs sportsDestroy on accept', () => {
    access(component).confirmDelete(sport1);
    expect(confirmMock.confirm).toHaveBeenCalledTimes(1);

    const opts = confirmMock.confirm.mock.calls[0][0] as { accept: () => void };
    opts.accept();

    expect(sportsServiceMock.sportsDestroy).toHaveBeenCalledWith(sport1.id);
    expect(messageMock.add).toHaveBeenCalledTimes(1);
    expect(messageMock.add.mock.calls[0][0].severity).toBe('success');
  });

  it('restore() PATCHes via HttpClient with include_inactive=true and reloads', () => {
    sportsServiceMock.sportsList.mockClear();
    access(component).restore(sport2);

    expect(httpMock.patch).toHaveBeenCalledTimes(1);
    const [url, body, options] = httpMock.patch.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/sports\/2\/$/);
    expect(body).toEqual({ is_active: true });
    expect(options.params.include_inactive).toBe('true');
    expect(messageMock.add).toHaveBeenCalledTimes(1);
    expect(sportsServiceMock.sportsList).toHaveBeenCalled();
  });
});
