import assert from 'node:assert/strict';

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
  headers?: Record<string, string>;
  body?: string | Record<string, unknown>;
  redirect?: 'manual' | 'follow';
  timeoutMs?: number;
}

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  rawHeaders: Headers;
  body: string;
  json: <T = unknown>() => T;
  durationMs: number;
  url: string;
}

export class TestHttpClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;

  public constructor(baseUrl: string, defaultHeaders: Record<string, string> = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.defaultHeaders = defaultHeaders;
  }

  public async request(pathOrUrl: string, options: RequestOptions = {}): Promise<HttpResponse> {
    const url =
      pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')
        ? pathOrUrl
        : `${this.baseUrl}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;

    const headers = new Headers({
      ...this.defaultHeaders,
      ...options.headers,
    });

    let bodyPayload: BodyInit | undefined;
    if (options.body !== undefined) {
      if (typeof options.body === 'string') {
        bodyPayload = options.body;
      } else {
        if (!headers.has('content-type')) {
          headers.set('content-type', 'application/json');
        }
        bodyPayload = JSON.stringify(options.body);
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
    const startTime = performance.now();

    try {
      const response = await fetch(url, {
        method: options.method ?? 'GET',
        headers,
        body: bodyPayload,
        redirect: options.redirect ?? 'follow',
        signal: controller.signal,
      });

      const text = await response.text();
      const durationMs = Math.round(performance.now() - startTime);

      const headerMap: Record<string, string> = {};
      response.headers.forEach((val, key) => {
        headerMap[key.toLowerCase()] = val;
      });

      return {
        status: response.status,
        statusText: response.statusText,
        headers: headerMap,
        rawHeaders: response.headers,
        body: text,
        json: <T = unknown>() => {
          try {
            return JSON.parse(text) as T;
          } catch (err) {
            throw new Error(
              `Failed to parse JSON response from ${url} (status ${response.status}):\n${text}\nError: ${(err as Error).message}`,
              { cause: err },
            );
          }
        },
        durationMs,
        url: response.url || url,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  public async get(
    path: string,
    options: Omit<RequestOptions, 'method'> = {},
  ): Promise<HttpResponse> {
    return this.request(path, { ...options, method: 'GET' });
  }

  public async post(
    path: string,
    body?: string | Record<string, unknown>,
    options: Omit<RequestOptions, 'method' | 'body'> = {},
  ): Promise<HttpResponse> {
    return this.request(path, { ...options, method: 'POST', body });
  }

  public async options(
    path: string,
    options: Omit<RequestOptions, 'method'> = {},
  ): Promise<HttpResponse> {
    return this.request(path, { ...options, method: 'OPTIONS' });
  }

  public async head(
    path: string,
    options: Omit<RequestOptions, 'method'> = {},
  ): Promise<HttpResponse> {
    return this.request(path, { ...options, method: 'HEAD' });
  }
}

// ---------------------------------------------------------------------------
// Assertion Helpers for Opaque-Box Verification
// ---------------------------------------------------------------------------

export function assertStatus(
  res: HttpResponse,
  expected: number | number[],
  contextMessage?: string,
): void {
  const allowed = Array.isArray(expected) ? expected : [expected];
  assert.ok(
    allowed.includes(res.status),
    `[${contextMessage ?? 'Status check'}] Expected HTTP status ${allowed.join(' or ')}, received ${res.status} ${res.statusText} at ${res.url}.\nBody preview: ${res.body.slice(0, 300)}`,
  );
}

export function assertHeaderPresent(
  res: HttpResponse,
  headerName: string,
  contextMessage?: string,
): string {
  const key = headerName.toLowerCase();
  const val = res.headers[key];
  assert.ok(
    val !== undefined && val !== null,
    `[${contextMessage ?? 'Header check'}] Expected header '${headerName}' to be present on response from ${res.url}. Available headers: ${Object.keys(res.headers).join(', ')}`,
  );
  return val;
}

export function assertHeaderMatches(
  res: HttpResponse,
  headerName: string,
  pattern: RegExp | string,
  contextMessage?: string,
): string {
  const val = assertHeaderPresent(res, headerName, contextMessage);
  if (typeof pattern === 'string') {
    assert.ok(
      val.toLowerCase().includes(pattern.toLowerCase()),
      `[${contextMessage ?? 'Header match'}] Expected header '${headerName}' ('${val}') to contain '${pattern}' from ${res.url}.`,
    );
  } else {
    assert.ok(
      pattern.test(val),
      `[${contextMessage ?? 'Header regex'}] Expected header '${headerName}' ('${val}') to match regex ${pattern} from ${res.url}.`,
    );
  }
  return val;
}

export function assertContentType(
  res: HttpResponse,
  expectedType: string | RegExp,
  contextMessage?: string,
): void {
  assertHeaderMatches(
    res,
    'content-type',
    expectedType,
    contextMessage ?? 'Content-Type validation',
  );
}
