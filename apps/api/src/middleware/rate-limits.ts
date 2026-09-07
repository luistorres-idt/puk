import { rateLimit } from 'express-rate-limit';

function limiter(limit: number, windowMs: number) {
  return rateLimit({
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    windowMs,
    validate: { trustProxy: false },
  });
}

export const generalRateLimit = limiter(300, 60_000);
export const authenticationRateLimit = limiter(10, 15 * 60_000);
export const costlyOperationRateLimit = limiter(30, 60_000);
