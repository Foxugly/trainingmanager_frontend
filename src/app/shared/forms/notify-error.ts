import { HttpErrorResponse } from '@angular/common/http';

export interface FieldErrors {
  [field: string]: string[];
}

export interface ServerError {
  fields: FieldErrors | null;
  detail: string | null;
}

/** Parse a DRF error body into { fields, detail }. Mirrors the inline logic
 * previously duplicated in each form's applyServerError(). */
export function extractServerError(err: HttpErrorResponse): ServerError {
  const body = err?.error as
    | { code?: string; detail?: string; fields?: FieldErrors }
    | null
    | undefined;

  if (body?.fields && Object.keys(body.fields).length > 0) {
    return { fields: body.fields, detail: null };
  }

  if (body && typeof body === 'object') {
    const fields: FieldErrors = {};
    for (const [key, value] of Object.entries(body)) {
      if (key === 'code' || key === 'detail' || key === 'fields') continue;
      if (Array.isArray(value)) {
        fields[key] = value.filter((m): m is string => typeof m === 'string');
      }
    }
    if (Object.keys(fields).length > 0) return { fields, detail: null };
  }

  return { fields: null, detail: body?.detail ?? null };
}
