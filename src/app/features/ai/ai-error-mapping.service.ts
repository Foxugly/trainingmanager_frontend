import { HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';

export interface AiErrorInfo {
  i18nKey: string;
  retryAfterSeconds?: number;
  fields?: Record<string, unknown>;
}

interface FieldErrorEntry {
  code?: string;
  detail?: string;
}

@Injectable({ providedIn: 'root' })
export class AiErrorMappingService {
  map(err: HttpErrorResponse): AiErrorInfo {
    if (err.status === 429) {
      const retryAfterStr = err.headers?.get('Retry-After') ?? err.headers?.get('retry-after');
      const parsed = retryAfterStr ? parseInt(retryAfterStr, 10) : NaN;
      return {
        i18nKey: 'ai.errors.throttled',
        retryAfterSeconds: Number.isFinite(parsed) ? parsed : undefined,
      };
    }

    const body = err.error as
      | { code?: string; detail?: string; fields?: Record<string, unknown> }
      | null
      | undefined;
    const code = body?.code;
    const fields = body?.fields;

    if (err.status === 400 && fields && Object.keys(fields).length > 0) {
      for (const fieldKey of Object.keys(fields)) {
        const value = fields[fieldKey];
        const entries = Array.isArray(value) ? (value as FieldErrorEntry[]) : [];
        if (entries.some((f) => f?.code === 'date_range_invalid')) {
          return { i18nKey: 'ai.errors.date_range_invalid', fields };
        }
        if (entries.some((f) => f?.code === 'date_range_too_long')) {
          return { i18nKey: 'ai.errors.date_range_too_long', fields };
        }
      }
      return { i18nKey: 'ai.errors.validation', fields };
    }

    if (err.status === 403 && code === 'not_a_manager') {
      return { i18nKey: 'ai.errors.not_a_manager' };
    }

    if (err.status === 409 && code === 'event_has_rounds') {
      return { i18nKey: 'ai.errors.event_has_rounds' };
    }

    if (err.status === 500 && code === 'ai_configuration_error') {
      return { i18nKey: 'ai.errors.configuration' };
    }

    if (err.status === 502 && code === 'ai_service_error') {
      return { i18nKey: 'ai.errors.service' };
    }

    return { i18nKey: 'ai.errors.unknown' };
  }
}
