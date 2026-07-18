import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StaffService } from '../../../../api/api/staff.service';
import { StaffUser } from '../../../../api/model/staff-user';
import { UsersListComponent } from './users-list.component';

const user1: StaffUser = {
  id: 1,
  email: 'a@b.c',
  first_name: 'Mimi',
  last_name: 'Dupont',
  subscription_bypass: false,
  bypass_note: '',
  bypass_granted_at: null,
};

interface ProtectedFields {
  users(): StaffUser[];
  loading(): boolean;
  error(): boolean;
  busy(): number | null;
  query: string;
  search(): void;
  toggle(user: StaffUser, next: boolean): void;
  setNote(id: number, value: string): void;
}
const access = (c: UsersListComponent) => c as unknown as ProtectedFields;

describe('UsersListComponent', () => {
  let fixture: ComponentFixture<UsersListComponent>;
  let component: UsersListComponent;
  let staffMock: {
    staffUsersRetrieve: ReturnType<typeof vi.fn>;
    staffUsersPartialUpdate: ReturnType<typeof vi.fn>;
  };
  let messageMock: { add: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    staffMock = {
      staffUsersRetrieve: vi.fn().mockReturnValue(of({ results: [user1] })),
      staffUsersPartialUpdate: vi
        .fn()
        .mockReturnValue(of({ ...user1, subscription_bypass: true })),
    };
    messageMock = { add: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [
        UsersListComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        { provide: StaffService, useValue: staffMock },
        { provide: MessageService, useValue: messageMock },
      ],
    })
      .overrideComponent(UsersListComponent, {
        set: { template: '', imports: [] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(UsersListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('recherche les comptes avec le terme saisi', () => {
    staffMock.staffUsersRetrieve.mockClear();
    access(component).query = 'mimi';
    access(component).search();

    expect(staffMock.staffUsersRetrieve).toHaveBeenCalledWith({ q: 'mimi' });
    expect(access(component).users().length).toBe(1);
    expect(access(component).users()[0].email).toBe('a@b.c');
  });

  it('bascule l acces offert et met a jour la ligne', () => {
    access(component).search();
    access(component).toggle(user1, true);

    expect(staffMock.staffUsersPartialUpdate).toHaveBeenCalledWith({
      id: 1,
      patchedStaffUserRequest: { subscription_bypass: true, bypass_note: '' },
    });
    expect(access(component).users()[0].subscription_bypass).toBe(true);
    expect(messageMock.add).toHaveBeenCalledTimes(1);
    expect(messageMock.add.mock.calls[0][0].severity).toBe('success');
  });

  it('envoie le motif saisi avec la bascule', () => {
    access(component).search();
    access(component).setNote(1, 'asso X');
    access(component).toggle({ id: 1, bypass_note: '' } as StaffUser, true);

    expect(staffMock.staffUsersPartialUpdate).toHaveBeenCalledWith({
      id: 1,
      patchedStaffUserRequest: { subscription_bypass: true, bypass_note: 'asso X' },
    });
  });

  it('affiche une erreur quand la recherche echoue', () => {
    staffMock.staffUsersRetrieve.mockReturnValueOnce(throwError(() => new Error('boom')));
    access(component).search();

    expect(access(component).error()).toBe(true);
    expect(access(component).loading()).toBe(false);
  });
});
