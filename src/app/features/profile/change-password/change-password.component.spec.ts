import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService as AuthApi } from '../../../api/api/auth.service';
import { ChangePasswordComponent } from './change-password.component';

interface ProtectedFields {
  loading(): boolean;
  errors(): { [k: string]: string[] } | null;
  fieldError(name: string): string | null;
  form: {
    patchValue: (
      v: Partial<{
        current_password: string;
        new_password: string;
        new_password_confirm: string;
      }>,
    ) => void;
  };
  submit(): void;
  cancel(): void;
}

describe('ChangePasswordComponent', () => {
  let fixture: ComponentFixture<ChangePasswordComponent>;
  let component: ChangePasswordComponent;
  let authApiMock: { authPasswordChangeCreate: ReturnType<typeof vi.fn> };
  let messageService: MessageService;
  let router: Router;

  const access = (c: ChangePasswordComponent) => c as unknown as ProtectedFields;

  beforeEach(async () => {
    authApiMock = { authPasswordChangeCreate: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [
        ChangePasswordComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideHttpClient(),
        provideNoopAnimations(),
        provideRouter([]),
        MessageService,
        { provide: AuthApi, useValue: authApiMock },
      ],
    })
      .overrideComponent(ChangePasswordComponent, { set: { template: '', imports: [] } })
      .compileComponents();

    fixture = TestBed.createComponent(ChangePasswordComponent);
    component = fixture.componentInstance;
    messageService = TestBed.inject(MessageService);
    router = TestBed.inject(Router);
    vi.spyOn(messageService, 'add');
    fixture.detectChanges();
  });

  it('blocks client-side when new != confirm', () => {
    access(component).form.patchValue({
      current_password: 'old',
      new_password: 'newpass1',
      new_password_confirm: 'newpass2',
    });

    access(component).submit();

    expect(authApiMock.authPasswordChangeCreate).not.toHaveBeenCalled();
    expect(access(component).fieldError('new_password_confirm')).not.toBeNull();
  });

  it('calls the API and navigates to /profile on success', () => {
    authApiMock.authPasswordChangeCreate.mockReturnValue(of({ detail: 'ok' }));
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    access(component).form.patchValue({
      current_password: 'old',
      new_password: 'newpass1',
      new_password_confirm: 'newpass1',
    });

    access(component).submit();

    expect(authApiMock.authPasswordChangeCreate).toHaveBeenCalledWith({
      passwordChangeRequest: {
        current_password: 'old',
        new_password: 'newpass1',
      },
    });
    expect(messageService.add).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'success' }),
    );
    expect(navigate).toHaveBeenCalledWith(['/profile']);
  });

  it('maps current_password_invalid to a field error', () => {
    authApiMock.authPasswordChangeCreate.mockReturnValue(
      throwError(() => ({ status: 400, error: { code: 'current_password_invalid' } })),
    );
    access(component).form.patchValue({
      current_password: 'wrong',
      new_password: 'newpass1',
      new_password_confirm: 'newpass1',
    });

    access(component).submit();

    expect(access(component).fieldError('current_password')).not.toBeNull();
    expect(access(component).loading()).toBe(false);
  });

  it('maps password_unchanged to the new_password field', () => {
    authApiMock.authPasswordChangeCreate.mockReturnValue(
      throwError(() => ({ status: 400, error: { code: 'password_unchanged' } })),
    );
    access(component).form.patchValue({
      current_password: 'old',
      new_password: 'old',
      new_password_confirm: 'old',
    });

    access(component).submit();

    expect(access(component).fieldError('new_password')).not.toBeNull();
  });

  it('maps fields.new_password inline', () => {
    authApiMock.authPasswordChangeCreate.mockReturnValue(
      throwError(() => ({ status: 400, error: { fields: { new_password: ['Too short.'] } } })),
    );
    access(component).form.patchValue({
      current_password: 'old',
      new_password: 'x',
      new_password_confirm: 'x',
    });

    access(component).submit();

    expect(access(component).fieldError('new_password')).toBe('Too short.');
  });

  it('cancel() navigates to /profile', () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    access(component).cancel();
    expect(navigate).toHaveBeenCalledWith(['/profile']);
  });
});
