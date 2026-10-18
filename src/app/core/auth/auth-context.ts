import { HttpContextToken } from '@angular/common/http';

/**
 * Set on a request whose 401 must NOT trigger a token refresh + replay
 * (e.g. the best-effort POST auth/logout/: the session is ending anyway).
 */
export const SKIP_REFRESH_ON_401 = new HttpContextToken<boolean>(() => false);
