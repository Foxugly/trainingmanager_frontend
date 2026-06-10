import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import { extractServerError } from './notify-error';

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
