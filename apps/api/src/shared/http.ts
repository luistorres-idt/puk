import type { Response } from 'express';

export interface ResponseMeta {
  requestId: string;
}

export function sendSuccess<T>(response: Response, data: T, status = 200): void {
  response.status(status).json({ data, meta: responseMeta(response) });
}

export function responseMeta(response: Response): ResponseMeta {
  return { requestId: String(response.locals.requestId) };
}
