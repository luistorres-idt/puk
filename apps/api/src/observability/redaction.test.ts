import { describe, expect, it } from 'vitest';

import { redact } from './redaction.js';

describe('redact', () => {
  it('redacts nested secrets and signed query parameters', () => {
    expect(
      redact({
        authorization: 'Bearer value',
        message: 'Failed with Bearer abc.def.ghi',
        nested: { password: 'value' },
        url: 'https://objects.invalid/file?X-Amz-Signature=value&safe=yes',
      }),
    ).toEqual({
      authorization: '[REDACTED]',
      message: 'Failed with Bearer [REDACTED]',
      nested: { password: '[REDACTED]' },
      url: 'https://objects.invalid/file?X-Amz-Signature=[REDACTED]&safe=yes',
    });
  });
});
