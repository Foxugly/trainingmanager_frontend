import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventsService } from '../../../api/api/events.service';
import { EventRotiComponent } from './event-roti.component';

interface Protected {
  rotiSummary(): { count: number; average: number | null; my_score: number | null } | null;
  rotiDistribution(): { score: number; count: number }[];
  submitRoti(score: number): void;
}

const SUMMARY = {
  count: 5,
  average: 3.4,
  my_score: null,
  distribution: { '1': 0, '2': 1, '3': 2, '4': 1, '5': 1 },
};

describe('EventRotiComponent', () => {
  let fixture: ComponentFixture<EventRotiComponent>;
  let component: EventRotiComponent;
  let eventsMock: {
    eventsRotiRetrieve: ReturnType<typeof vi.fn>;
    eventsRotiUpdate: ReturnType<typeof vi.fn>;
  };
  let messageMock: { add: ReturnType<typeof vi.fn> };
  const access = (c: EventRotiComponent) => c as unknown as Protected;

  async function setup(isAthlete = false, canManage = true) {
    TestBed.resetTestingModule();
    eventsMock = {
      // The endpoint is typed as an array; the component unwraps it.
      eventsRotiRetrieve: vi.fn().mockReturnValue(of([SUMMARY])),
      eventsRotiUpdate: vi.fn().mockReturnValue(of({ ...SUMMARY, my_score: 2 })),
    };
    messageMock = { add: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [
        EventRotiComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        { provide: EventsService, useValue: eventsMock },
        { provide: MessageService, useValue: messageMock },
      ],
    })
      .overrideComponent(EventRotiComponent, { set: { template: '', imports: [] } })
      .compileComponents();

    fixture = TestBed.createComponent(EventRotiComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('eventId', 7);
    fixture.componentRef.setInput('isAthlete', isAthlete);
    fixture.componentRef.setInput('canManage', canManage);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => setup());

  it('loads + unwraps the array ROTI summary on init', () => {
    expect(eventsMock.eventsRotiRetrieve).toHaveBeenCalledWith({ eventPk: 7 });
    expect(access(component).rotiSummary()?.count).toBe(5);
    expect(access(component).rotiSummary()?.average).toBe(3.4);
  });

  it('rotiDistribution maps the 1..5 buckets to counts', () => {
    const dist = access(component).rotiDistribution();
    expect(dist.map((d) => d.score)).toEqual([1, 2, 3, 4, 5]);
    expect(dist.map((d) => d.count)).toEqual([0, 1, 2, 1, 1]);
  });

  it('submitRoti PUTs the score then refreshes the summary', () => {
    access(component).submitRoti(2);
    expect(eventsMock.eventsRotiUpdate).toHaveBeenCalledWith({ eventPk: 7, rotiUpsertRequest: { score: 2 } });
    expect(access(component).rotiSummary()?.my_score).toBe(2);
  });
});
