import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EquipmentService } from '../../../api/api/equipment.service';
import { Equipment } from '../../../api/model/equipment';
import { EquipmentSelectComponent } from './equipment-select.component';

interface ProtectedFields {
  items(): Equipment[];
  value: number[];
  dialogVisible(): boolean;
  newName(): string;
  nameError(): string | null;
  openCreate(): void;
  createItem(): void;
  onSelectChange(v: number[] | null): void;
  writeValue(v: number[] | null): void;
}

describe('EquipmentSelectComponent', () => {
  let fixture: ComponentFixture<EquipmentSelectComponent>;
  let component: EquipmentSelectComponent;
  let equipmentMock: {
    equipmentList: ReturnType<typeof vi.fn>;
    equipmentCreate: ReturnType<typeof vi.fn>;
  };
  const access = (c: EquipmentSelectComponent) => c as unknown as ProtectedFields;

  async function setup() {
    TestBed.resetTestingModule();
    equipmentMock = {
      equipmentList: vi.fn().mockReturnValue(
        of({
          count: 1,
          results: [{ id: 7, team: 5, name: 'Pull-buoy' } as Equipment],
        }),
      ),
      equipmentCreate: vi
        .fn()
        .mockReturnValue(of({ id: 8, team: 5, name: 'Plaquettes' } as Equipment)),
    };

    await TestBed.configureTestingModule({
      imports: [
        EquipmentSelectComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        MessageService,
        { provide: EquipmentService, useValue: equipmentMock },
      ],
    })
      .overrideComponent(EquipmentSelectComponent, { set: { template: '', imports: [] } })
      .compileComponents();

    fixture = TestBed.createComponent(EquipmentSelectComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('teamId', 5);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await setup();
  });

  it('loads the team equipment when teamId is set', () => {
    expect(equipmentMock.equipmentList).toHaveBeenCalledWith(
      undefined,
      undefined,
      undefined,
      undefined,
      5,
    );
    expect(access(component).items()).toHaveLength(1);
  });

  it('propagates the selected equipment ids through the CVA onChange', () => {
    let pushed: number[] = [];
    component.registerOnChange((v) => (pushed = v));
    access(component).onSelectChange([7]);
    expect(pushed).toEqual([7]);
    expect(access(component).value).toEqual([7]);
  });

  it('writeValue sets the inner value', () => {
    access(component).writeValue([9]);
    expect(access(component).value).toEqual([9]);
  });

  it('createItem posts and auto-selects the new item', () => {
    let pushed: number[] = [];
    component.registerOnChange((v) => (pushed = v));
    access(component).openCreate();
    (component as unknown as { newName: { set(v: string): void } }).newName.set('Plaquettes');
    access(component).createItem();
    expect(equipmentMock.equipmentCreate).toHaveBeenCalledWith(
      expect.objectContaining({ team: 5, name: 'Plaquettes' }),
    );
    expect(access(component).items().some((i) => i.id === 8)).toBe(true);
    expect(pushed).toContain(8);
    expect(access(component).dialogVisible()).toBe(false);
  });

  it('blocks createItem + flags an error on an empty name', () => {
    access(component).openCreate();
    access(component).createItem();
    expect(equipmentMock.equipmentCreate).not.toHaveBeenCalled();
    expect(access(component).nameError()).not.toBeNull();
  });

  it('surfaces the duplicate-name error from the backend', () => {
    equipmentMock.equipmentCreate.mockReturnValueOnce(
      throwError(() => ({ status: 400, error: { code: 'equipment_already_exists' } })),
    );
    access(component).openCreate();
    (component as unknown as { newName: { set(v: string): void } }).newName.set('Dup');
    access(component).createItem();
    expect(access(component).nameError()).not.toBeNull();
  });
});
