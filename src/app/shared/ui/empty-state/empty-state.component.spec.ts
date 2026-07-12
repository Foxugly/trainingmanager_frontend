import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { EmptyStateComponent } from './empty-state.component';

@Component({
  imports: [EmptyStateComponent],
  template: `
    <app-empty-state
      icon="users"
      title="Pas d'équipe"
      subtitle="Créez la vôtre."
      tone="emerald"
    >
      <button data-testid="cta">Créer</button>
    </app-empty-state>
  `,
})
class HostComponent {}

describe('EmptyStateComponent', () => {
  let fixture: ComponentFixture<HostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('renders title, subtitle, icon class, and projects content', () => {
    const html = fixture.nativeElement.textContent as string;
    expect(html).toContain("Pas d'équipe");
    expect(html).toContain('Créez la vôtre');
    expect(fixture.nativeElement.querySelector('[data-testid="cta"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('i.pi.pi-users')).not.toBeNull();
  });

  it('applies the requested tone class on the icon pill', () => {
    // Tone is now a scoped BEM modifier (token-based colours) instead of
    // Tailwind bg-/text- utilities.
    const pill = fixture.nativeElement.querySelector('.empty-state__icon') as HTMLElement;
    expect(pill).not.toBeNull();
    expect(pill.className).toContain('empty-state__icon--emerald');
  });
});
