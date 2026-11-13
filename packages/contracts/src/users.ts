import * as v from 'valibot';

import { UserRoleSchema } from './auth.js';

const optionalText = v.optional(v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(500))));
const optionalNotes = v.optional(v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(2000))));
const optionalEmail = v.optional(
  v.nullable(
    v.union([
      v.pipe(
        v.string(),
        v.trim(),
        v.literal(''),
        v.transform(() => null),
      ),
      v.pipe(
        v.string(),
        v.trim(),
        v.email(),
        v.maxLength(320),
        v.transform((value) => value.toLowerCase()),
      ),
    ]),
  ),
);
const optionalRate = v.optional(
  v.nullable(v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(1_000_000))),
);

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

export const AdminUserListItemSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  name: v.string(),
  email: v.pipe(v.string(), v.email()),
  role: UserRoleSchema,
  active: v.boolean(),
  technicianId: v.nullable(v.pipe(v.string(), v.uuid())),
});

export const CreateTechnicianSchema = v.object({
  address: optionalText,
  city: optionalText,
  departureCost: optionalRate,
  email: optionalEmail,
  failedAppointmentRate: optionalRate,
  fuelSensorRate: optionalRate,
  installationRate: optionalRate,
  invoice: optionalText,
  legalName: optionalText,
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  notes: optionalNotes,
  phone: optionalText,
  replacementRate: optionalRate,
  reviewRate: optionalRate,
  state: optionalText,
  taxAddress: optionalText,
  taxData: optionalText,
  uninstallationRate: optionalRate,
  workshop: optionalText,
});

export const UpdateTechnicianSchema = v.partial(
  v.object({ active: v.boolean(), ...CreateTechnicianSchema.entries }),
);

export type CreateTechnician = v.InferOutput<typeof CreateTechnicianSchema>;
export type UpdateTechnician = v.InferOutput<typeof UpdateTechnicianSchema>;

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
export type AdminUserListItem = v.InferOutput<typeof AdminUserListItemSchema>;
