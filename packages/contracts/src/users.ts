import * as v from 'valibot';

import { UserRoleSchema } from './auth.js';

const optionalText = v.optional(v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(500))));

export const IdParamsSchema = v.object({ id: v.pipe(v.string(), v.uuid()) });

export const CreateUserSchema = v.object({
  email: v.pipe(
    v.string(),
    v.email(),
    v.transform((value) => value.trim().toLowerCase()),
  ),
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  password: v.pipe(v.string(), v.minLength(1), v.maxLength(1024)),
  role: UserRoleSchema,
  technicianId: v.optional(v.nullable(v.pipe(v.string(), v.uuid()))),
});

export const UpdateUserSchema = v.partial(
  v.object({ active: v.boolean(), ...CreateUserSchema.entries }),
);

export const CreateTechnicianSchema = v.object({
  address: optionalText,
  city: optionalText,
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  phone: optionalText,
  state: optionalText,
  workshop: optionalText,
});

export const UpdateTechnicianSchema = v.partial(
  v.object({ active: v.boolean(), ...CreateTechnicianSchema.entries }),
);

export const TechnicianOptionSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  name: v.string(),
  workshop: v.nullable(v.string()),
  city: v.nullable(v.string()),
  state: v.optional(v.nullable(v.string())),
  phone: v.optional(v.nullable(v.string())),
  externalKey: v.optional(v.nullable(v.string())),
});
export type TechnicianOption = v.InferOutput<typeof TechnicianOptionSchema>;
export type CreateUser = v.InferInput<typeof CreateUserSchema>;
export type UpdateUser = v.InferInput<typeof UpdateUserSchema>;
