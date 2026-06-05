import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Observable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActiveToggleComponent } from './active-toggle.component';

@Component({
  imports: [ActiveToggleComponent],
  template: `
    <app-active-toggle
      [entityId]="1"
      [value]="value()"
      [patch]="patch()"
      [labels]="{ active: 'Actif', inactive: 'Inactif', confirm: 'Désactiver ?' }"
      (valueChange)="value.set($event)"
    />
  `,
})
class HostComponent {
  value = signal(false);
  patch = signal<(id: number, v: boolean) => Observable<unknown>>(() => of({}));
}

describe('ActiveToggleComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let confirm: ConfirmationService;

  function child(): ActiveToggleComponent {
    return fixture.debugElement.children[0].componentInstance as ActiveToggleComponent;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [ConfirmationService, MessageService],
    }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    confirm = TestBed.inject(ConfirmationService);
    fixture.detectChanges();
  });

  it('activating (false→true) patches immediately without confirmation', () => {
    const patchSpy = vi.fn((_id: number, _v: boolean) => of({}));
    fixture.componentInstance.patch.set(patchSpy);
    fixture.detectChanges();
    child().onChange(true);
    expect(patchSpy).toHaveBeenCalledWith(1, true);
    expect(fixture.componentInstance.value()).toBe(true);
  });

  it('deactivating (true→false) asks for confirmation first', () => {
    fixture.componentInstance.value.set(true);
    const patchSpy = vi.fn((_id: number, _v: boolean) => of({}));
    fixture.componentInstance.patch.set(patchSpy);
    fixture.detectChanges();
    const confirmSpy = vi.spyOn(confirm, 'confirm');
    child().onChange(false);
    expect(confirmSpy).toHaveBeenCalled();
    expect(patchSpy).not.toHaveBeenCalled(); // not until accept
  });

  it('rolls back on patch error', () => {
    fixture.componentInstance.patch.set(() => throwError(() => new Error('boom')));
    fixture.detectChanges();
    child().onChange(true);
    expect(fixture.componentInstance.value()).toBe(false); // rolled back
  });
});
