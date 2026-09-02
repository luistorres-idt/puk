import type { RequestHandler } from 'express';

import { AppError } from '../shared/errors.js';
import type { Capability } from './capabilities.js';
import { hasCapability } from './capabilities.js';
import type { TokenService } from './tokens.js';

export function authenticate(tokens: TokenService): RequestHandler {
  return async (request, _response, next) => {
    const authorization = request.header('authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return next(new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.'));
    }

    try {
      const claims = await tokens.verifyAccessToken(authorization.slice(7));
      request.auth = { role: claims.role, userId: claims.sub! };
      next();
    } catch {
      next(new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.'));
    }
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
