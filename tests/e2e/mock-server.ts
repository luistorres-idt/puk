import http from 'node:http';
import type { AddressInfo } from 'node:net';

export interface MockServers {
  cloudfrontUrl: string;
  cloudfrontHttpUrl: string;
  albUrl: string;
  originVerifySecret: string;
  close: () => Promise<void>;
}

export async function startMockEnvironment(
  customSecret: string = 'puk-staging-075566976700-us-east-2-origin-verify',
): Promise<MockServers> {
  const originVerifySecret = customSecret;
  const assetCache = new Set<string>();

  // -------------------------------------------------------------------------
  // 1. ALB Server (Origin)
  // -------------------------------------------------------------------------
  const albServer = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const originHeader = req.headers['x-origin-verify'];

    // Feature 7 & 18: Ingress verification - block direct access without valid secret
    if (originHeader !== originVerifySecret) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden: Direct access to load balancer is blocked.');
      return;
    }

    const pathname = url.pathname;

    // Feature 9 & ALB Listener Rule: API routes condition:
    // ['/api', '/api/*', '/health', '/health/*', '/metrics', '/docs', '/docs/*']
    const isApiRoute =
      pathname === '/api' ||
      pathname.startsWith('/api/') ||
      pathname === '/health' ||
      pathname.startsWith('/health/') ||
      pathname === '/metrics' ||
      pathname === '/docs' ||
      pathname.startsWith('/docs/');

    if (isApiRoute) {
      // API Container emulation
      if (pathname === '/health/live') {
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        });
        res.end(
          JSON.stringify({
            data: { service: 'api', status: 'ok' },
            meta: { requestId: 'mock-req-live' },
          }),
        );
        return;
      }

      if (pathname === '/health/ready') {
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        });
        res.end(
          JSON.stringify({
            data: { service: 'api', status: 'ok' },
            meta: { requestId: 'mock-req-ready' },
          }),
        );
        return;
      }

      if (pathname === '/health' || pathname === '/api') {
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        });
        res.end(JSON.stringify({ data: { service: 'api', path: pathname } }));
        return;
      }

      if (pathname === '/metrics') {
        res.writeHead(200, {
          'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        });
        res.end(
          `# HELP process_cpu_user_seconds_total Total user CPU time spent in seconds.\n# TYPE process_cpu_user_seconds_total counter\nprocess_cpu_user_seconds_total 2.45\n# HELP http_requests_total Total number of HTTP requests\n# TYPE http_requests_total counter\nhttp_requests_total 42\n`,
        );
        return;
      }

      if (pathname === '/docs') {
        res.writeHead(301, {
          Location: '/docs/',
          'Content-Type': 'text/plain; charset=utf-8',
        });
        res.end('Redirecting to /docs/');
        return;
      }

      if (pathname === '/docs/') {
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
        });
        res.end(
          '<!DOCTYPE html><html><head><title>Swagger UI - Bull Dog Solution API</title></head><body><div id="swagger-ui">Swagger Spec</div></body></html>',
        );
        return;
      }

      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': req.headers.origin ?? '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Credentials': 'true',
        });
        res.end();
        return;
      }

      if (pathname === '/api/v1/auth/login') {
        res.writeHead(400, {
          'Content-Type': 'application/json; charset=utf-8',
          'Set-Cookie':
            'puk_refresh=mock-refresh-jwt; Path=/api/v1/auth; HttpOnly; Secure; SameSite=Lax',
        });
        res.end(
          JSON.stringify({
            error: { code: 'VALIDATION_ERROR', message: 'Invalid credentials payload' },
            meta: { requestId: 'mock-login' },
          }),
        );
        return;
      }

      if (pathname === '/api/v1/auth/me' || pathname === '/api/v1/orders') {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          res.writeHead(401, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          });
          res.end(
            JSON.stringify({
              error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
              meta: { requestId: 'mock-auth-err' },
            }),
          );
          return;
        }
      }

      // Default API 404 handler (JSON response)
      res.writeHead(404, {
        'Content-Type': 'application/json; charset=utf-8',
      });
      res.end(
        JSON.stringify({
          error: {
            code: 'ROUTE_NOT_FOUND',
            message: `Route ${req.method} ${pathname} was not found.`,
          },
        }),
      );
      return;
    }

    // Default ALB Action -> Web Container (Nginx)
    if (pathname.startsWith('/assets/')) {
      if (pathname.includes('missing') || pathname.includes('nonexistent')) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
        return;
      }

      res.writeHead(200, {
        'Content-Type': pathname.endsWith('.css') ? 'text/css' : 'application/javascript',
        'Cache-Control': 'public, immutable, max-age=31536000',
      });
      res.end(`/* Bull Dog Solution Web Asset ${pathname} */ console.log("bds-asset");`);
      return;
    }

    // SPA Single Page Application fallback (Nginx: try_files $uri $uri/ /index.html)
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(
      `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <title>Bull Dog Solution</title>
    <script type="module" src="/assets/index-bds123.js"></script>
    <link rel="stylesheet" href="/assets/style-bds123.css" />
  </head>
  <body>
    <div id="app">Bull Dog Solution Frontend SPA</div>
  </body>
</html>`,
    );
  });

  await new Promise<void>((resolve) => albServer.listen(0, '127.0.0.1', () => resolve()));
  const albPort = (albServer.address() as AddressInfo).port;
  const albUrl = `http://127.0.0.1:${albPort}`;

  // -------------------------------------------------------------------------
  // 2. CloudFront HTTPS Server (Distribution simulator)
  // -------------------------------------------------------------------------
  const cloudfrontServer = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const pathname = url.pathname;

    // Feature 8: Security Response Headers Policy attached to all CloudFront behaviors
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Feature 5: CloudFront Caching Behaviors
    if (pathname.startsWith('/assets/')) {
      if (assetCache.has(pathname)) {
        res.setHeader('X-Cache', 'Hit from cloudfront');
        res.setHeader('Age', '360');
      } else {
        assetCache.add(pathname);
        res.setHeader('X-Cache', 'Miss from cloudfront');
        res.setHeader('Age', '0');
      }
    } else {
      res.setHeader('X-Cache', 'Miss from cloudfront');
    }

    // Forward to ALB with custom header (Feature 6)
    const albReq = http.request(
      `${albUrl}${req.url ?? '/'}`,
      {
        method: req.method,
        headers: {
          ...req.headers,
          host: `127.0.0.1:${albPort}`,
          'x-origin-verify': originVerifySecret,
        },
      },
      (albRes) => {
        // Copy headers from ALB response (excluding hop-by-hop)
        for (const [k, v] of Object.entries(albRes.headers)) {
          if (v !== undefined && !['connection', 'transfer-encoding'].includes(k)) {
            res.setHeader(k, v);
          }
        }
        res.writeHead(albRes.statusCode ?? 200);
        albRes.pipe(res);
      },
    );

    albReq.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end(`Bad Gateway: ${err.message}`);
    });

    req.pipe(albReq);
  });

  await new Promise<void>((resolve) => cloudfrontServer.listen(0, '127.0.0.1', () => resolve()));
  const cfPort = (cloudfrontServer.address() as AddressInfo).port;
  const cloudfrontUrl = `http://127.0.0.1:${cfPort}`;

  // -------------------------------------------------------------------------
  // 3. CloudFront HTTP Server (Redirect to HTTPS simulator)
  // -------------------------------------------------------------------------
  const cloudfrontHttpServer = http.createServer((req, res) => {
    const targetHttpsUrl = `https://mock.cloudfront.net${req.url ?? '/'}`;
    res.writeHead(301, {
      Location: targetHttpsUrl,
      'Content-Type': 'text/html; charset=utf-8',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    });
    res.end(`<html><body>301 Moved: Redirecting to ${targetHttpsUrl}</body></html>`);
  });

  await new Promise<void>((resolve) =>
    cloudfrontHttpServer.listen(0, '127.0.0.1', () => resolve()),
  );
  const cfHttpPort = (cloudfrontHttpServer.address() as AddressInfo).port;
  const cloudfrontHttpUrl = `http://127.0.0.1:${cfHttpPort}`;

  return {
    cloudfrontUrl,
    cloudfrontHttpUrl,
    albUrl,
    originVerifySecret,
    close: async () => {
      await Promise.all([
        new Promise<void>((r) => albServer.close(() => r())),
        new Promise<void>((r) => cloudfrontServer.close(() => r())),
        new Promise<void>((r) => cloudfrontHttpServer.close(() => r())),
      ]);
    },
  };
}
