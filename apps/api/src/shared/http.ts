import type { Response } from 'express';

export interface ResponseMeta {
  requestId: string;
}

export function sendSuccess<T>(
  response: Response,
  data: T,
  status = 200,
  extraMeta: Record<string, unknown> = {},
): void {
  response.status(status).json({ data, meta: { ...responseMeta(response), ...extraMeta } });
}

export function responseMeta(response: Response): ResponseMeta {
  return { requestId: String(response.locals.requestId) };
}
