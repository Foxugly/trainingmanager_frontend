import { NgOptimizedImage } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { filter } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { LanguageSwitcherComponent } from '../../i18n/language-switcher/language-switcher.component';
import { UserMenuComponent } from '../../../shared/ui/user-menu/user-menu.component';
import { NotificationBellComponent } from '../notification-bell/notification-bell.component';
import { MessageBellComponent } from '../message-bell/message-bell.component';

export type TopmenuMode = 'public' | 'authenticated';

@Component({
  selector: 'app-topmenu',
  imports: [
    NgOptimizedImage,
    RouterLink,
    RouterLinkActive,
    TranslocoPipe,
    LanguageSwitcherComponent,
    UserMenuComponent,
    NotificationBellComponent,
    MessageBellComponent,
  ],
  templateUrl: './topmenu.component.html',
  styleUrl: './topmenu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'closeMobile()',
    '(keydown.tab)': 'onDrawerTab($event)',
    '(keydown.shift.tab)': 'onDrawerShiftTab($event)',
  },
})
export class TopmenuComponent {
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly mode = input<TopmenuMode>('public');
  protected readonly isSuperuser = computed(
    () => this.authService.currentUser()?.is_superuser === true,
  );
  protected readonly mobileMenuOpen = signal(false);

  private readonly hamburgerBtn = viewChild<ElementRef<HTMLButtonElement>>('hamburgerBtn');
  private readonly drawerEl = viewChild<ElementRef<HTMLElement>>('drawerEl');

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.closeMobile());

    let previousOpen = false;
    effect(() => {
      const open = this.mobileMenuOpen();
      if (open && !previousOpen) {
        // Drawer just opened: focus first focusable inside the drawer.
        queueMicrotask(() => {
          const drawer = this.drawerEl()?.nativeElement;
          if (!drawer) return;
          const focusables = this.getFocusableElements(drawer);
          focusables[0]?.focus();
        });
      } else if (!open && previousOpen) {
        // Drawer just closed: restore focus to the hamburger button.
        queueMicrotask(() => {
          this.hamburgerBtn()?.nativeElement.focus();
        });
      }
      previousOpen = open;
    });
  }

  protected toggleMobile(): void {
    this.mobileMenuOpen.update((v) => !v);
  }

  protected closeMobile(): void {
    this.mobileMenuOpen.set(false);
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (!this.mobileMenuOpen()) return;
    const root = this.elementRef.nativeElement;
    if (!root.contains(event.target as Node)) {
      this.closeMobile();
    }
  }

  protected onDrawerTab(event: Event): void {
    if (!this.mobileMenuOpen()) return;
    const drawer = this.drawerEl()?.nativeElement;
    if (!drawer) return;
    const focusables = this.getFocusableElements(drawer);
    if (focusables.length === 0) return;
    const last = focusables[focusables.length - 1];
    if (event.target === last) {
      event.preventDefault();
      focusables[0].focus();
    }
  }

  protected onDrawerShiftTab(event: Event): void {
    if (!this.mobileMenuOpen()) return;
    const drawer = this.drawerEl()?.nativeElement;
    if (!drawer) return;
    const focusables = this.getFocusableElements(drawer);
    if (focusables.length === 0) return;
    if (event.target === focusables[0]) {
      event.preventDefault();
      focusables[focusables.length - 1].focus();
    }
  }

  private getFocusableElements(container: HTMLElement): HTMLElement[] {
    return Array.from(
      container.querySelectorAll<HTMLElement>('a, button, [tabindex]:not([tabindex="-1"])'),
    );
  }
}
