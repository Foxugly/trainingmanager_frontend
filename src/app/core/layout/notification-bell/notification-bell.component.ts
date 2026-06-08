import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Notification } from '../../../api/model/notification';
import { LanguageService } from '../../i18n/language.service';
import { NotificationService } from '../../notifications/notification.service';
import { BellComponent } from '../bell/bell.component';

@Component({
  selector: 'app-notification-bell',
  imports: [TranslocoPipe, BellComponent],
  templateUrl: './notification-bell.component.html',
  styleUrl: './notification-bell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationBellComponent {
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly languageService = inject(LanguageService);

  private readonly bell = viewChild<BellComponent>('bell');

  protected readonly unreadCount = this.notifications.unreadCount;
  protected readonly items = this.notifications.items;
  protected readonly loading = signal(false);
  protected readonly hasUnread = computed(() => this.unreadCount() > 0);

  /** Poll tick from the shell — only fires while authenticated and visible. */
  protected onPoll(): void {
    this.notifications.refreshUnread().subscribe({ error: () => {} });
  }

  /** Auth dropped — clear cached notifications. */
  protected onReset(): void {
    this.notifications.reset();
  }

  /** Popover opened — lazy-load the recent list. */
  protected loadRecent(): void {
    this.loading.set(true);
    this.notifications.loadRecent().subscribe({
      next: () => this.loading.set(false),
      error: () => this.loading.set(false),
    });
  }

  protected onSelect(notif: Notification): void {
    const go = () => {
      this.bell()?.close();
      if (notif.url) {
        this.router.navigateByUrl(notif.url);
      }
    };
    if (notif.is_read) {
      go();
      return;
    }
    this.notifications.markRead(notif.id).subscribe({ next: go, error: go });
  }

  protected markAllRead(): void {
    this.notifications.markAllRead().subscribe({ error: () => {} });
  }

  /** Localized relative time label for a notification timestamp.
   *
   * Uses Intl.RelativeTimeFormat in the active language (was hardcoded English
   * now/5m/3h/2d in an fr-default, 5-language app). Falls back to an absolute
   * localized date past one week. */
  protected shortTime(iso: string): string {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const lang = this.languageService.activeLang();
    const diffSec = Math.round((Date.now() - then) / 1000);
    if (diffSec >= 7 * 86400) return new Date(then).toLocaleDateString(lang);
    const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto', style: 'short' });
    if (diffSec < 60) return rtf.format(0, 'second'); // "now" / "maintenant"
    const min = Math.floor(diffSec / 60);
    if (min < 60) return rtf.format(-min, 'minute');
    const hr = Math.floor(min / 60);
    if (hr < 24) return rtf.format(-hr, 'hour');
    return rtf.format(-Math.floor(hr / 24), 'day');
  }
}
