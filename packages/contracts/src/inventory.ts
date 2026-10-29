import * as v from 'valibot';
import { OrderServiceTypeSchema, type OrderServiceType } from './orders.js';

const RequiredText = v.pipe(v.string(), v.trim(), v.nonEmpty());

/**
 * Determines the initial lifecycle state for newly registered equipment based on the
 * service context. Review, uninstallation, and outgoing replacement units must already
 * be installed on a client unit, whereas installations and incoming replacements start available.
 */
export function initialEquipmentState(
  serviceType: OrderServiceType,
  replacementRole?: 'OLD' | 'NEW',
): 'AVAILABLE' | 'INSTALLED' {
  return serviceType === 'REVIEW' ||
    serviceType === 'UNINSTALLATION' ||
    (serviceType === 'EQUIPMENT_REPLACEMENT' && replacementRole === 'OLD')
    ? 'INSTALLED'
    : 'AVAILABLE';
}

export const RegisterEquipmentSchema = v.pipe(
  v.object({
    registrationKey: v.pipe(v.string(), v.uuid()),
    brand: RequiredText,
    model: RequiredText,
    imei: v.pipe(
      v.string(),
      v.trim(),
      v.regex(/^\d{15}$/, 'El IMEI debe contener exactamente 15 dígitos.'),
    ),
    serviceType: OrderServiceTypeSchema,
    replacementRole: v.optional(v.picklist(['OLD', 'NEW'])),
    clientSheetId: RequiredText,
    clientName: RequiredText,
    unit: v.optional(
      v.object({
        label: RequiredText,
        makeModel: RequiredText,
        serialNumber: RequiredText,
        year: v.optional(
          v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1900), v.maxValue(2100))),
        ),
      }),
    ),
  }),
  v.check(
    (input) => input.serviceType !== 'FAILED_APPOINTMENT',
    'No se puede registrar equipo para una cita fallida.',
  ),
  v.check(
    (input) => input.serviceType !== 'EQUIPMENT_REPLACEMENT' || input.replacementRole !== undefined,
    'Selecciona el rol del equipo de reemplazo.',
  ),
  v.check(
    (input) =>
      initialEquipmentState(input.serviceType, input.replacementRole) !== 'INSTALLED' ||
      input.unit !== undefined,
    'El equipo instalado requiere etiqueta, marca/modelo y número de serie de su unidad.',
  ),
);
export type RegisterEquipment = v.InferOutput<typeof RegisterEquipmentSchema>;

const EquipmentVersionSchema = v.pipe(v.number(), v.integer(), v.minValue(1));
const EquipmentDescriptionSchema = v.pipe(
  RequiredText,
  v.maxLength(200, 'Usa un máximo de 200 caracteres.'),
);

/**
 * Payload contract for updating mutable equipment metadata (`imei`, `brand`, `model`)
 * guarded by optimistic concurrency (`version`).
 */
export const UpdateInventoryEquipmentSchema = v.strictObject({
  imei: v.pipe(
    v.string(),
    v.trim(),
    v.regex(/^\d{15}$/, 'El IMEI debe contener exactamente 15 dígitos.'),
  ),
  brand: EquipmentDescriptionSchema,
  model: EquipmentDescriptionSchema,
  version: EquipmentVersionSchema,
});
export type UpdateInventoryEquipment = v.InferOutput<typeof UpdateInventoryEquipmentSchema>;

/**
 * Payload contract for archiving an available equipment record at a known optimistic `version`.
 */
export const DeleteInventoryEquipmentSchema = v.strictObject({ version: EquipmentVersionSchema });
export type DeleteInventoryEquipment = v.InferOutput<typeof DeleteInventoryEquipmentSchema>;

/**
 * Administrative projection of a database-managed equipment record, including
 * its optimistic concurrency `version` and whether it can currently be archived (`canDelete`).
 */
export interface InventoryEquipment {
  id: string;
  imei: string;
  brand: string;
  model: string;
  state: 'AVAILABLE' | 'INSTALLED';
  currentClientSheetId: string | null;
  currentClientName: string | null;
  unitLabel: string | null;
  unitMakeModel: string | null;
  unitSerialNumber: string | null;
  unitYear: number | null;
  reservedOrderId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  canDelete: boolean;
}
