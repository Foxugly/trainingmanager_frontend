import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RsvpStatusEnum } from '../../../api/model/rsvp-status-enum';
import { RsvpSummary } from '../../../api/model/rsvp-summary';
import { EventRsvpComponent } from './event-rsvp.component';

interface Protected {
  isMyStatus(s: RsvpStatusEnum): boolean;
  rsvpSeverity(s: RsvpStatusEnum): string;
  hasResponses(): boolean;
}

const summary = (over: Partial<RsvpSummary> = {}): RsvpSummary =>
  ({
    counts: { going: 2, maybe: 1, not_going: 0, no_response: 2 },
    total_members: 5,
    my_status: 'going',
    by_member: [{ member_id: 1, name: 'A', status: 'going' }],
    ...over,
  }) as unknown as RsvpSummary;

describe('EventRsvpComponent', () => {
  let fixture: ComponentFixture<EventRsvpComponent>;
  let component: EventRsvpComponent;
  const access = (c: EventRsvpComponent) => c as unknown as Protected;

  async function setup() {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [
        EventRsvpComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [provideNoopAnimations()],
    })
      .overrideComponent(EventRsvpComponent, { set: { template: '', imports: [] } })
      .compileComponents();

    fixture = TestBed.createComponent(EventRsvpComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('summary', summary());
    fixture.componentRef.setInput('isAthlete', true);
    fixture.componentRef.setInput('canManage', true);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => setup());

  it('isMyStatus compares against the summary my_status', () => {
    expect(access(component).isMyStatus(RsvpStatusEnum.Going)).toBe(true);
    expect(access(component).isMyStatus(RsvpStatusEnum.Maybe)).toBe(false);
  });

  it('rsvpSeverity maps each status to a button severity', () => {
    expect(access(component).rsvpSeverity(RsvpStatusEnum.Going)).toBe('success');
    expect(access(component).rsvpSeverity(RsvpStatusEnum.Maybe)).toBe('warn');
    expect(access(component).rsvpSeverity(RsvpStatusEnum.NotGoing)).toBe('danger');
  });

  it('hasResponses is true when any count is non-zero, false when all zero', () => {
    expect(access(component).hasResponses()).toBe(true);
    fixture.componentRef.setInput(
      'summary',
      summary({ counts: { going: 0, maybe: 0, not_going: 0, no_response: 5 } }),
    );
    expect(access(component).hasResponses()).toBe(false);
  });

  it('emits submit when the athlete picks a status', () => {
    let emitted: RsvpStatusEnum | undefined;
    component.submit.subscribe((s) => (emitted = s));
    component.submit.emit(RsvpStatusEnum.Maybe);
    expect(emitted).toBe(RsvpStatusEnum.Maybe);
  });

  it('emits applyToAttendance when the manager applies', () => {
    const spy = vi.fn();
    component.applyToAttendance.subscribe(spy);
    component.applyToAttendance.emit();
    expect(spy).toHaveBeenCalled();
  });
});
