export const EMAIL_USER = 'info';
export const EMAIL_HOST = 'foxugly';
export const EMAIL_TLD = 'com';

export const PHONE_COUNTRY = '+32';
export const PHONE_PARTS = ['470', '672', '572'] as const;

export const WEBSITE_URL = 'https://www.foxugly.com';
export const WEBSITE_DISPLAY = 'www.foxugly.com';

export function emailDisplay(): string {
  return `${EMAIL_USER} [at] ${EMAIL_HOST} [dot] ${EMAIL_TLD}`;
}

export function phoneDisplay(): string {
  return `${PHONE_COUNTRY} ${PHONE_PARTS.join(' ')}`;
}

export function openContactEmail(subject: string): void {
  const address = `${EMAIL_USER}@${EMAIL_HOST}.${EMAIL_TLD}`;
  const params = new URLSearchParams({ subject });
  window.location.href = `mailto:${address}?${params.toString()}`;
}
