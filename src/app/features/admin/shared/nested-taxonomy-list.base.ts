import { DestroyRef, Directive, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';
import { ConfirmationService } from 'primeng/api';
import { Observable, catchError, finalize, of, switchMap, tap } from 'rxjs';
import { ToastService } from '../../../core/notifications/toast.service';
import { Paginated, TaxonomyEntity } from './taxonomy-list.base';

/**
 * Nested sibling of {@link TaxonomyListBase}: the same include-inactive load
 * stream + delete/restore/confirm/toast flow, but scoped under a PARENT entity
 * (e.g. modalities under a sport). Holds `parentId`/`parent` and threads the
 * parent id through every service call. Subclasses provide the parent loader,
 * the scoped list/destroy/restore calls and an i18n prefix; they call
 * `initStream()` (constructor) + `initParent(id)` (once the id is known, e.g.
 * from the route in ngOnInit).
 *
 * `@Directive()` so Angular DI / `inject()` work in the base.
 */
@Directive()
export abstract class NestedTaxonomyListBase<T extends TaxonomyEntity, P> {
  protected readonly confirmationService = inject(ConfirmationService);
  protected readonly toast = inject(ToastService);
  protected readonly transloco = inject(TranslocoService);
  protected readonly destroyRef = inject(DestroyRef);

  protected readonly parentId = signal<number | null>(null);
  protected readonly parent = signal<P | null>(null);
  protected readonly entities = signal<T[]>([]);
  protected readonly loading = signal(false);
  protected readonly includeInactive = signal(false);

  /** i18n key prefix, e.g. 'admin.modalities'. */
  protected abstract readonly i18nPrefix: string;
  protected abstract loadParent(parentId: number): Observable<P>;
  protected abstract list(parentId: number, includeInactive: boolean): Observable<Paginated<T>>;
  protected abstract destroyOne(parentId: number, entity: T): Observable<unknown>;
  protected abstract restoreOne(parentId: number, entity: T): Observable<unknown>;

  /** Start the include-inactive-driven load stream. Call from the subclass
   * constructor; it only fetches once `parentId` is set (via initParent). */
  protected initStream(): void {
    toObservable(this.includeInactive)
      .pipe(
        switchMap((include) => {
          const id = this.parentId();
          return id == null ? of(null) : this.fetch(id, include);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  /** Resolve the parent (for the header) and set `parentId`; the
   * include-inactive stream's first emission then performs the initial load
   * (lifecycle hooks fire before effects flush, so the id is already set). */
  protected initParent(parentId: number): void {
    this.loadParent(parentId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (p) => this.parent.set(p) });
    this.parentId.set(parentId);
  }

  private fetch(parentId: number, includeInactive: boolean): Observable<unknown> {
    this.loading.set(true);
    return this.list(parentId, includeInactive).pipe(
      tap((res) => this.entities.set(res.results ?? [])),
      catchError(() => {
        this.toast.error(`${this.i18nPrefix}.errors.unknown`);
        this.entities.set([]);
        return of(null);
      }),
      finalize(() => this.loading.set(false)),
    );
  }

  private reload(): void {
    const id = this.parentId();
    if (id == null) return;
    this.fetch(id, this.includeInactive()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
  }

  protected confirmDelete(entity: T): void {
    this.confirmationService.confirm({
      header: this.transloco.translate(`${this.i18nPrefix}.actions.delete_confirm_title`),
      message: this.transloco.translate(`${this.i18nPrefix}.actions.delete_confirm_message`),
      accept: () => this.runMutation((id) => this.destroyOne(id, entity), 'deleted'),
    });
  }

  protected restore(entity: T): void {
    this.runMutation((id) => this.restoreOne(id, entity), 'restored');
  }

  private runMutation(
    op: (parentId: number) => Observable<unknown>,
    successKey: 'deleted' | 'restored',
  ): void {
    const id = this.parentId();
    if (id == null) return;
    op(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.success(`${this.i18nPrefix}.actions.${successKey}`);
          this.reload();
        },
        error: () => this.toast.error(`${this.i18nPrefix}.errors.unknown`),
      });
  }

  protected get includeInactiveModel(): boolean {
    return this.includeInactive();
  }
  protected set includeInactiveModel(v: boolean) {
    this.includeInactive.set(v);
  }
}
