import { describe, expect, it } from 'vitest';
import { isStorageUrl } from './attachment-upload.service';

describe('isStorageUrl', () => {
  it('accepts an https S3 URL', () => {
    expect(
      isStorageUrl(
        'https://foxugly-tm-attachments.s3.eu-west-1.amazonaws.com/attachments/x?X-Amz-Signature=1',
      ),
    ).toBe(true);
  });

  it.each([
    'http://foxugly-tm-attachments.s3.eu-west-1.amazonaws.com/a',
    'https://evil.example.com/a',
    'https://amazonaws.com.evil.example/a',
    'javascript:alert(1)',
    'not a url',
  ])('rejects %s', (url) => {
    expect(isStorageUrl(url)).toBe(false);
  });
});
