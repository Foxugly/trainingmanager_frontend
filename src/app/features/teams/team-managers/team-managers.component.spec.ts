import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomUserPublic } from '../../../api/model/custom-user-public';
import { TeamManagersComponent } from './team-managers.component';

const candidates = [
  { id: 1, first_name: 'Alice', last_name: 'Martin' },
  { id: 99, first_name: '', last_name: '' },
] as CustomUserPublic[];

interface Protected {
  selectedManagers(): CustomUserPublic[];
  addableManagers(): CustomUserPublic[];
  managerInitials(m: CustomUserPublic): string;
  removeManager(id: number): void;
  openAddManager(): void;
  confirmAddManager(): void;
  managerPickId: { set(v: number | null): void };
}

describe('TeamManagersComponent', () => {
  let fixture: ComponentFixture<TeamManagersComponent>;
  let component: TeamManagersComponent;
  const access = (c: TeamManagersComponent) => c as unknown as Protected;

  function setup(managerIds: number[] = []) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [
        TeamManagersComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [provideNoopAnimations()],
    }).overrideComponent(TeamManagersComponent, { set: { template: '', imports: [] } });
    fixture = TestBed.createComponent(TeamManagersComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('availableManagers', candidates);
    fixture.componentRef.setInput('managerIds', managerIds);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => setup([1]));

  it('selectedManagers reflects the managerIds input', () => {
    expect(
      access(component)
        .selectedManagers()
        .map((m) => m.id),
    ).toEqual([1]);
  });

  it('addableManagers excludes already-selected managers', () => {
    expect(
      access(component)
        .addableManagers()
        .map((m) => m.id),
    ).toEqual([99]);
  });

  it('managerInitials builds two-letter initials, falling back to "?"', () => {
    expect(access(component).managerInitials(candidates[0])).toBe('AM');
    expect(access(component).managerInitials(candidates[1])).toBe('?');
  });

  it('removeManager emits the id list without the removed id', () => {
    const spy = vi.fn();
    component.managerIdsChange.subscribe(spy);
    access(component).removeManager(1);
    expect(spy).toHaveBeenCalledWith([]);
  });

  it('confirmAddManager emits the id list with the picked candidate appended', () => {
    const spy = vi.fn();
    component.managerIdsChange.subscribe(spy);
    access(component).openAddManager();
    access(component).managerPickId.set(99);
    access(component).confirmAddManager();
    expect(spy).toHaveBeenCalledWith([1, 99]);
  });

  it('confirmAddManager with no pick emits nothing', () => {
    const spy = vi.fn();
    component.managerIdsChange.subscribe(spy);
    access(component).openAddManager();
    access(component).confirmAddManager();
    expect(spy).not.toHaveBeenCalled();
  });
});
