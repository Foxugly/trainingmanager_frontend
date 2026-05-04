import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { beforeEach, describe, expect, it } from 'vitest';
import { Me } from '../../../api/model/me';
import { AuthService } from '../../auth/auth.service';
import { LanguageService } from '../../i18n/language.service';
import { PublicLayoutComponent } from './public-layout.component';

const baseUser: Me = {
  id: 17,
  username: 'coach',
  first_name: 'Renaud',
  last_name: 'V',
  email: 'r@example.com',
  language: 'fr',
  is_staff: false,
} as unknown as Me;

interface ProtectedFields {
  isAuthenticated(): boolean;
  mobileMenuOpen(): boolean;
  toggleMobileMenu(): void;
  closeMobileMenu(): void;
}

describe('PublicLayoutComponent', () => {
  let fixture: ComponentFixture<PublicLayoutComponent>;
  let component: PublicLayoutComponent;
  let userSig: ReturnType<typeof signal<Me | null>>;

  const access = (c: PublicLayoutComponent) => c as unknown as ProtectedFields;

  async function setup(user: Me | null) {
    TestBed.resetTestingModule();
    userSig = signal<Me | null>(user);

    await TestBed.configureTestingModule({
      imports: [
        PublicLayoutComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        MessageService,
        {
          provide: AuthService,
          useValue: { currentUser: userSig.asReadonly(), logout: () => undefined },
        },
        {
          provide: LanguageService,
          useValue: { activeLang: signal('fr').asReadonly(), switchLanguage: () => ({ subscribe: () => undefined }) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PublicLayoutComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  describe('logged out', () => {
    beforeEach(async () => {
      await setup(null);
    });

    it('isAuthenticated is false (Dashboard nav link should be hidden)', () => {
      expect(access(component).isAuthenticated()).toBe(false);
    });

    it('mobile menu starts closed and toggles open/closed via the API', () => {
      expect(access(component).mobileMenuOpen()).toBe(false);
      access(component).toggleMobileMenu();
      expect(access(component).mobileMenuOpen()).toBe(true);
      access(component).closeMobileMenu();
      expect(access(component).mobileMenuOpen()).toBe(false);
    });
  });

  describe('logged in', () => {
    beforeEach(async () => {
      await setup(baseUser);
    });

    it('isAuthenticated is true (Dashboard nav link should be visible)', () => {
      expect(access(component).isAuthenticated()).toBe(true);
    });
  });

  describe('header structure', () => {
    beforeEach(async () => {
      await setup(null);
    });

    it('nav links use routerLinks for /, /features, /contribute (no #-anchors)', () => {
      const html = fixture.nativeElement.innerHTML as string;
      expect(html).toContain('public.nav.home');
      expect(html).toContain('public.nav.features');
      expect(html).toContain('public.nav.contribute');
      // No legacy #-anchors leak
      expect(html).not.toContain('href="#hero"');
      expect(html).not.toContain('href="#features"');
      expect(html).not.toContain('href="#contribute"');
    });

    it('footer is minimal — only the rights line, no nav links', () => {
      const footer = fixture.nativeElement.querySelector('footer');
      expect(footer).not.toBeNull();
      const footerHtml = (footer as HTMLElement).innerHTML;
      expect(footerHtml).toContain('public.footer.rights');
      expect(footerHtml).not.toContain('public.nav.home');
      expect(footerHtml).not.toContain('public.nav.features');
      expect(footerHtml).not.toContain('public.nav.contribute');
    });
  });
});
