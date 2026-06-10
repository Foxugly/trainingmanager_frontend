import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { EventFreeformComponent } from './event-freeform.component';
import { EventsService } from '../../../api/api/events.service';

describe('EventFreeformComponent', () => {
  let fixture: ComponentFixture<EventFreeformComponent>;
  let eventsMock: { eventsPartialUpdate: ReturnType<typeof vi.fn> };
  let messageMock: { add: ReturnType<typeof vi.fn> };
  let translocoMock: { translate: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    eventsMock = {
      eventsPartialUpdate: vi.fn().mockReturnValue(of({ id: 7, training_richtext: '<p>x</p>' })),
    };
    messageMock = { add: vi.fn() };
    // Echo the key so we can assert which i18n key was translated (not a raw key passthrough).
    translocoMock = { translate: vi.fn((key: string) => `t:${key}`) };
    await TestBed.configureTestingModule({ imports: [EventFreeformComponent] })
      .overrideComponent(EventFreeformComponent, { set: { template: '', imports: [] } })
      .compileComponents();
    TestBed.overrideProvider(EventsService, { useValue: eventsMock });
    TestBed.overrideProvider(MessageService, { useValue: messageMock });
    TestBed.overrideProvider(TranslocoService, { useValue: translocoMock });
    fixture = TestBed.createComponent(EventFreeformComponent);
  });

  it('saves the richtext via eventsPartialUpdate({id, patchedEventRequest})', () => {
    const c = fixture.componentInstance as unknown as {
      draft: { set(v: string): void };
      save(): void;
    };
    fixture.componentRef.setInput('event', { id: 7, training_richtext: '' });
    fixture.componentRef.setInput('canManage', true);
    c.draft.set('<p>new</p>');
    c.save();
    expect(eventsMock.eventsPartialUpdate).toHaveBeenCalledWith({
      id: 7,
      patchedEventRequest: { training_richtext: '<p>new</p>' },
    });
  });

  it('toasts a translated save_failed error (not a raw i18n key) when the save fails', () => {
    eventsMock.eventsPartialUpdate.mockReturnValue(throwError(() => new Error('boom')));
    const c = fixture.componentInstance as unknown as {
      draft: { set(v: string): void };
      save(): void;
    };
    fixture.componentRef.setInput('event', { id: 7, training_richtext: '' });
    fixture.componentRef.setInput('canManage', true);
    c.draft.set('<p>new</p>');
    c.save();
    expect(translocoMock.translate).toHaveBeenCalledWith('common.save_failed');
    expect(messageMock.add).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'error',
        summary: 't:common.error',
        detail: 't:common.save_failed',
      }),
    );
  });
});
