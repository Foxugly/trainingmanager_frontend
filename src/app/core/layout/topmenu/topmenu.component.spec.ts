import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router, NavigationEnd, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Me } from '../../../api/model/me';
import { AuthService } from '../../auth/auth.service';
import { LanguageService } from '../../i18n/language.service';
import { NotificationBellComponent } from '../notification-bell/notification-bell.component';
import { NotificationService } from '../../notifications/notification.service';
import { TopmenuComponent } from './topmenu.component';

interface ProtectedFields {
  mobileMenuOpen(): boolean;
  toggleMobile(): void;
  closeMobile(): void;
  onDocumentClick(event: MouseEvent): void;
}

const baseUser: Me = {
  id: 1, username: 'coach', first_name: 'R', last_name: 'V',
  email: 'r@example.com', language: 'fr', is_staff: false,
} as unknown as Me;

const staffUser: Me = { ...baseUser, is_staff: true } as Me;

describe('TopmenuComponent', () => {
  let fixture: ComponentFixture<TopmenuComponent>;
  let userSig: ReturnType<typeof signal<Me | null>>;
  let routerEvents: Subject<unknown>;
  const access = (c: TopmenuComponent) => c as unknown as ProtectedFields;

  async function setup(opts: {
    mode?: 'public' | 'authenticated';
    user?: Me | null;
  } = {}) {
    TestBed.resetTestingModule();
    userSig = signal<Me | null>(opts.user ?? null);
    routerEvents = new Subject<unknown>();

    await TestBed.configureTestingModule({
      imports: [
        TopmenuComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        MessageService,
        { provide: AuthService, useValue: { currentUser: userSig.asReadonly(), logout: () => undefined } },
        { provide: LanguageService, useValue: { activeLang: signal('fr').asReadonly(), switchLanguage: () => ({ subscribe: () => undefined }) } },
        {
          provide: NotificationService,
          useValue: {
            unreadCount: signal(0).asReadonly(),
            items: signal([]).asReadonly(),
            refreshUnread: () => ({ subscribe: () => undefined }),
            loadRecent: () => ({ subscribe: () => undefined }),
            markRead: () => ({ subscribe: () => undefined }),
            markAllRead: () => ({ subscribe: () => undefined }),
            reset: () => undefined,
          },
        },
      ],
    })
      .overrideComponent(NotificationBellComponent, {
        set: { template: '<span class="notif-bell-stub"></span>', imports: [] },
      })
      .compileComponents();

    // Patch the real Router's events stream so we can control NavigationEnd timing without
    // breaking Router DI (RouterLink/RouterLinkActive depend on a real Router instance).
    const router = TestBed.inject(Router);
    Object.defineProperty(router, 'events', { value: routerEvents.asObservable(), configurable: true });

    fixture = TestBed.createComponent(TopmenuComponent);
    fixture.componentRef.setInput('mode', opts.mode ?? 'public');
    fixture.detectChanges();
    return fixture;
  }

  it('public mode renders the 4 public nav keys', async () => {
    await setup({ mode: 'public' });
    const html = fixture.nativeElement.innerHTML as string;
    expect(html).toContain('public.nav.home');
    expect(html).toContain('public.nav.features');
    expect(html).toContain('public.nav.about');
    expect(html).toContain('public.nav.contribute');
    expect(html).not.toContain('nav.dashboard');
  });

  it('authenticated mode renders the app nav keys', async () => {
    await setup({ mode: 'authenticated', user: baseUser });
    const html = fixture.nativeElement.innerHTML as string;
    expect(html).toContain('nav.dashboard');
    expect(html).toContain('nav.teams');
    expect(html).toContain('nav.programs');
    expect(html).toContain('nav.calendar');
    expect(html).toContain('public.nav.support');
  });

  it('authenticated mode does NOT render an Admin link in the center nav (even for staff)', async () => {
    await setup({ mode: 'authenticated', user: baseUser });
    expect(fixture.nativeElement.innerHTML).not.toContain('nav.admin');

    await setup({ mode: 'authenticated', user: staffUser });
    expect(fixture.nativeElement.innerHTML).not.toContain('nav.admin');
  });

  it('authenticated mode renders the Soutenir CTA as a nav-cta link to /contribute', async () => {
    await setup({ mode: 'authenticated', user: baseUser });
    const cta = fixture.nativeElement.querySelector('a.nav-cta') as HTMLAnchorElement | null;
    expect(cta).toBeTruthy();
    expect(cta!.getAttribute('href')).toBe('/contribute');
    expect(cta!.innerHTML).toContain('public.nav.support');
  });

  it('mobile menu starts closed; toggle/close mutate the signal', async () => {
    await setup();
    expect(access(fixture.componentInstance).mobileMenuOpen()).toBe(false);
    access(fixture.componentInstance).toggleMobile();
    expect(access(fixture.componentInstance).mobileMenuOpen()).toBe(true);
    access(fixture.componentInstance).closeMobile();
    expect(access(fixture.componentInstance).mobileMenuOpen()).toBe(false);
  });

  it('clicks outside the host close the mobile menu', async () => {
    await setup();
    const c = access(fixture.componentInstance);
    c.toggleMobile();
    expect(c.mobileMenuOpen()).toBe(true);

    const outside = document.createElement('div');
    document.body.appendChild(outside);
    c.onDocumentClick({ target: outside } as unknown as MouseEvent);
    expect(c.mobileMenuOpen()).toBe(false);

    outside.remove();
  });

  it('clicks inside the host do NOT close the mobile menu', async () => {
    await setup();
    const c = access(fixture.componentInstance);
    c.toggleMobile();
    const inside = fixture.nativeElement.querySelector('button')!;
    c.onDocumentClick({ target: inside } as unknown as MouseEvent);
    expect(c.mobileMenuOpen()).toBe(true);
  });

  it('closes the mobile menu on Router NavigationEnd', async () => {
    await setup();
    const c = access(fixture.componentInstance);
    c.toggleMobile();
    expect(c.mobileMenuOpen()).toBe(true);

    routerEvents.next(new NavigationEnd(1, '/foo', '/foo'));
    expect(c.mobileMenuOpen()).toBe(false);
  });

  it('sets aria-controls on the hamburger linking to the drawer id', async () => {
    await setup();
    const hamburger = fixture.nativeElement.querySelector('button.hamburger') as HTMLButtonElement;
    expect(hamburger).toBeTruthy();
    expect(hamburger.getAttribute('aria-controls')).toBe('topmenu-drawer');
  });

  it('the drawer has id=topmenu-drawer when open', async () => {
    await setup();
    const c = access(fixture.componentInstance);
    c.toggleMobile();
    fixture.detectChanges();
    const drawer = fixture.nativeElement.querySelector('.drawer') as HTMLElement | null;
    expect(drawer).toBeTruthy();
    expect(drawer!.id).toBe('topmenu-drawer');
  });

  it('Escape keydown on document closes the mobile menu', async () => {
    await setup();
    const c = access(fixture.componentInstance);
    c.toggleMobile();
    expect(c.mobileMenuOpen()).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(c.mobileMenuOpen()).toBe(false);
  });

  it('hamburger aria-expanded reflects mobileMenuOpen()', async () => {
    await setup();
    const hamburger = fixture.nativeElement.querySelector('button.hamburger') as HTMLButtonElement;
    expect(hamburger.getAttribute('aria-expanded')).toBe('false');
    const c = access(fixture.componentInstance);
    c.toggleMobile();
    fixture.detectChanges();
    expect(hamburger.getAttribute('aria-expanded')).toBe('true');
    c.closeMobile();
    fixture.detectChanges();
    expect(hamburger.getAttribute('aria-expanded')).toBe('false');
  });

  it('renders the notification bell only in authenticated mode', async () => {
    await setup({ mode: 'public' });
    expect(fixture.nativeElement.querySelector('app-notification-bell')).toBeFalsy();

    await setup({ mode: 'authenticated', user: baseUser });
    expect(fixture.nativeElement.querySelector('app-notification-bell')).toBeTruthy();
  });

  it('does NOT render legacy anchor hrefs (#hero, #features, #contribute)', async () => {
    await setup({ mode: 'public' });
    const html = fixture.nativeElement.innerHTML as string;
    expect(html).not.toContain('href="#hero"');
    expect(html).not.toContain('href="#features"');
    expect(html).not.toContain('href="#contribute"');
  });
});
