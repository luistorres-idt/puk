import type { RequestHandler } from 'express';

import { AppError } from '../shared/errors.js';
import type { Capability } from './capabilities.js';
import { hasCapability } from './capabilities.js';
import type { TokenService } from './tokens.js';
import type { PrincipalResolver } from './principal-resolver.js';

export function authenticate(tokens: TokenService, principals: PrincipalResolver): RequestHandler {
  return async (request, _response, next) => {
    const authorization = request.header('authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return next(new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.'));
    }

    let claims: Awaited<ReturnType<TokenService['verifyAccessToken']>>;
    try {
      claims = await tokens.verifyAccessToken(authorization.slice(7));
    } catch {
      return next(new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.'));
    }

    let principal: Awaited<ReturnType<PrincipalResolver['resolve']>>;
    try {
      principal = await principals.resolve(claims.sub!);
    } catch (error) {
      return next(
        error instanceof AppError
          ? error
          : new AppError(
              503,
              'AUTHORITY_UNAVAILABLE',
              'Authorization state is temporarily unavailable.',
            ),
      );
    }

    if (principal === null) {
      return next(new AppError(401, 'SESSION_REVOKED', 'The session is no longer active.'));
    }

    request.auth = { role: principal.role, userId: claims.sub! };
    next();
  };
}

export function authorize(capability: Capability): RequestHandler {
  return (request, _response, next) => {
    if (request.auth === undefined || !hasCapability(request.auth.role, capability)) {
      return next(
        new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this action.'),
      );
    }
    next();
  };
}
