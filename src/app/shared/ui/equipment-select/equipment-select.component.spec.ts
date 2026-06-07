import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EquipmentService } from '../../../api/api/equipment.service';
import { Equipment } from '../../../api/model/equipment';
import { EquipmentSelectComponent } from './equipment-select.component';

interface ProtectedFields {
  items(): Equipment[];
  value: number[];
  onSelectChange(v: number[] | null): void;
  writeValue(v: number[] | null): void;
}

describe('EquipmentSelectComponent', () => {
  let fixture: ComponentFixture<EquipmentSelectComponent>;
  let component: EquipmentSelectComponent;
  let equipmentMock: {
    equipmentList: ReturnType<typeof vi.fn>;
  };
  const access = (c: EquipmentSelectComponent) => c as unknown as ProtectedFields;

  async function setup() {
    TestBed.resetTestingModule();
    equipmentMock = {
      equipmentList: vi.fn().mockReturnValue(
        of({
          count: 1,
          results: [{ id: 7, name: 'Pull-buoy' } as Equipment],
        }),
      ),
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

  it("loads the team's enabled equipment subset via the ?team filter", () => {
    // Signature: (ordering, page, pageSize, search, sport, team) — team is 6th.
    expect(equipmentMock.equipmentList).toHaveBeenCalledWith(
      undefined,
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
});
