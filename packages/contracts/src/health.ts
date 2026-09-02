import * as v from 'valibot';

export const HealthResponseSchema = v.object({
  service: v.literal('api'),
  status: v.literal('ok'),
});

export type HealthResponse = v.InferOutput<typeof HealthResponseSchema>;
