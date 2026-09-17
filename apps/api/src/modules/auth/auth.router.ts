import { LoginRequestSchema } from '@puk/contracts';
import { Router, type CookieOptions, type RequestHandler } from 'express';

import { authenticate } from '../../auth/authenticate.js';
import { PrismaPrincipalResolver, type PrincipalResolver } from '../../auth/principal-resolver.js';
import type { TokenService } from '../../auth/tokens.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { authenticationRateLimit } from '../../middleware/rate-limits.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../shared/http.js';
import { AuthService } from './auth.service.js';

const REFRESH_COOKIE = 'puk_refresh';

export interface AuthRouterOptions {
  cookie: CookieOptions;
  principalResolver?: PrincipalResolver;
  prisma: PrismaClient;
  requireAccess?: RequestHandler;
  tokens: TokenService;
}

export function createAuthRouter(options: AuthRouterOptions): Router {
  const router = Router();
  const service = new AuthService(options.prisma, options.tokens);
  const requireAccess =
    options.requireAccess ??
    authenticate(
      options.tokens,
      options.principalResolver ?? new PrismaPrincipalResolver(options.prisma),
    );

  router.post(
    '/login',
    authenticationRateLimit,
    validate({ body: LoginRequestSchema }),
    async (request, response) => {
      const session = await service.login({
        ...request.body,
        ipAddress: request.ip,
        userAgent: request.header('user-agent'),
      });
      response.cookie(REFRESH_COOKIE, session.refreshToken, options.cookie);
      sendSuccess(response, { accessToken: session.accessToken, user: session.user });
    },
  );

  router.post('/refresh', authenticationRateLimit, async (request, response) => {
    const session = await service.refresh(String(request.cookies[REFRESH_COOKIE] ?? ''), {
      ipAddress: request.ip,
      userAgent: request.header('user-agent'),
    });
    response.cookie(REFRESH_COOKIE, session.refreshToken, options.cookie);
    sendSuccess(response, { accessToken: session.accessToken, user: session.user });
  });

  router.post('/logout', async (request, response) => {
    await service.logout(request.cookies[REFRESH_COOKIE] as string | undefined);
    response.clearCookie(REFRESH_COOKIE, options.cookie);
    sendSuccess(response, { loggedOut: true });
  });

  router.post('/logout-all', requireAccess, async (request, response) => {
    await service.logoutAll(request.auth!.userId);
    response.clearCookie(REFRESH_COOKIE, options.cookie);
    sendSuccess(response, { loggedOut: true });
  });

  router.get('/me', requireAccess, async (request, response) => {
    sendSuccess(response, await service.me(request.auth!.userId));
  });

  return router;
}
