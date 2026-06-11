import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { describe, expect, it } from 'vitest';
import { Me } from '../../../api/model/me';
import { AuthService } from '../../auth/auth.service';
import { LanguageService } from '../../i18n/language.service';
import { MainLayoutComponent } from './main-layout.component';

const baseUser: Me = {
  id: 17,
  username: 'coach',
  first_name: 'Renaud',
  last_name: 'V',
  email: 'r@example.com',
  language: 'fr',
  is_staff: false,
  is_superuser: false,
} as unknown as Me;

const staffUser: Me = { ...baseUser, is_staff: true };

describe('MainLayoutComponent', () => {
  let fixture: ComponentFixture<MainLayoutComponent>;
  let component: MainLayoutComponent;
  let userSig: ReturnType<typeof signal<Me | null>>;

  async function setup(user: Me | null) {
    TestBed.resetTestingModule();
    userSig = signal<Me | null>(user);

    await TestBed.configureTestingModule({
      imports: [
        MainLayoutComponent,
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

    fixture = TestBed.createComponent(MainLayoutComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('renders successfully for a non-staff user (header + nav links + UserMenu integrated)', async () => {
    await setup(baseUser);
    expect(component).toBeTruthy();
    const html = fixture.nativeElement.innerHTML as string;
    expect(html).toContain('app-language-switcher');
    expect(html).toContain('app-user-menu');
    expect(html).toContain('nav.dashboard');
    expect(html).toContain('nav.teams');
    expect(html).toContain('nav.programs');
    expect(html).toContain('nav.calendar');
    expect(html).not.toContain('nav.admin');
  });

  it('does not render an admin link in the center nav even for staff (admin lives in the user menu)', async () => {
    await setup(staffUser);
    const html = fixture.nativeElement.innerHTML as string;
    expect(html).not.toContain('nav.admin');
    // The Soutenir CTA is the last center nav item in authenticated mode.
    expect(html).toContain('public.nav.support');
  });

  it('does not expose admin link when current user is null', async () => {
    await setup(null);
    const html = fixture.nativeElement.innerHTML as string;
    expect(html).not.toContain('nav.admin');
  });
});
