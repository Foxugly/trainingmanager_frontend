import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EnergySystemsService } from '../../../../api/api/energy-systems.service';
import { EnergySystem } from '../../../../api/model/energy-system';
import { EnergySystemsListComponent } from './energy-systems-list.component';

const es1: EnergySystem = { id: 10, name: 'Endurance', is_active: true };
const es2: EnergySystem = { id: 20, name: 'Sprint', is_active: false };

interface ProtectedFields {
  energySystems(): EnergySystem[];
  loading(): boolean;
  includeInactive(): boolean;
  includeInactiveModel: boolean;
  confirmDelete(s: EnergySystem): void;
  restore(s: EnergySystem): void;
}

describe('EnergySystemsListComponent', () => {
  let fixture: ComponentFixture<EnergySystemsListComponent>;
  let component: EnergySystemsListComponent;

  let serviceMock: {
    energySystemsList: ReturnType<typeof vi.fn>;
    energySystemsDestroy: ReturnType<typeof vi.fn>;
    energySystemsPartialUpdate: ReturnType<typeof vi.fn>;
  };
  let confirmMock: { confirm: ReturnType<typeof vi.fn> };
  let messageMock: { add: ReturnType<typeof vi.fn> };

  const access = (c: EnergySystemsListComponent) => c as unknown as ProtectedFields;

  beforeEach(async () => {
    serviceMock = {
      energySystemsList: vi.fn().mockReturnValue(of({ count: 1, results: [es1] })),
      energySystemsDestroy: vi.fn().mockReturnValue(of({})),
      energySystemsPartialUpdate: vi.fn().mockReturnValue(of({})),
    };
    confirmMock = { confirm: vi.fn() };
    messageMock = { add: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [
        EnergySystemsListComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: EnergySystemsService, useValue: serviceMock },
        { provide: MessageService, useValue: messageMock },
      ],
    })
      .overrideComponent(EnergySystemsListComponent, {
        set: {
          template: '',
          imports: [],
          providers: [{ provide: ConfirmationService, useValue: confirmMock }],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(EnergySystemsListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads active energy systems on init (no includeInactive)', () => {
    expect(serviceMock.energySystemsList).toHaveBeenCalledTimes(1);
    expect(serviceMock.energySystemsList.mock.calls[0][0].includeInactive).toBeUndefined();
    expect(access(component).energySystems()).toEqual([es1]);
  });

  it('reloads with includeInactive=true when the toggle flips', () => {
    serviceMock.energySystemsList.mockReturnValue(of({ count: 2, results: [es1, es2] }));
    access(component).includeInactiveModel = true;
    fixture.detectChanges();

    expect(serviceMock.energySystemsList).toHaveBeenCalledTimes(2);
    expect(serviceMock.energySystemsList.mock.calls[1][0].includeInactive).toBe(true);
    expect(access(component).energySystems()).toEqual([es1, es2]);
  });

  it('confirmDelete() opens the confirmation dialog and runs energySystemsDestroy on accept', () => {
    access(component).confirmDelete(es1);
    expect(confirmMock.confirm).toHaveBeenCalledTimes(1);

    const opts = confirmMock.confirm.mock.calls[0][0] as { accept: () => void };
    opts.accept();

    expect(serviceMock.energySystemsDestroy).toHaveBeenCalledWith({ id: es1.id });
    expect(messageMock.add).toHaveBeenCalledTimes(1);
    expect(messageMock.add.mock.calls[0][0].severity).toBe('success');
  });

  it('restore() calls energySystemsPartialUpdate(id, true, {is_active:true}) and reloads', () => {
    serviceMock.energySystemsList.mockClear();
    access(component).restore(es2);

    expect(serviceMock.energySystemsPartialUpdate).toHaveBeenCalledWith({
      id: es2.id,
      includeInactive: true,
      patchedEnergySystemAdmin: { is_active: true },
    });
    expect(messageMock.add).toHaveBeenCalledTimes(1);
    expect(serviceMock.energySystemsList).toHaveBeenCalled();
  });
});
