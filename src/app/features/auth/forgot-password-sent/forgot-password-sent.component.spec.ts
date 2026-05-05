import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { describe, expect, it, beforeEach } from 'vitest';
import { ForgotPasswordSentComponent } from './forgot-password-sent.component';

describe('ForgotPasswordSentComponent', () => {
  async function setup() {
    await TestBed.configureTestingModule({
      imports: [
        ForgotPasswordSentComponent,
        TranslocoTestingModule.forRoot({
          langs: {
            fr: {
              auth: {
                forgot_password_sent: {
                  title: 'Vérifiez vos emails',
                  body_with_email: 'Email pour {{email}}',
                  body_no_email: 'Email envoyé.',
                  check_spam_hint: 'Vérifiez vos spams',
                  back_to_login: 'Retour',
                },
              },
            },
          },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [provideRouter([])],
    }).compileComponents();
  }

  beforeEach(async () => {
    await setup();
  });

  it('shows the no-email body when window.history.state has no email', async () => {
    window.history.replaceState({}, '');
    const fixture: ComponentFixture<ForgotPasswordSentComponent> = TestBed.createComponent(
      ForgotPasswordSentComponent,
    );
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Email envoyé.');
    expect(text).toContain('Retour');
  });

  it('uses the email from history.state when available', async () => {
    window.history.replaceState({ email: 'alice@local' }, '');
    const fixture: ComponentFixture<ForgotPasswordSentComponent> = TestBed.createComponent(
      ForgotPasswordSentComponent,
    );
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('alice@local');
  });
});
