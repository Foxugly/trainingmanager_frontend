import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SportsService } from '../../../../api/api/sports.service';
import { Sport } from '../../../../api/model/sport';
import { TrainingTypeEnum } from '../../../../api/model/training-type-enum';
import { ModalitiesHubComponent } from './modalities-hub.component';

const sport1: Sport = {
  id: 1,
  name: 'Natation',
  slug: 'natation',
  is_active: true,
  energy_systems: [10, 20],
  created_at: '2026-04-01T00:00:00Z',
  default_training_type: TrainingTypeEnum.Structured,
};

interface ProtectedFields {
  sports(): Sport[];
  loading(): boolean;
}

describe('ModalitiesHubComponent', () => {
  let fixture: ComponentFixture<ModalitiesHubComponent>;
  let component: ModalitiesHubComponent;
  let serviceMock: { sportsList: ReturnType<typeof vi.fn> };

  const access = (c: ModalitiesHubComponent) => c as unknown as ProtectedFields;

  async function setup(results: Sport[] = [sport1]) {
    TestBed.resetTestingModule();
    serviceMock = {
      sportsList: vi.fn().mockReturnValue(of({ count: results.length, results })),
    };

    await TestBed.configureTestingModule({
      imports: [
        ModalitiesHubComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: SportsService, useValue: serviceMock },
      ],
    })
      .overrideComponent(ModalitiesHubComponent, {
        set: { template: '', imports: [] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ModalitiesHubComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await setup();
  });

  it('loads the active sports on init', () => {
    expect(serviceMock.sportsList).toHaveBeenCalledTimes(1);
    expect(access(component).sports()).toEqual([sport1]);
    expect(access(component).loading()).toBe(false);
  });

  it('exposes an empty list when no sports are returned', async () => {
    await setup([]);
    expect(access(component).sports()).toEqual([]);
  });
});
