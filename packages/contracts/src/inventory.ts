import * as v from 'valibot';
import { OrderServiceTypeSchema, type OrderServiceType } from './orders.js';

const RequiredText = v.pipe(v.string(), v.trim(), v.nonEmpty());
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
