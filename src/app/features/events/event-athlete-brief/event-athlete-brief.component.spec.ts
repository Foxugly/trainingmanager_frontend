import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';
import { TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { EventAthleteBriefComponent } from './event-athlete-brief.component';
import { EventsService } from '../../../api/api/events.service';

describe('EventAthleteBriefComponent', () => {
  let fixture: ComponentFixture<EventAthleteBriefComponent>;
  let eventsMock: {
    eventsExplainCreate: ReturnType<typeof vi.fn>;
    eventsPartialUpdate: ReturnType<typeof vi.fn>;
  };
  let messageMock: { add: ReturnType<typeof vi.fn> };
  let translocoMock: { translate: ReturnType<typeof vi.fn> };

  const access = (c: EventAthleteBriefComponent) =>
    c as unknown as { draft: { (): string; set(v: string): void }; generate(): void; save(): void };

  beforeEach(async () => {
    eventsMock = {
      eventsExplainCreate: vi.fn().mockReturnValue(of({ athlete_brief: 'Brief IA fraîchement généré.' })),
      eventsPartialUpdate: vi.fn().mockReturnValue(of({ id: 7 })),
    };
    messageMock = { add: vi.fn() };
    translocoMock = { translate: vi.fn((key: string) => `t:${key}`) };
    await TestBed.configureTestingModule({ imports: [EventAthleteBriefComponent] })
      .overrideComponent(EventAthleteBriefComponent, { set: { template: '', imports: [] } })
      .compileComponents();
    TestBed.overrideProvider(EventsService, { useValue: eventsMock });
    TestBed.overrideProvider(MessageService, { useValue: messageMock });
    TestBed.overrideProvider(TranslocoService, { useValue: translocoMock });
    fixture = TestBed.createComponent(EventAthleteBriefComponent);
  });

  it('seeds the editable draft from the brief input (once)', () => {
    fixture.componentRef.setInput('eventId', 7);
    fixture.componentRef.setInput('brief', 'Brief initial.');
    fixture.componentRef.setInput('canManage', true);
    fixture.detectChanges();
    expect(access(fixture.componentInstance).draft()).toBe('Brief initial.');
  });

  it('does not clobber unsaved edits when the parent re-feeds the brief (same event)', () => {
    fixture.componentRef.setInput('eventId', 7);
    fixture.componentRef.setInput('brief', 'Brief initial.');
    fixture.componentRef.setInput('canManage', true);
    fixture.detectChanges();

    const c = access(fixture.componentInstance);
    c.draft.set('Mon edit non sauvegardé');
    // Parent refetches the event and re-feeds the brief (same eventId) — must NOT reseed.
    fixture.componentRef.setInput('brief', 'Brief initial.');
    fixture.detectChanges();
    expect(c.draft()).toBe('Mon edit non sauvegardé');
  });

  it('generate() calls explain and mirrors the result into the draft', () => {
    fixture.componentRef.setInput('eventId', 7);
    fixture.componentRef.setInput('canManage', true);
    fixture.detectChanges();

    access(fixture.componentInstance).generate();
    expect(eventsMock.eventsExplainCreate).toHaveBeenCalledWith({ id: 7 });
    expect(access(fixture.componentInstance).draft()).toBe('Brief IA fraîchement généré.');
  });

  it('save() PATCHes ai_athlete_brief via eventsPartialUpdate', () => {
    fixture.componentRef.setInput('eventId', 7);
    fixture.componentRef.setInput('canManage', true);
    fixture.detectChanges();

    const c = access(fixture.componentInstance);
    c.draft.set('Brief modifié par le coach.');
    c.save();
    expect(eventsMock.eventsPartialUpdate).toHaveBeenCalledWith({
      id: 7,
      patchedEventRequest: { ai_athlete_brief: 'Brief modifié par le coach.' },
    });
  });
});
