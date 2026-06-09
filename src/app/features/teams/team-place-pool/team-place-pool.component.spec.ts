import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlacesService } from '../../../api/api/places.service';
import { Place } from '../../../api/model/place';
import { NominatimService } from '../../../core/geo/nominatim.service';
import { TeamPlacePoolComponent } from './team-place-pool.component';

interface Protected {
  places(): Place[];
  selectedPlaces(): Place[];
  placeName: { set(v: string): void };
  placeAddress(): string;
  placeNameError(): string | null;
  placeDialogVisible(): boolean;
  placeCreateMode(): boolean;
  togglePlace(p: Place, checked: boolean): void;
  setDefaultPlace(p: Place): void;
  removePlace(p: Place): void;
  openAddPlace(): void;
  enterCreateMode(): void;
  savePlace(): void;
  searchPool(e: { query: string }): void;
  placePoolSuggestions(): Place[];
  onAddressSelect(v: string): void;
}

const POOL: Place[] = [
  { id: 7, sports: [1], name: 'Piscine olympique', address: '1 rue X' } as Place,
  { id: 9, sports: [1], name: 'Piscine B', address: '2 rue Y' } as Place,
];

describe('TeamPlacePoolComponent', () => {
  let fixture: ComponentFixture<TeamPlacePoolComponent>;
  let component: TeamPlacePoolComponent;
  let placesMock: {
    placesList: ReturnType<typeof vi.fn>;
    placesCreate: ReturnType<typeof vi.fn>;
  };
  let nominatimMock: { search: ReturnType<typeof vi.fn> };
  let messageMock: { add: ReturnType<typeof vi.fn> };
  const access = (c: TeamPlacePoolComponent) => c as unknown as Protected;

  async function setup(
    opts: { sportIds?: number[]; placeIds?: number[]; defaultPlaceId?: number | null } = {},
  ) {
    TestBed.resetTestingModule();
    placesMock = {
      placesList: vi.fn().mockReturnValue(of({ count: POOL.length, results: POOL })),
      placesCreate: vi
        .fn()
        .mockReturnValue(of({ id: 8, sports: [1], name: 'Nouveau', address: '' } as Place)),
    };
    nominatimMock = { search: vi.fn().mockReturnValue(of([])) };
    messageMock = { add: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [
        TeamPlacePoolComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        { provide: PlacesService, useValue: placesMock },
        { provide: NominatimService, useValue: nominatimMock },
        { provide: MessageService, useValue: messageMock },
      ],
    })
      .overrideComponent(TeamPlacePoolComponent, { set: { template: '', imports: [] } })
      .compileComponents();

    fixture = TestBed.createComponent(TeamPlacePoolComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('teamId', 5);
    fixture.componentRef.setInput('sportIds', opts.sportIds ?? [1]);
    fixture.componentRef.setInput('placeIds', opts.placeIds ?? []);
    fixture.componentRef.setInput('defaultPlaceId', opts.defaultPlaceId ?? null);
    fixture.detectChanges(); // runs the effect → loadPool
    return fixture;
  }

  beforeEach(() => setup());

  it('loads the venue pool via ?sport for each team sport on init', () => {
    expect(placesMock.placesList).toHaveBeenCalledWith({ sport: 1 });
    expect(access(component).places()).toHaveLength(2);
  });

  it('unions the pool across several sports, de-duping by id', async () => {
    await setup({ sportIds: [1, 2] });
    expect(placesMock.placesList).toHaveBeenCalledTimes(2);
    // Same POOL returned for both sports → merged unique.
    expect(access(component).places().map((p) => p.id)).toEqual([7, 9]);
  });

  it('emits the fetched pool via poolChange', async () => {
    let emitted: Place[] | undefined;
    TestBed.resetTestingModule();
    await setup();
    component.poolChange.subscribe((p) => (emitted = p));
    // re-trigger by changing sportIds
    fixture.componentRef.setInput('sportIds', [1]);
    fixture.detectChanges();
    expect(emitted?.map((p) => p.id)).toEqual([7, 9]);
  });

  it('selectedPlaces is the linked subset of the pool', async () => {
    await setup({ placeIds: [9] });
    expect(access(component).selectedPlaces().map((p) => p.id)).toEqual([9]);
  });

  it('togglePlace emits the new linked set (add then remove)', async () => {
    await setup({ placeIds: [] });
    const emitted: number[][] = [];
    component.placeIdsChange.subscribe((v) => emitted.push(v));
    access(component).togglePlace(POOL[1], true);
    expect(emitted.at(-1)).toEqual([9]);
    fixture.componentRef.setInput('placeIds', [9]);
    access(component).togglePlace(POOL[1], false);
    expect(emitted.at(-1)).toEqual([]);
  });

  it('unlinking the current default also clears the default', async () => {
    await setup({ placeIds: [7], defaultPlaceId: 7 });
    let defaultEmitted: number | null | undefined = undefined;
    component.defaultPlaceIdChange.subscribe((v) => (defaultEmitted = v));
    access(component).removePlace(POOL[0]);
    expect(defaultEmitted).toBeNull();
  });

  it('setDefaultPlace links the place (if needed) then sets it default', async () => {
    await setup({ placeIds: [] });
    const ids: number[][] = [];
    let def: number | null | undefined;
    component.placeIdsChange.subscribe((v) => ids.push(v));
    component.defaultPlaceIdChange.subscribe((v) => (def = v));
    access(component).setDefaultPlace(POOL[1]);
    expect(ids.at(-1)).toEqual([9]);
    expect(def).toBe(9);
  });

  it('savePlace creates a venue, adds it to the pool, links it and toasts', async () => {
    await setup({ placeIds: [] });
    let pool: Place[] | undefined;
    let linked: number[] | undefined;
    component.poolChange.subscribe((p) => (pool = p));
    component.placeIdsChange.subscribe((v) => (linked = v));
    access(component).openAddPlace();
    access(component).enterCreateMode();
    access(component).placeName.set('Nouveau');
    access(component).savePlace();
    expect(placesMock.placesCreate).toHaveBeenCalledWith({
      placeRequest: expect.objectContaining({ team: 5, name: 'Nouveau' }),
    });
    expect(pool?.some((p) => p.id === 8)).toBe(true);
    expect(linked).toContain(8);
  });

  it('savePlace blocks and flags an error when the name is empty', async () => {
    await setup();
    access(component).openAddPlace();
    access(component).enterCreateMode();
    access(component).savePlace();
    expect(placesMock.placesCreate).not.toHaveBeenCalled();
    expect(access(component).placeNameError()).not.toBeNull();
  });

  it('openAddPlace opens the dialog in link-existing mode', async () => {
    await setup();
    access(component).openAddPlace();
    expect(access(component).placeDialogVisible()).toBe(true);
    expect(access(component).placeCreateMode()).toBe(false);
    access(component).enterCreateMode();
    expect(access(component).placeCreateMode()).toBe(true);
  });

  it('searchPool suggests pool places matching the text that are not linked', async () => {
    await setup({ placeIds: [7] });
    access(component).searchPool({ query: 'piscine' });
    // 7 is linked → excluded; only 9 matches and is free.
    expect(access(component).placePoolSuggestions().map((p) => p.id)).toEqual([9]);
  });

  it('toasts an error when the pool fails to load', async () => {
    TestBed.resetTestingModule();
    placesMock = {
      placesList: vi.fn().mockReturnValue(throwError(() => new Error('boom'))),
      placesCreate: vi.fn(),
    };
    nominatimMock = { search: vi.fn().mockReturnValue(of([])) };
    messageMock = { add: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [
        TeamPlacePoolComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        { provide: PlacesService, useValue: placesMock },
        { provide: NominatimService, useValue: nominatimMock },
        { provide: MessageService, useValue: messageMock },
      ],
    })
      .overrideComponent(TeamPlacePoolComponent, { set: { template: '', imports: [] } })
      .compileComponents();
    fixture = TestBed.createComponent(TeamPlacePoolComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('teamId', 5);
    fixture.componentRef.setInput('sportIds', [1]);
    fixture.componentRef.setInput('placeIds', []);
    fixture.componentRef.setInput('defaultPlaceId', null);
    fixture.detectChanges();
    expect(messageMock.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
    expect(access(component).places()).toEqual([]);
  });
});
