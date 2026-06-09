import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlacesService } from '../../../api/api/places.service';
import { Place } from '../../../api/model/place';
import { PlaceSelectComponent } from './place-select.component';

interface ProtectedFields {
  places(): Place[];
  value: number | null;
  dialogVisible(): boolean;
  newName(): string;
  newAddress(): string;
  nameError(): string | null;
  openCreate(): void;
  createPlace(): void;
  onSelectChange(v: number | null): void;
  writeValue(v: number | null): void;
}

describe('PlaceSelectComponent', () => {
  let fixture: ComponentFixture<PlaceSelectComponent>;
  let component: PlaceSelectComponent;
  let placesMock: {
    placesList: ReturnType<typeof vi.fn>;
    placesCreate: ReturnType<typeof vi.fn>;
  };
  const access = (c: PlaceSelectComponent) => c as unknown as ProtectedFields;

  async function setup() {
    TestBed.resetTestingModule();
    placesMock = {
      placesList: vi.fn().mockReturnValue(
        of({
          count: 1,
          results: [{ id: 7, team: 5, name: 'Piscine olympique', address: '1 rue X' } as Place],
        }),
      ),
      placesCreate: vi
        .fn()
        .mockReturnValue(of({ id: 8, team: 5, name: 'Nouveau', address: '' } as Place)),
    };

    await TestBed.configureTestingModule({
      imports: [
        PlaceSelectComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        MessageService,
        { provide: PlacesService, useValue: placesMock },
      ],
    })
      .overrideComponent(PlaceSelectComponent, { set: { template: '', imports: [] } })
      .compileComponents();

    fixture = TestBed.createComponent(PlaceSelectComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('teamId', 5);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await setup();
  });

  it('loads the team linked places via ?team (position 6) when teamId is set', () => {
    expect(placesMock.placesList).toHaveBeenCalledWith({ team: 5 });
    expect(access(component).places()).toHaveLength(1);
  });

  it('propagates the selected place id through the CVA onChange', () => {
    let pushed: number | null = -1;
    component.registerOnChange((v) => (pushed = v));
    access(component).onSelectChange(7);
    expect(pushed).toBe(7);
    expect(access(component).value).toBe(7);
  });

  it('writeValue sets the inner value', () => {
    access(component).writeValue(9);
    expect(access(component).value).toBe(9);
  });

  it('createPlace posts and auto-selects the new place', () => {
    let pushed: number | null = null;
    component.registerOnChange((v) => (pushed = v));
    access(component).openCreate();
    (component as unknown as { newName: { set(v: string): void } }).newName.set('Nouveau');
    access(component).createPlace();
    expect(placesMock.placesCreate).toHaveBeenCalledWith({
      place: expect.objectContaining({ team: 5, name: 'Nouveau' }),
    });
    expect(access(component).places().some((p) => p.id === 8)).toBe(true);
    expect(pushed).toBe(8);
    expect(access(component).dialogVisible()).toBe(false);
  });

  it('blocks createPlace + flags an error on an empty name', () => {
    access(component).openCreate();
    access(component).createPlace();
    expect(placesMock.placesCreate).not.toHaveBeenCalled();
    expect(access(component).nameError()).not.toBeNull();
  });

  it('keeps the dialog open and shows a toast when the create fails', () => {
    const messages = TestBed.inject(MessageService);
    const addSpy = vi.spyOn(messages, 'add');
    placesMock.placesCreate.mockReturnValueOnce(throwError(() => ({ status: 500 })));
    access(component).openCreate();
    (component as unknown as { newName: { set(v: string): void } }).newName.set('Boom');
    access(component).createPlace();
    expect(addSpy).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
    expect(access(component).dialogVisible()).toBe(true);
  });
});
