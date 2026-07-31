import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { describe, expect, it } from 'vitest';
import { App } from './app';

describe('App', () => {
  it('renders a router-outlet at the root', async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      // MessageService: the shell now hosts <p-toast />, used to offer a reload
      // when a lazy chunk went missing after a deploy (StaleChunkService).
      providers: [provideRouter([]), MessageService],
    }).compileComponents();

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBeNull();
  });
});
