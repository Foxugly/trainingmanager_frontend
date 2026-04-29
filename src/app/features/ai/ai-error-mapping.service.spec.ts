import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AiErrorMappingService } from './ai-error-mapping.service';

function makeError(
  status: number,
  body: unknown = null,
  headers: Record<string, string> = {},
): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    error: body,
    headers: new HttpHeaders(headers),
  });
}

describe('AiErrorMappingService', () => {
  let service: AiErrorMappingService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AiErrorMappingService);
  });

  it('maps 429 with Retry-After header', () => {
    const err = makeError(429, { code: 'throttled' }, { 'Retry-After': '180' });
    const info = service.map(err);
    expect(info.i18nKey).toBe('ai.errors.throttled');
    expect(info.retryAfterSeconds).toBe(180);
  });

  it('maps 429 without Retry-After (undefined retryAfterSeconds)', () => {
    const err = makeError(429, { code: 'throttled' });
    const info = service.map(err);
    expect(info.i18nKey).toBe('ai.errors.throttled');
    expect(info.retryAfterSeconds).toBeUndefined();
  });

  it('maps 400 with date_range_invalid in fields', () => {
    const err = makeError(400, {
      code: 'validation_error',
      fields: { date_end: [{ code: 'date_range_invalid', detail: 'fin avant début' }] },
    });
    expect(service.map(err).i18nKey).toBe('ai.errors.date_range_invalid');
  });

  it('maps 400 with date_range_too_long', () => {
    const err = makeError(400, {
      code: 'validation_error',
      fields: {
        non_field_errors: [{ code: 'date_range_too_long', detail: 'over 365' }],
      },
    });
    expect(service.map(err).i18nKey).toBe('ai.errors.date_range_too_long');
  });

  it('maps 400 generic validation when fields don\'t match known codes', () => {
    const err = makeError(400, {
      code: 'validation_error',
      fields: { something: [{ code: 'unknown_code', detail: 'X' }] },
    });
    expect(service.map(err).i18nKey).toBe('ai.errors.validation');
  });

  it('maps 403 not_a_manager', () => {
    const err = makeError(403, { code: 'not_a_manager', detail: 'denied' });
    expect(service.map(err).i18nKey).toBe('ai.errors.not_a_manager');
  });

  it('maps 409 event_has_rounds', () => {
    const err = makeError(409, { code: 'event_has_rounds', detail: 'has rounds' });
    expect(service.map(err).i18nKey).toBe('ai.errors.event_has_rounds');
  });

  it('maps 502 ai_service_error', () => {
    const err = makeError(502, { code: 'ai_service_error', detail: 'upstream' });
    expect(service.map(err).i18nKey).toBe('ai.errors.service');
  });

  it('falls back to unknown for unmapped errors', () => {
    const err = makeError(500, { code: 'something_else' });
    expect(service.map(err).i18nKey).toBe('ai.errors.unknown');
  });
});
