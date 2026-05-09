import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { filter } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { LanguageSwitcherComponent } from '../../i18n/language-switcher/language-switcher.component';
import { UserMenuComponent } from '../../../shared/ui/user-menu/user-menu.component';

export type TopmenuMode = 'public' | 'authenticated';

@Component({
  selector: 'app-topmenu',
  imports: [RouterLink, RouterLinkActive, TranslocoPipe, LanguageSwitcherComponent, UserMenuComponent],
  templateUrl: './topmenu.component.html',
  styleUrl: './topmenu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'closeMobile()',
  },
})
export class TopmenuComponent {
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly mode = input<TopmenuMode>('public');
  protected readonly isStaff = computed(() => this.authService.currentUser()?.is_staff === true);
  protected readonly mobileMenuOpen = signal(false);

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.closeMobile());
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
}
