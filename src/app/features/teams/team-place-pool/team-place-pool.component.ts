import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Subject, forkJoin } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, switchMap } from 'rxjs/operators';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AutoComplete, AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { Tooltip } from 'primeng/tooltip';
import { PlacesService } from '../../../api/api/places.service';
import { Place } from '../../../api/model/place';
import { NominatimResult, NominatimService } from '../../../core/geo/nominatim.service';
import { ToastService } from '../../../core/notifications/toast.service';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';

/**
 * The team's venue (Lieux) tab: the shared, sport-scoped pool linked to the team
 * via the `place_ids` M2M, plus a "default place" star. Self-contained — it owns
 * the pool fetch, the add/link dialog (existing-pool autocomplete + a
 * Nominatim-backed create-new flow) and the table.
 *
 * Wiring (stateless picker, like app-team-managers): the linked set + default
 * are inputs/outputs the parent form holds in its controls; the fetched pool is
 * emitted via (poolChange) so the parent can still derive the linked Place
 * objects it passes to the slots editor. Extracted from teams-form.
 */
@Component({
  selector: 'app-team-place-pool',
  imports: [
    FormsModule,
    AutoComplete,
    Button,
    Dialog,
    InputText,
    TableModule,
    Tooltip,
    EmptyStateComponent,
    TranslocoPipe,
  ],
  templateUrl: './team-place-pool.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamPlacePoolComponent {
  private readonly placesService = inject(PlacesService);
  private readonly nominatim = inject(NominatimService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  /** Team whose venues are edited (needed to create+link a new place). */
  readonly teamId = input.required<number>();
  /** The team's sport ids — the pool spans every one of them (union). */
  readonly sportIds = input<number[]>([]);
  /** Currently-linked place ids (the team's `place_ids`). */
  readonly placeIds = input<number[]>([]);
  /** The current default place id (the team's `default_place_id`). */
  readonly defaultPlaceId = input<number | null>(null);

  /** Emitted when the linked set changes (link/unlink). */
  readonly placeIdsChange = output<number[]>();
  /** Emitted when the default place changes (star / unlink-of-default). */
  readonly defaultPlaceIdChange = output<number | null>();
  /** Emitted whenever the fetched/created pool changes, so the parent can
   *  derive the linked Place objects (e.g. for the slots editor). */
  readonly poolChange = output<Place[]>();

  /** The whole venue pool spanning the team's sports (link/share candidates). */
  protected readonly places = signal<Place[]>([]);
  protected readonly placesLoading = signal(false);

  /** The subset of the pool currently linked to the team (the table rows). */
  protected readonly selectedPlaces = computed<Place[]>(() => {
    const ids = new Set(this.placeIds());
    return this.places().filter((p) => ids.has(p.id));
  });

  // --- Add/link dialog state -------------------------------------------------
  protected readonly placeDialogVisible = signal(false);
  protected readonly placeSaving = signal(false);
  /** Whether the dialog is in "create a new place" mode (vs. link-existing). */
  protected readonly placeCreateMode = signal(false);
  /** Bound value of the pool autocomplete (a Place or a typed string). */
  protected readonly placePoolSelection = signal<Place | string | null>(null);
  /** Pool autocomplete suggestions (existing, not-yet-linked places). */
  protected readonly placePoolSuggestions = signal<Place[]>([]);
  protected readonly placeName = signal('');
  protected readonly placeAddress = signal('');
  protected readonly placeNameError = signal<string | null>(null);
  /** Nominatim address suggestions for the create-new address field. */
  protected readonly addressSuggestions = signal<NominatimResult[]>([]);
  /** The `display_name` labels of the current Nominatim suggestions. */
  protected readonly addressSuggestionLabels = computed<string[]>(() =>
    this.addressSuggestions().map((r) => r.display_name),
  );
  /** Pushes raw address-field input into the debounced Nominatim pipeline. */
  private readonly addressQuery$ = new Subject<string>();

  constructor() {
    // Debounced Nominatim address lookup for the create-new place flow.
    this.addressQuery$
      .pipe(
        debounceTime(350),
        map((q) => q.trim()),
        distinctUntilChanged(),
        switchMap((q) => this.nominatim.search(q, this.transloco.getActiveLang())),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((results) => this.addressSuggestions.set(results));

    // (Re)load the pool whenever the team's sports change. untracked: sportIds
    // is the only intended trigger; the forkJoin load must not add effect deps.
    effect(() => {
      const ids = this.sportIds();
      untracked(() => this.loadPool(ids));
    });
  }

  protected isDefaultPlace(id: number): boolean {
    return this.defaultPlaceId() === id;
  }

  protected isPlaceSelected(id: number): boolean {
    return this.placeIds().includes(id);
  }

  /** Link/unlink a pool place to the team, emitting the new linked set. */
  protected togglePlace(place: Place, checked: boolean): void {
    const current = this.placeIds();
    const next = checked
      ? current.includes(place.id)
        ? current
        : [...current, place.id]
      : current.filter((pid) => pid !== place.id);
    this.placeIdsChange.emit(next);
    // Unlinking the current default clears the default selector.
    if (!checked && this.defaultPlaceId() === place.id) {
      this.defaultPlaceIdChange.emit(null);
    }
  }

  /** Make `place` the team default (star action); ensures it is linked first. */
  protected setDefaultPlace(place: Place): void {
    if (!this.isPlaceSelected(place.id)) this.togglePlace(place, true);
    this.defaultPlaceIdChange.emit(place.id);
  }

  /** Unlink `place` from the team (trash action); clears default if it was it. */
  protected removePlace(place: Place): void {
    this.togglePlace(place, false);
  }

  protected openAddPlace(): void {
    this.placeCreateMode.set(false);
    this.placePoolSelection.set(null);
    this.placePoolSuggestions.set([]);
    this.placeName.set('');
    this.placeAddress.set('');
    this.placeNameError.set(null);
    this.addressSuggestions.set([]);
    this.placeDialogVisible.set(true);
  }

  protected closePlaceDialog(): void {
    this.placeDialogVisible.set(false);
  }

  protected enterCreateMode(): void {
    this.placeCreateMode.set(true);
    this.placeNameError.set(null);
  }

  /** Pool autocomplete: existing pool places matching the text, not yet linked. */
  protected searchPool(event: AutoCompleteCompleteEvent): void {
    const q = (event.query ?? '').trim().toLowerCase();
    const linked = new Set(this.placeIds());
    const matches = this.places().filter(
      (p) =>
        !linked.has(p.id) &&
        (q.length === 0 ||
          p.name.toLowerCase().includes(q) ||
          (p.address ?? '').toLowerCase().includes(q)),
    );
    this.placePoolSuggestions.set(matches);
  }

  /** Pool autocomplete selection → link the chosen existing place. */
  protected onPoolSelect(place: Place): void {
    this.togglePlace(place, true);
    this.placeDialogVisible.set(false);
    this.notifyPlaceToast('place.linked');
  }

  protected onAddressInput(value: string): void {
    this.placeAddress.set(value);
    this.addressQuery$.next(value);
  }

  protected searchAddress(event: AutoCompleteCompleteEvent): void {
    this.addressQuery$.next(event.query ?? '');
  }

  protected onAddressSelect(displayName: string): void {
    this.placeAddress.set(displayName);
  }

  /** Create a new place in the pool, link it to the team, and refresh. */
  protected savePlace(): void {
    const teamId = this.teamId();
    const name = this.placeName().trim();
    if (!name) {
      this.placeNameError.set(this.transloco.translate('place.name_required'));
      return;
    }
    this.placeSaving.set(true);
    this.placeNameError.set(null);
    const address = this.placeAddress().trim() || undefined;
    const payload = { team: teamId, name, address };
    this.placesService
      .placesCreate({ placeRequest: payload })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this.placeSaving.set(false);
          this.placeDialogVisible.set(false);
          this.places.update((cur) => [...cur, created]);
          this.poolChange.emit(this.places());
          // A freshly-created place belongs to the team: link it immediately.
          this.togglePlace(created, true);
          this.notifyPlaceToast('place.created');
        },
        error: () => {
          this.placeSaving.set(false);
          this.toast.error('place.error_create');
        },
      });
  }

  /** Fetch the venue pool spanning every sport the team practises (union). The
   *  `?sport` filter is per-sport, so we query each and merge on id. */
  private loadPool(sportIds: number[]): void {
    if (sportIds.length === 0) {
      this.places.set([]);
      this.poolChange.emit([]);
      return;
    }
    this.placesLoading.set(true);
    forkJoin(
      // Signature: (ordering, page, pageSize, search, sport, team) — ?sport pool.
      sportIds.map((id) =>
        this.placesService.placesList({ sport: id }),
      ),
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (responses) => {
          const byId = new Map<number, Place>();
          for (const res of responses) {
            for (const p of res.results ?? []) byId.set(p.id, p);
          }
          this.places.set([...byId.values()]);
          this.poolChange.emit(this.places());
          this.placesLoading.set(false);
        },
        error: () => {
          this.places.set([]);
          this.poolChange.emit([]);
          this.placesLoading.set(false);
          this.toast.error('teams.errors.unknown');
        },
      });
  }

  private notifyPlaceToast(detailKey: string): void {
    this.toast.success(detailKey);
  }
}
