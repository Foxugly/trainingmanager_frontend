import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { PageHeaderComponent } from './page-header.component';

@Component({
  imports: [PageHeaderComponent],
  template: `
    <app-page-header title="Éditer">
      <button slot="left" data-testid="back">Back</button>
      <span slot="title-after" data-testid="badge">Actif</span>
      <button slot="right" data-testid="action">X</button>
    </app-page-header>
  `,
})
class HostComponent {}

describe('PageHeaderComponent', () => {
  let fixture: ComponentFixture<HostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('renders the title and projects the three slots', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toContain('Éditer');
    expect(el.querySelector('[data-testid="back"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="badge"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="action"]')).not.toBeNull();
  });
});
