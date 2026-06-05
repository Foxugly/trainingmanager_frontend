import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { StatusBadgeComponent } from './status-badge.component';

describe('StatusBadgeComponent', () => {
  let fixture: ComponentFixture<StatusBadgeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [StatusBadgeComponent] }).compileComponents();
    fixture = TestBed.createComponent(StatusBadgeComponent);
    fixture.componentRef.setInput('kind', 'active');
    fixture.componentRef.setInput('label', 'State');
    fixture.detectChanges();
  });

  it('maps active → success severity', () => {
    const cmp = fixture.componentInstance;
    expect(cmp.kind()).toBe('active');
    expect(cmp.severity()).toBe('success');
  });

  it('maps inactive → secondary severity', () => {
    fixture.componentRef.setInput('kind', 'inactive');
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    expect(cmp.severity()).toBe('secondary');
  });
});
