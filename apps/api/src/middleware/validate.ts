import type { RequestHandler } from 'express';
import type * as v from 'valibot';
import { safeParse } from 'valibot';

import { AppError } from '../shared/errors.js';

type RequestSchemas = Partial<
  Record<'body' | 'params' | 'query', v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>>
>;

export function validate(schemas: RequestSchemas): RequestHandler {
  return (request, _response, next) => {
    for (const target of ['params', 'query', 'body'] as const) {
      const schema = schemas[target];
      if (schema === undefined) continue;

      const result = safeParse(schema, request[target]);
      if (!result.success) {
        next(
          new AppError(400, 'VALIDATION_ERROR', `Invalid request ${target}.`, {
            issues: result.issues.map((issue) => ({
              message: issue.message,
              path: issue.path?.map((item) => String(item.key)).join('.') ?? target,
            })),
          }),
        );
        return;
      }

      Object.defineProperty(request, target, {
        configurable: true,
        value: result.output,
        writable: true,
      });
    }

    next();
  };
}
