import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { Me } from '../../../api/model/me';
import { AuthService } from '../../auth/auth.service';
import { BellComponent } from './bell.component';

const user = { id: 1, is_staff: false } as unknown as Me;

interface Protected {
  hasUnread(): boolean;
  badge(): string;
}

describe('BellComponent (shared shell)', () => {
  let fixture: ComponentFixture<BellComponent>;
  let currentUser: ReturnType<typeof signal<Me | null>>;
  const access = (c: BellComponent) => c as unknown as Protected;

  function setup(opts: { count?: number; user?: Me | null } = {}) {
    TestBed.resetTestingModule();
    currentUser = signal<Me | null>(opts.user ?? user);
    TestBed.configureTestingModule({
      imports: [BellComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: AuthService, useValue: { currentUser: currentUser.asReadonly() } },
      ],
    });
    fixture = TestBed.createComponent(BellComponent);
    fixture.componentRef.setInput('icon', 'pi-bell');
    fixture.componentRef.setInput('label', 'Bell');
    fixture.componentRef.setInput('count', opts.count ?? 0);
    return fixture;
  }

  it('renders the trigger and caps the badge at 99+', () => {
    setup({ count: 150 });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.bell-trigger')).toBeTruthy();
    expect(access(fixture.componentInstance).badge()).toBe('99+');
    expect(access(fixture.componentInstance).hasUnread()).toBe(true);
  });

  it('hides the badge when count is zero', () => {
    setup({ count: 0 });
    fixture.detectChanges();
    expect(access(fixture.componentInstance).hasUnread()).toBe(false);
    expect(fixture.nativeElement.querySelector('p-overlaybadge, p-overlayBadge')).toBeFalsy();
  });

  it('emits poll at startup when authenticated', () => {
    setup({ user });
    const pollSpy = vi.fn();
    fixture.componentInstance.poll.subscribe(pollSpy);
    fixture.detectChanges(); // first CD runs the auth effect → startPolling → poll
    expect(pollSpy).toHaveBeenCalled();
  });

  it('does not emit poll when unauthenticated, and emits reset on logout', () => {
    setup({ user });
    const pollSpy = vi.fn();
    const resetSpy = vi.fn();
    fixture.componentInstance.poll.subscribe(pollSpy);
    fixture.componentInstance.reset.subscribe(resetSpy);
    fixture.detectChanges();
    pollSpy.mockClear();

    currentUser.set(null); // auth dropped
    fixture.detectChanges();
    expect(resetSpy).toHaveBeenCalled();
    expect(pollSpy).not.toHaveBeenCalled();
  });

  it('close() is safe to call when the popover is not open', () => {
    setup();
    fixture.detectChanges();
    expect(() => fixture.componentInstance.close()).not.toThrow();
  });
});
