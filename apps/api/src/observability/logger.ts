import morgan from 'morgan';
import winston from 'winston';

import { redact } from './redaction.js';

const redactFormat = winston.format((info) => redact(info) as winston.Logform.TransformableInfo);

export const logger = winston.createLogger({
  format: winston.format.combine(redactFormat(), winston.format.timestamp(), winston.format.json()),
  level: process.env.LOG_LEVEL ?? 'info',
  transports: [new winston.transports.Console()],
});

export const httpLogger = morgan(
  (tokens, request, response) =>
    JSON.stringify({
      durationMs: Number(tokens['response-time']?.(request, response)),
      method: tokens.method?.(request, response),
      path: tokens.url?.(request, response)?.split('?')[0],
      requestId: response.getHeader('x-request-id'),
      status: Number(tokens.status?.(request, response)),
    }),
  { stream: { write: (message) => logger.http(message.trim()) } },
);
