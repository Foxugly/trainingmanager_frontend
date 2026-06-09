import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';
import { EventFreeformComponent } from './event-freeform.component';
import { EventsService } from '../../../api/api/events.service';

describe('EventFreeformComponent', () => {
  let fixture: ComponentFixture<EventFreeformComponent>;
  let eventsMock: { eventsPartialUpdate: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    eventsMock = { eventsPartialUpdate: vi.fn().mockReturnValue(of({ id: 7, training_richtext: '<p>x</p>' })) };
    await TestBed.configureTestingModule({ imports: [EventFreeformComponent] })
      .overrideComponent(EventFreeformComponent, { set: { template: '', imports: [] } })
      .compileComponents();
    TestBed.overrideProvider(EventsService, { useValue: eventsMock });
    fixture = TestBed.createComponent(EventFreeformComponent);
  });

  it('saves the richtext via eventsPartialUpdate({id, patchedEvent})', () => {
    const c = fixture.componentInstance as unknown as { draft: { set(v: string): void }; save(): void };
    fixture.componentRef.setInput('event', { id: 7, training_richtext: '' });
    fixture.componentRef.setInput('canManage', true);
    c.draft.set('<p>new</p>');
    c.save();
    expect(eventsMock.eventsPartialUpdate).toHaveBeenCalledWith({ id: 7, patchedEvent: { training_richtext: '<p>new</p>' } });
  });
});
