import { randomUUID } from 'node:crypto';

import type { RequestHandler } from 'express';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,100}$/;

export const requestId: RequestHandler = (request, response, next) => {
  const supplied = request.header('x-request-id');
  const id = supplied !== undefined && REQUEST_ID_PATTERN.test(supplied) ? supplied : randomUUID();

  response.locals.requestId = id;
  response.setHeader('x-request-id', id);
  next();
};
