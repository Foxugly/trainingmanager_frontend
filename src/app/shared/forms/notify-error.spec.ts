import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it, vi } from 'vitest';
import { extractServerError, notifyServerError } from './notify-error';

describe('extractServerError', () => {
  it('returns fields when body.fields is present', () => {
    const err = new HttpErrorResponse({ error: { fields: { name: ['Required'] } } });
    expect(extractServerError(err)).toEqual({ fields: { name: ['Required'] }, detail: null });
  });

  it('promotes array values to fields', () => {
    const err = new HttpErrorResponse({ error: { name: ['Too long'], code: 'x' } });
    expect(extractServerError(err)).toEqual({ fields: { name: ['Too long'] }, detail: null });
  });

  it('falls back to detail', () => {
    const err = new HttpErrorResponse({ error: { detail: 'Boom' } });
    expect(extractServerError(err)).toEqual({ fields: null, detail: 'Boom' });
  });
});

describe('notifyServerError', () => {
  it('pushes a toast only when there is a global detail', () => {
    const add = vi.fn();
    const err = new HttpErrorResponse({ error: { detail: 'Boom' } });
    const fields = notifyServerError({ add } as never, err, 'Erreur', 'fallback');
    expect(add).toHaveBeenCalledWith({ severity: 'error', summary: 'Erreur', detail: 'Boom' });
    expect(fields).toBeNull();
  });

  it('returns fields and does NOT toast when only field errors', () => {
    const add = vi.fn();
    const err = new HttpErrorResponse({ error: { fields: { name: ['Required'] } } });
    const fields = notifyServerError({ add } as never, err, 'Erreur', 'fallback');
    expect(add).not.toHaveBeenCalled();
    expect(fields).toEqual({ name: ['Required'] });
  });
});
