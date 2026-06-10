import { Pipe, PipeTransform } from '@angular/core';
import { shortTime } from './short-time';

/**
 * Trim a backend time string ("HH:MM:SS" or "HH:MM") down to "HH:MM".
 *
 * Thin template-facing wrapper that delegates to the pure {@link shortTime}
 * util (returns the first 5 characters, or '' when null/undefined).
 */
@Pipe({ name: 'shortTime' })
export class ShortTimePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return shortTime(value);
  }
}
