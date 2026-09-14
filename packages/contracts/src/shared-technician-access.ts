import * as v from 'valibot';

export const OrderAccessModeSchema = v.picklist(['INDIVIDUAL', 'SHARED']);

export const SharedTechnicianAccessConfigSchema = v.object({
  id: v.literal(1),
  userId: v.nullable(v.pipe(v.string(), v.uuid())),
  orderId: v.nullable(v.pipe(v.string(), v.uuid())),
  revision: v.pipe(v.number(), v.integer(), v.minValue(0)),
  updatedAt: v.string(),
});

export const UpdateSharedTechnicianAccessAccountSchema = v.object({
  expectedRevision: v.pipe(v.number(), v.integer(), v.minValue(0)),
  userId: v.nullable(v.pipe(v.string(), v.uuid())),
});

export const UpdateSharedTechnicianAccessOrderSchema = v.object({
  expectedRevision: v.pipe(v.number(), v.integer(), v.minValue(0)),
  orderId: v.nullable(v.pipe(v.string(), v.uuid())),
});

export const MeOrderAccessResponseSchema = v.object({
  mode: OrderAccessModeSchema,
  sharedAccess: v.nullable(
    v.object({
      userId: v.pipe(v.string(), v.uuid()),
      orderId: v.nullable(v.pipe(v.string(), v.uuid())),
      revision: v.pipe(v.number(), v.integer(), v.minValue(0)),
    }),
  ),
});

export type OrderAccessMode = v.InferOutput<typeof OrderAccessModeSchema>;
export type SharedTechnicianAccessConfig = v.InferOutput<typeof SharedTechnicianAccessConfigSchema>;
export type UpdateSharedTechnicianAccessAccount = v.InferOutput<
  typeof UpdateSharedTechnicianAccessAccountSchema
>;
export type UpdateSharedTechnicianAccessOrder = v.InferOutput<
  typeof UpdateSharedTechnicianAccessOrderSchema
>;
export type MeOrderAccessResponse = v.InferOutput<typeof MeOrderAccessResponseSchema>;
