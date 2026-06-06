import { TranslocoService } from '@jsverse/transloco';
import { VisibilityMode } from '../../api/model/visibility-mode';

/** The three per-aspect visibility modes, in display order. */
export const VISIBILITY_MODES: readonly VisibilityMode[] = [
  VisibilityMode.Always,
  VisibilityMode.After,
  VisibilityMode.Never,
];

/** i18n label key for a given visibility mode (under the `visibility.*` namespace). */
export function visibilityLabelKey(mode: VisibilityMode): string {
  switch (mode) {
    case VisibilityMode.Always:
      return 'visibility.always';
    case VisibilityMode.After:
      return 'visibility.after';
    case VisibilityMode.Never:
      return 'visibility.never';
  }
}

export interface VisibilityOption {
  label: string;
  value: VisibilityMode;
}

/**
 * Build the `p-select` options array for the visibility modes, with labels
 * translated via the given TranslocoService. Call inside a `computed` that
 * reads the active lang so it re-evaluates on language change.
 */
export function buildVisibilityOptions(transloco: TranslocoService): VisibilityOption[] {
  return VISIBILITY_MODES.map((value) => ({
    label: transloco.translate(visibilityLabelKey(value)),
    value,
  }));
}
