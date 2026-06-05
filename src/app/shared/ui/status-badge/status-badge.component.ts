import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Tag } from 'primeng/tag';

export type StatusBadgeKind = 'active' | 'inactive';

@Component({
  selector: 'app-status-badge',
  imports: [Tag],
  template: `<p-tag [severity]="severity()" [value]="label()" [icon]="icon()" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusBadgeComponent {
  readonly kind = input.required<StatusBadgeKind>();
  readonly label = input.required<string>();

  readonly severity = computed<'success' | 'secondary'>(() =>
    this.kind() === 'active' ? 'success' : 'secondary',
  );
  readonly icon = computed(() => (this.kind() === 'active' ? 'pi pi-check-circle' : 'pi pi-ban'));
}
