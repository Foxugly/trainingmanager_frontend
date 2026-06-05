import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Three-column edit-page header: optional left slot (back button), centered
 * <h1> title with an optional [slot=title-after] (status badge), and an
 * optional right slot (active toggle + actions). Mirrors QuizOnline's
 * PageHeader. Distinct from DetailHeaderComponent (used on detail pages).
 */
@Component({
  selector: 'app-page-header',
  template: `
    <header class="page-header">
      <div class="page-header__slot page-header__slot--left">
        <ng-content select="[slot=left]" />
      </div>
      <div class="page-header__title-row">
        <h1 class="page-header__title">{{ title() }}</h1>
        <ng-content select="[slot=title-after]" />
      </div>
      <div class="page-header__slot page-header__slot--right">
        <ng-content select="[slot=right]" />
      </div>
    </header>
  `,
  styles: [`
    :host { display: block; }
    .page-header {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1.25rem;
    }
    .page-header__title-row {
      display: inline-flex;
      align-items: center;
      gap: 0.6rem;
      justify-self: center;
      min-width: 0;
    }
    .page-header__title {
      margin: 0;
      text-align: center;
      min-width: 0;
      font-size: 1.5rem;
      line-height: 1.2;
      color: var(--text-strong);
    }
    .page-header__slot {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .page-header__slot--left  { justify-self: start; }
    .page-header__slot--right { justify-self: end; }
    @media (max-width: 640px) {
      .page-header { grid-template-columns: 1fr; row-gap: 0.6rem; }
      .page-header__slot--left,
      .page-header__slot--right { justify-self: stretch; justify-content: flex-start; }
      .page-header__slot--right { justify-content: flex-end; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
}
