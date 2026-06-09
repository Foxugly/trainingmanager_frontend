import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AriaDescribesDirective } from './aria-describes.directive';

// Host where the directive sits on a native <input> (host IS the focusable el).
@Component({
  imports: [AriaDescribesDirective],
  template: `<input [appAriaDescribes]="describedBy()" />`,
})
class NativeHostComponent {
  describedBy = signal<string | null>(null);
}

// Host where the directive sits on a wrapper whose inner focusable element is a
// `.p-inputtext` div (mirrors the PrimeNG case: host !== focusable element).
@Component({
  imports: [AriaDescribesDirective],
  template: `
    <div [appAriaDescribes]="describedBy()">
      <div class="p-inputtext"></div>
    </div>
  `,
})
class WrapperHostComponent {
  describedBy = signal<string | null>(null);
}

describe('AriaDescribesDirective', () => {
  describe('on a native <input> host', () => {
    let fixture: ComponentFixture<NativeHostComponent>;
    let input: HTMLInputElement;

    beforeEach(async () => {
      await TestBed.configureTestingModule({ imports: [NativeHostComponent] }).compileComponents();
      fixture = TestBed.createComponent(NativeHostComponent);
      fixture.detectChanges();
      await fixture.whenStable(); // let afterNextRender run
      input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    });

    it('sets aria-describedby when an id is provided', async () => {
      fixture.componentInstance.describedBy.set('err-1');
      fixture.detectChanges();
      await fixture.whenStable();
      expect(input.getAttribute('aria-describedby')).toBe('err-1');
    });

    it('removes aria-describedby when the id toggles back to null', async () => {
      fixture.componentInstance.describedBy.set('err-1');
      fixture.detectChanges();
      await fixture.whenStable();
      expect(input.getAttribute('aria-describedby')).toBe('err-1');

      fixture.componentInstance.describedBy.set(null);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(input.hasAttribute('aria-describedby')).toBe(false);
    });
  });

  describe('on a wrapper with a nested .p-inputtext', () => {
    let fixture: ComponentFixture<WrapperHostComponent>;
    let inner: HTMLElement;

    beforeEach(async () => {
      await TestBed.configureTestingModule({ imports: [WrapperHostComponent] }).compileComponents();
      fixture = TestBed.createComponent(WrapperHostComponent);
      fixture.detectChanges();
      await fixture.whenStable();
      inner = fixture.nativeElement.querySelector('.p-inputtext') as HTMLElement;
    });

    it('sets aria-describedby on the inner element, not the host', async () => {
      const host = inner.parentElement as HTMLElement; // the wrapper div carrying the directive
      fixture.componentInstance.describedBy.set('err-2');
      fixture.detectChanges();
      await fixture.whenStable();
      expect(inner.getAttribute('aria-describedby')).toBe('err-2');
      expect(host.hasAttribute('aria-describedby')).toBe(false);
    });

    it('removes aria-describedby from the inner element when null', async () => {
      fixture.componentInstance.describedBy.set('err-2');
      fixture.detectChanges();
      await fixture.whenStable();
      expect(inner.getAttribute('aria-describedby')).toBe('err-2');

      fixture.componentInstance.describedBy.set(null);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(inner.hasAttribute('aria-describedby')).toBe(false);
    });
  });
});
