import { computed, DestroyRef, Signal, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { catchError, map, merge, Observable, of, Subject, switchMap, tap } from 'rxjs';

/** The reactive state produced by {@link loadOn}. */
export interface WindowedLoad<T> {
  /** Latest fetched payload, or `null` before the first success / after an error. */
  readonly data: Signal<T | null>;
  /** True while a fetch is in flight. */
  readonly loading: Signal<boolean>;
  /** True when the last fetch errored. */
  readonly error: Signal<boolean>;
  /** Re-run the fetch for the current scope (e.g. after a mutation). */
  reload(): void;
}

/**
 * The data-load triad shared by the read-only stats panels (roster-history,
 * rsvp-reliability, roti-drift, event-debrief, team-templates):
 *
 *   - derive a `scope` from input signals (a team id, an {id, from, to} window…);
 *   - (re)fetch whenever the scope changes, cancelling a stale in-flight request
 *     via `switchMap` (the toObservable→switchMap pattern from CLAUDE.md);
 *   - expose `data` / `loading` / `error` signals + an imperative `reload()`.
 *
 * Panels keep their own typed signals by deriving from `data`, e.g.
 *   protected readonly entries = computed(() => this.state.data()?.entries ?? []);
 * so templates and specs are unchanged.
 *
 * MUST be called from an injection context (a field initializer or the
 * constructor) so `toObservable` can register; pass the component's `DestroyRef`.
 * On error, `data` is reset to `null` (matches the panels' prior "clear on
 * failure" behaviour) and `error` is set.
 */
export function loadOn<S, T>(
  scope: () => S,
  fetch: (scope: S) => Observable<T>,
  destroyRef: DestroyRef,
): WindowedLoad<T> {
  const data = signal<T | null>(null);
  const loading = signal(false);
  const error = signal(false);
  const scopeSig = computed(scope);
  const reload$ = new Subject<void>();

  merge(toObservable(scopeSig), reload$.pipe(map(() => scopeSig())))
    .pipe(
      tap(() => {
        loading.set(true);
        error.set(false);
      }),
      switchMap((s) =>
        fetch(s).pipe(
          catchError(() => {
            error.set(true);
            return of(null);
          }),
        ),
      ),
      takeUntilDestroyed(destroyRef),
    )
    .subscribe((res) => {
      data.set(res);
      loading.set(false);
    });

  return { data, loading, error, reload: () => reload$.next() };
}
