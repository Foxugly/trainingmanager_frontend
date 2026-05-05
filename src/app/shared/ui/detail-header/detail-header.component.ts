import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-detail-header',
  imports: [CommonModule, RouterLink, TranslocoPipe],
  templateUrl: './detail-header.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetailHeaderComponent implements AfterViewInit, OnDestroy {
  readonly eyebrow = input<string>('');
  readonly title = input.required<string>();
  readonly backLink = input<readonly (string | number)[] | string | null>(null);
  readonly backLabelKey = input<string>('common.back');
  readonly icon = input<string | null>(null);
  // Centered mode: title + meta horizontally centered, actions float top-right.
  readonly centered = input<boolean>(false);

  private readonly platformId = inject(PLATFORM_ID);
  protected readonly condensed = signal(false);
  private readonly sentinel = viewChild<ElementRef<HTMLElement>>('sentinel');
  private observer: IntersectionObserver | null = null;

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const el = this.sentinel()?.nativeElement;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    this.observer = new IntersectionObserver(
      ([entry]) => {
        const passed = !entry.isIntersecting && entry.boundingClientRect.top < 0;
        this.condensed.set(passed);
      },
      { threshold: 0 },
    );
    this.observer.observe(el);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.observer = null;
  }
}
