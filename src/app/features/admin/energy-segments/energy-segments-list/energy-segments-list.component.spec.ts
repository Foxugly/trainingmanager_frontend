import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EnergySegmentsService } from '../../../../api/api/energy-segments.service';
import { EnergySegment } from '../../../../api/model/energy-segment';
import { EnergySystem } from '../../../../api/model/energy-system';
import { EnergySegmentsListComponent } from './energy-segments-list.component';

const parent: EnergySystem = { id: 2, name: 'Endurance', is_active: true };
const z1: EnergySegment = {
  id: 1,
  abv: 'Z1',
  description: 'Récupération',
  energy_system: parent,
  energy_system_id: parent.id,
  is_active: true,
};
const z3: EnergySegment = {
  id: 3,
  abv: 'Z3',
  description: 'vo2max',
  energy_system: parent,
  energy_system_id: parent.id,
  is_active: false,
};

interface ProtectedFields {
  segments(): EnergySegment[];
  loading(): boolean;
  includeInactive(): boolean;
  includeInactiveModel: boolean;
  confirmDelete(s: EnergySegment): void;
  restore(s: EnergySegment): void;
}

describe('EnergySegmentsListComponent', () => {
  let fixture: ComponentFixture<EnergySegmentsListComponent>;
  let component: EnergySegmentsListComponent;

  let serviceMock: {
    energySegmentsList: ReturnType<typeof vi.fn>;
    energySegmentsDestroy: ReturnType<typeof vi.fn>;
    energySegmentsPartialUpdate: ReturnType<typeof vi.fn>;
  };
  let confirmMock: { confirm: ReturnType<typeof vi.fn> };
  let messageMock: { add: ReturnType<typeof vi.fn> };

  const access = (c: EnergySegmentsListComponent) => c as unknown as ProtectedFields;

  beforeEach(async () => {
    serviceMock = {
      energySegmentsList: vi.fn().mockReturnValue(of({ count: 1, results: [z1] })),
      energySegmentsDestroy: vi.fn().mockReturnValue(of({})),
      energySegmentsPartialUpdate: vi.fn().mockReturnValue(of({})),
    };
    confirmMock = { confirm: vi.fn() };
    messageMock = { add: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [
        EnergySegmentsListComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: EnergySegmentsService, useValue: serviceMock },
        { provide: MessageService, useValue: messageMock },
      ],
    })
      .overrideComponent(EnergySegmentsListComponent, {
        set: {
          template: '',
          imports: [],
          providers: [{ provide: ConfirmationService, useValue: confirmMock }],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(EnergySegmentsListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads active segments on init (no includeInactive)', () => {
    expect(serviceMock.energySegmentsList).toHaveBeenCalledTimes(1);
    const [energysystem, includeInactive] = serviceMock.energySegmentsList.mock.calls[0];
    expect(energysystem).toBeUndefined();
    expect(includeInactive).toBeUndefined();
    expect(access(component).segments()).toEqual([z1]);
  });

  it('reloads with includeInactive=true when the toggle flips', () => {
    serviceMock.energySegmentsList.mockReturnValue(of({ count: 2, results: [z1, z3] }));
    access(component).includeInactiveModel = true;
    fixture.detectChanges();

    expect(serviceMock.energySegmentsList).toHaveBeenCalledTimes(2);
    const [energysystem, includeInactive] = serviceMock.energySegmentsList.mock.calls[1];
    expect(energysystem).toBeUndefined();
    expect(includeInactive).toBe(true);
    expect(access(component).segments()).toEqual([z1, z3]);
  });

  it('confirmDelete() opens the confirmation dialog and runs energySegmentsDestroy on accept', () => {
    access(component).confirmDelete(z1);
    expect(confirmMock.confirm).toHaveBeenCalledTimes(1);

    const opts = confirmMock.confirm.mock.calls[0][0] as { accept: () => void };
    opts.accept();

    expect(serviceMock.energySegmentsDestroy).toHaveBeenCalledWith(z1.id);
    expect(messageMock.add).toHaveBeenCalledTimes(1);
    expect(messageMock.add.mock.calls[0][0].severity).toBe('success');
  });

  it('restore() calls energySegmentsPartialUpdate(id, true, {is_active:true}) and reloads', () => {
    serviceMock.energySegmentsList.mockClear();
    access(component).restore(z3);

    expect(serviceMock.energySegmentsPartialUpdate).toHaveBeenCalledWith(z3.id, true, {
      is_active: true,
    });
    expect(messageMock.add).toHaveBeenCalledTimes(1);
    expect(serviceMock.energySegmentsList).toHaveBeenCalled();
  });
});
