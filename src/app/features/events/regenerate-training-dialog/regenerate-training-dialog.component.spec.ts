import { Component, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RegenerateTrainingDialogComponent } from './regenerate-training-dialog.component';

interface ProtectedFields {
  additionalPrompt(): string;
  onConfirm(): void;
  onVisibleChange(value: boolean): void;
  MAX_PROMPT_LEN: number;
}

@Component({
  imports: [RegenerateTrainingDialogComponent],
  template: `
    <app-regenerate-training-dialog
      [(visible)]="visible"
      [hasRounds]="hasRounds"
      [loading]="loading"
      (confirmed)="onConfirmed($event)"
    />
  `,
})
class HostComponent {
  visible = signal(true);
  hasRounds = false;
  loading = false;
  emitted: string[] = [];
  onConfirmed(text: string) {
    this.emitted.push(text);
  }
}

describe('RegenerateTrainingDialogComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let component: RegenerateTrainingDialogComponent;
  let host: HostComponent;

  const access = (c: RegenerateTrainingDialogComponent) => c as unknown as ProtectedFields;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        HostComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: { events: { regenerate: { confirm_title: 'OK' } } } },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [provideHttpClient(), provideNoopAnimations()],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    host = fixture.componentInstance;
    component = fixture.debugElement.children[0]
      .componentInstance as RegenerateTrainingDialogComponent;
  });

  it('emits the trimmed additionalPrompt on confirm', () => {
    (component as unknown as { additionalPrompt: { set(v: string): void } }).additionalPrompt.set(
      '  focus on endurance  ',
    );
    access(component).onConfirm();
    expect(host.emitted).toEqual(['focus on endurance']);
  });

  it('emits empty string when no text was entered', () => {
    access(component).onConfirm();
    expect(host.emitted).toEqual(['']);
  });

  it('clears the prompt when the dialog is closed via visibleChange(false)', () => {
    (component as unknown as { additionalPrompt: { set(v: string): void } }).additionalPrompt.set(
      'something',
    );
    access(component).onVisibleChange(false);
    expect(access(component).additionalPrompt()).toBe('');
    expect(host.visible()).toBe(false);
  });

  it('keeps the prompt and updates visible() when reopening (set true)', () => {
    (component as unknown as { additionalPrompt: { set(v: string): void } }).additionalPrompt.set(
      'kept',
    );
    access(component).onVisibleChange(true);
    expect(access(component).additionalPrompt()).toBe('kept');
    expect(host.visible()).toBe(true);
  });

  it('exposes MAX_PROMPT_LEN = 2000 to align with backend', () => {
    expect(access(component).MAX_PROMPT_LEN).toBe(2000);
  });
});
