import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FormFooterComponent } from './form-footer.component';

@Component({
  imports: [FormFooterComponent],
  template: `
    <app-form-footer
      [saving]="false"
      [disabled]="false"
      cancelLabel="Annuler"
      saveLabel="Enregistrer"
      (cancel)="onCancel()"
      (save)="onSave()"
    />
  `,
})
class HostComponent {
  onCancel = vi.fn();
  onSave = vi.fn();
}

describe('FormFooterComponent', () => {
  let fixture: ComponentFixture<HostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('emits save when the submit button is clicked', () => {
    const btns = fixture.nativeElement.querySelectorAll('button');
    (btns[btns.length - 1] as HTMLButtonElement).click();
    expect(fixture.componentInstance.onSave).toHaveBeenCalled();
  });

  it('emits cancel when the cancel button is clicked', () => {
    const btn = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    btn.click();
    expect(fixture.componentInstance.onCancel).toHaveBeenCalled();
  });
});
