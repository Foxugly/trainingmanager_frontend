import { DestroyRef, Directive, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';
import { ConfirmationService } from 'primeng/api';
import { Observable, catchError, finalize, of, switchMap, tap } from 'rxjs';
import { ToastService } from '../../../core/notifications/toast.service';

export interface TaxonomyEntity {
  id: number;
}

export interface Paginated<T> {
  results?: T[];
}

/**
 * Shared machinery for the admin taxonomy CRUD lists (sports, energy-systems,
 * energy-segments). Holds the include-inactive toggle stream
 * (toObservable→switchMap, cancellation), the load/reload, and the
 * delete/restore + toast/confirm flow. Subclasses provide the service calls
 * and an i18n prefix and call `initStream()` from their constructor (after
 * their service field is injected).
 *
 * `@Directive()` (not a plain class) so Angular DI / `inject()` work in the base.
 */
@Directive()
export abstract class TaxonomyListBase<T extends TaxonomyEntity> {
  protected readonly confirmationService = inject(ConfirmationService);
  protected readonly toast = inject(ToastService);
  protected readonly transloco = inject(TranslocoService);
  protected readonly destroyRef = inject(DestroyRef);

  protected readonly entities = signal<T[]>([]);
  protected readonly loading = signal(false);
  protected readonly includeInactive = signal(false);

  /** i18n key prefix, e.g. 'admin.sports'. */
  protected abstract readonly i18nPrefix: string;
  protected abstract list(includeInactive: boolean): Observable<Paginated<T>>;
  protected abstract destroyOne(entity: T): Observable<unknown>;
  protected abstract restoreOne(entity: T): Observable<unknown>;

  /** Start the include-inactive-driven load stream. Call from the subclass
   * constructor once the concrete service is available. */
  protected initStream(): void {
    toObservable(this.includeInactive)
      .pipe(
        switchMap((include) => this.fetch(include)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  private fetch(includeInactive: boolean): Observable<unknown> {
    this.loading.set(true);
    return this.list(includeInactive).pipe(
      tap((res) => this.entities.set(res.results ?? [])),
      catchError(() => {
        this.notifyUnknownError();
        this.entities.set([]);
        return of(null);
      }),
      finalize(() => this.loading.set(false)),
    );
  }

  private reload(): void {
    this.fetch(this.includeInactive()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
  }

  protected confirmDelete(entity: T): void {
    this.confirmationService.confirm({
      header: this.transloco.translate(`${this.i18nPrefix}.actions.delete_confirm_title`),
      message: this.transloco.translate(`${this.i18nPrefix}.actions.delete_confirm_message`),
      accept: () => this.runMutation(this.destroyOne(entity), 'deleted'),
    });
  }

  protected restore(entity: T): void {
    this.runMutation(this.restoreOne(entity), 'restored');
  }

  private runMutation(op: Observable<unknown>, successKey: 'deleted' | 'restored'): void {
    op.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.toast.success(`${this.i18nPrefix}.actions.${successKey}`);
        this.reload();
      },
      error: () => this.notifyUnknownError(),
    });
  }

  protected notifyUnknownError(): void {
    this.toast.error(`${this.i18nPrefix}.errors.unknown`);
  }

  protected get includeInactiveModel(): boolean {
    return this.includeInactive();
  }
  protected set includeInactiveModel(v: boolean) {
    this.includeInactive.set(v);
  }
}
