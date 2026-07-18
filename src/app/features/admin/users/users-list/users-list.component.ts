import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { StaffService } from '../../../../api/api/staff.service';
import { StaffUser } from '../../../../api/model/staff-user';
import { ToastService } from '../../../../core/notifications/toast.service';

/**
 * Back-office account search + offered-access toggle.
 * Standalone (not `TaxonomyListBase`): this is an account search + a single
 * boolean patch, unrelated to the active/inactive soft-delete cycle the base
 * class models for taxonomy CRUD.
 */
@Component({
  selector: 'app-users-list',
  imports: [FormsModule, TableModule, Button, InputText, Message, Tag, ToggleSwitch, TranslocoPipe],
  templateUrl: './users-list.component.html',
  styleUrl: './users-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersListComponent {
  private readonly staffService = inject(StaffService);
  private readonly toast = inject(ToastService);

  protected query = '';
  protected readonly users = signal<StaffUser[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  protected readonly busy = signal<number | null>(null);

  constructor() {
    this.search();
  }

  protected search(): void {
    this.loading.set(true);
    this.error.set(false);
    this.staffService.staffUsersRetrieve({ q: this.query || undefined }).subscribe({
      next: (response) => {
        this.users.set(response.results);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  protected toggle(user: StaffUser, next: boolean): void {
    this.busy.set(user.id);
    this.staffService
      .staffUsersPartialUpdate({
        id: user.id,
        patchedStaffUserRequest: { subscription_bypass: next, bypass_note: user.bypass_note },
      })
      .subscribe({
        next: (updated) => {
          this.users.update((list) => list.map((u) => (u.id === updated.id ? updated : u)));
          this.busy.set(null);
          this.toast.success('admin.users.actions.saved');
        },
        error: () => {
          this.busy.set(null);
          this.toast.error('admin.users.errors.save_failed');
        },
      });
  }
}
