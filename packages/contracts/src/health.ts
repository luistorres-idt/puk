import * as v from 'valibot';

export const HealthResponseSchema = v.object({
  data: v.object({
    service: v.literal('api'),
    status: v.picklist(['ok', 'degraded']),
  }),
  meta: v.object({ requestId: v.string() }),
});

export type HealthResponse = v.InferOutput<typeof HealthResponseSchema>;
