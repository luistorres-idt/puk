const SENSITIVE_KEY =
  /authorization|cookie|password|secret|token|private.?key|signed.?url|email|imei|rfc|tax.?data|tax.?address|fiscal|account|bancaria/i;
const SIGNED_QUERY = /([?&](?:X-Amz-[^=]+|token|signature)=)[^&]*/gi;
const BEARER = /(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi;
const DATABASE_CREDENTIALS = /(postgres(?:ql)?:\/\/[^:/\s]+:)[^@/\s]+@/gi;

export function redact(value: unknown, key = ''): unknown {
  if (SENSITIVE_KEY.test(key)) return '[REDACTED]';
  if (typeof value === 'string') {
    return value
      .replaceAll(SIGNED_QUERY, '$1[REDACTED]')
      .replaceAll(BEARER, '$1[REDACTED]')
      .replaceAll(DATABASE_CREDENTIALS, '$1[REDACTED]@');
  }
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value instanceof Error)
    return { message: redact(value.message), name: value.name, stack: redact(value.stack) };
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, child]) => [childKey, redact(child, childKey)]),
    );
  }
  return value;
}
