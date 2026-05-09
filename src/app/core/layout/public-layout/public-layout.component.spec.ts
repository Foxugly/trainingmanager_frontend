import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { Subject } from 'rxjs';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from '../../auth/auth.service';
import { LanguageService } from '../../i18n/language.service';
import { PublicLayoutComponent } from './public-layout.component';

describe('PublicLayoutComponent', () => {
  let fixture: ComponentFixture<PublicLayoutComponent>;

  beforeEach(async () => {
    TestBed.resetTestingModule();
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
        { provide: AuthService, useValue: { currentUser: signal(null).asReadonly(), logout: () => undefined } },
        { provide: LanguageService, useValue: { activeLang: signal('fr').asReadonly(), switchLanguage: () => ({ subscribe: () => undefined }) } },
      ],
    }).compileComponents();

    // Patch the real Router's events stream (topmenu inside subscribes to NavigationEnd).
    const router = TestBed.inject(Router);
    Object.defineProperty(router, 'events', { value: new Subject().asObservable(), configurable: true });

    fixture = TestBed.createComponent(PublicLayoutComponent);
    fixture.detectChanges();
  });

  it('renders <app-topmenu mode="public"> + <router-outlet> + <app-footer>', () => {
    const html = fixture.nativeElement.innerHTML as string;
    expect(html).toContain('<app-topmenu');
    expect(html).toContain('<app-footer');
    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBeNull();
  });
});
