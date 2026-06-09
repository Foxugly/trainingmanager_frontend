import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { MetaFieldComponent } from './meta-field.component';

@Component({
  imports: [MetaFieldComponent],
  template: `
    <app-meta-field label="Nom" for="name" [hint]="hint()" [error]="error()" [full]="true">
      <input id="name" data-testid="ctrl" />
    </app-meta-field>
  `,
})
class HostComponent {
  hint = signal<string | null>('Aide');
  error = signal<string | null>(null);
}

describe('MetaFieldComponent', () => {
  let fixture: ComponentFixture<HostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('renders label, projects the control, shows hint, applies --full', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('label.meta-label')?.textContent).toContain('Nom');
    expect(el.querySelector('label.meta-label')?.getAttribute('for')).toBe('name');
    expect(el.querySelector('[data-testid="ctrl"]')).not.toBeNull();
    expect(el.querySelector('.meta-hint')?.textContent).toContain('Aide');
    expect(el.querySelector('.meta-item--full')).not.toBeNull();
  });

  it('shows the error in place of the hint with the error modifier', () => {
    fixture.componentInstance.error.set('Requis');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.meta-hint--error')?.textContent).toContain('Requis');
  });

  it('announces the error to screen readers and gives it a stable id derived from `for`', () => {
    fixture.componentInstance.error.set('Requis');
    fixture.detectChanges();
    const err = (fixture.nativeElement as HTMLElement).querySelector('.meta-hint--error');
    expect(err?.getAttribute('role')).toBe('alert');
    expect(err?.getAttribute('aria-live')).toBe('assertive');
    expect(err?.getAttribute('id')).toBe('name-error');
  });
});
