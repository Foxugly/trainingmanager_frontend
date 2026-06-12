import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { Select } from 'primeng/select';
import { CustomUserPublic } from '../../../api/model/custom-user-public';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';

/**
 * Team "encadrement" (managers) editor: lists the selected managers and offers
 * a picker dialog to add candidates. Stateless w.r.t. the id list — it reads
 * `managerIds` and emits `managerIdsChange`; the parent team form keeps the
 * `managers_ids` control as the source of truth. Extracted from teams-form.
 */
@Component({
  selector: 'app-team-managers',
  imports: [FormsModule, TranslocoPipe, Button, Dialog, Select, EmptyStateComponent],
  templateUrl: './team-managers.component.html',
  styleUrl: './team-managers.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamManagersComponent {
  /** Candidate pool (the team's eligible users). */
  readonly availableManagers = input<CustomUserPublic[]>([]);
  /** Currently-selected manager ids (mirrored from the parent form control). */
  readonly managerIds = input<number[]>([]);
  /** Emits the new id list when a manager is added or removed. */
  readonly managerIdsChange = output<number[]>();

  protected readonly managerDialogVisible = signal(false);
  protected readonly managerPickId = signal<number | null>(null);

  protected readonly selectedManagers = computed<CustomUserPublic[]>(() => {
    const ids = new Set(this.managerIds());
    return this.availableManagers().filter((m) => ids.has(m.id));
  });

  /** Managers not yet selected — the candidate pool for the add picker. */
  protected readonly addableManagers = computed<CustomUserPublic[]>(() => {
    const ids = new Set(this.managerIds());
    return this.availableManagers().filter((m) => !ids.has(m.id));
  });

  /** Two-letter initials for the avatar pill. */
  protected managerInitials(m: CustomUserPublic): string {
    const first = (m.first_name ?? '').trim();
    const last = (m.last_name ?? '').trim();
    if (first || last) {
      return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || first.charAt(0).toUpperCase();
    }
    return '?';
  }

  /** Friendly display label for a candidate in the picker. */
  protected managerLabel(m: CustomUserPublic): string {
    const name = `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim();
    return name || `#${m.id}`;
  }

  protected removeManager(id: number): void {
    this.managerIdsChange.emit(this.managerIds().filter((mid) => mid !== id));
  }

  protected openAddManager(): void {
    this.managerPickId.set(null);
    this.managerDialogVisible.set(true);
  }

  protected closeAddManagerDialog(): void {
    this.managerDialogVisible.set(false);
  }

  /** Append the picked candidate to the id list and close the dialog. */
  protected confirmAddManager(): void {
    const id = this.managerPickId();
    if (id === null) return;
    if (!this.managerIds().includes(id)) {
      this.managerIdsChange.emit([...this.managerIds(), id]);
    }
    this.managerDialogVisible.set(false);
  }
}
