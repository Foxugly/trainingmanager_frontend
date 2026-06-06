import { Component, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DuplicateEventDialogComponent,
  type DuplicateEventSubmit,
} from './duplicate-event-dialog.component';

interface ProtectedFields {
  form: {
    controls: {
      date: { setValue(v: Date | null): void };
      repeat_weekly: { setValue(v: boolean): void };
      occurrences: { setValue(v: number): void };
    };
  };
  onConfirm(): void;
  canSubmit(): boolean;
  onVisibleChange(value: boolean): void;
}

@Component({
  imports: [DuplicateEventDialogComponent],
  template: `
    <app-duplicate-event-dialog
      [(visible)]="visible"
      [sourceDate]="sourceDate"
      [loading]="loading"
      (confirmed)="onConfirmed($event)"
    />
  `,
})
class HostComponent {
  visible = signal(false);
  sourceDate: string | null = '2026-06-10';
  loading = false;
  emitted: DuplicateEventSubmit[] = [];
  onConfirmed(payload: DuplicateEventSubmit) {
    this.emitted.push(payload);
  }
}

describe('DuplicateEventDialogComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let component: DuplicateEventDialogComponent;
  let host: HostComponent;

  const access = (c: DuplicateEventDialogComponent) => c as unknown as ProtectedFields;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        HostComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: { events: { duplicate: { title: 'OK' } } } },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [provideHttpClient(), provideNoopAnimations()],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    host = fixture.componentInstance;
    component = fixture.debugElement.children[0]
      .componentInstance as DuplicateEventDialogComponent;
  });

  it('defaults the copy date to sourceDate + 7 days when opened', () => {
    host.visible.set(true);
    fixture.detectChanges();
    access(component).onConfirm();
    expect(host.emitted).toHaveLength(1);
    // 2026-06-10 + 7 days = 2026-06-17
    expect(host.emitted[0].date).toBe('2026-06-17');
  });

  it('emits occurrences = 1 when repeat is off', () => {
    host.visible.set(true);
    fixture.detectChanges();
    access(component).form.controls.repeat_weekly.setValue(false);
    access(component).form.controls.occurrences.setValue(10);
    access(component).onConfirm();
    expect(host.emitted[0]).toMatchObject({ repeat_weekly: false, occurrences: 1 });
  });

  it('emits the occurrences value when repeat is on', () => {
    host.visible.set(true);
    fixture.detectChanges();
    access(component).form.controls.repeat_weekly.setValue(true);
    access(component).form.controls.occurrences.setValue(6);
    access(component).onConfirm();
    expect(host.emitted[0]).toMatchObject({ repeat_weekly: true, occurrences: 6 });
  });

  it('does not allow submit while loading', () => {
    host.loading = true;
    host.visible.set(true);
    fixture.detectChanges();
    expect(access(component).canSubmit()).toBe(false);
  });

  it('does not emit when the date is null', () => {
    host.visible.set(true);
    fixture.detectChanges();
    access(component).form.controls.date.setValue(null);
    access(component).onConfirm();
    expect(host.emitted).toHaveLength(0);
  });
});
