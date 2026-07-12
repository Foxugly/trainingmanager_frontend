import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';
import { ThemeService } from '../../theme/theme.service';
import { ThemeToggleComponent } from './theme-toggle.component';

describe('ThemeToggleComponent', () => {
  let fixture: ComponentFixture<ThemeToggleComponent>;
  let theme: ThemeService;

  beforeEach(async () => {
    localStorage.clear();
    document.documentElement.classList.remove('dark-mode');
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [
        ThemeToggleComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
    }).compileComponents();
    theme = TestBed.inject(ThemeService);
    fixture = TestBed.createComponent(ThemeToggleComponent);
    fixture.detectChanges();
  });

  it('renders a borderless button with the moon icon in light mode', () => {
    const btn = fixture.nativeElement.querySelector('button.theme-toggle') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(fixture.nativeElement.querySelector('i.pi-moon')).toBeTruthy();
  });

  it('clicking toggles the theme and swaps to the sun icon', () => {
    const btn = fixture.nativeElement.querySelector('button.theme-toggle') as HTMLButtonElement;
    btn.click();
    fixture.detectChanges();
    expect(theme.theme()).toBe('dark');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(fixture.nativeElement.querySelector('i.pi-sun')).toBeTruthy();
  });
});
