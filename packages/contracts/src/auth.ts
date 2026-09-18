import * as v from 'valibot';

export const UserRoleSchema = v.picklist(['ADMIN', 'TECHNICIAN']);
export const OrderAccessModeSchema = v.picklist(['INDIVIDUAL', 'SHARED']);

export const LoginRequestSchema = v.object({
  email: v.pipe(
    v.string(),
    v.email(),
    v.transform((value) => value.trim().toLowerCase()),
  ),
  password: v.pipe(v.string(), v.minLength(1), v.maxLength(1024)),
});

export const SessionUserSchema = v.object({
  active: v.boolean(),
  email: v.pipe(v.string(), v.email()),
  id: v.pipe(v.string(), v.uuid()),
  name: v.string(),
  orderAccessMode: OrderAccessModeSchema,
  role: UserRoleSchema,
  technicianId: v.nullable(v.pipe(v.string(), v.uuid())),
});

export type LoginRequest = v.InferOutput<typeof LoginRequestSchema>;
export type OrderAccessMode = v.InferOutput<typeof OrderAccessModeSchema>;
export type SessionUser = v.InferOutput<typeof SessionUserSchema>;
