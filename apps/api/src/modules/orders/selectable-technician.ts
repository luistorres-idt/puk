import type { PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../shared/errors.js';

export async function assertSelectableTechnician(prisma: PrismaClient, technicianId: string) {
  if (!technicianId) {
    throw new AppError(400, 'MISSING_TECHNICIAN', 'Selecciona un técnico para la orden');
  }
  const technician = await prisma.technician.findUnique({
    where: { id: technicianId },
    select: { id: true, name: true, externalKey: true, active: true },
  });
  if (!technician) {
    throw new AppError(404, 'TECHNICIAN_NOT_FOUND', 'El técnico seleccionado no existe');
  }
  if (!technician.active) {
    throw new AppError(
      400,
      'TECHNICIAN_INACTIVE',
      'El técnico seleccionado está inactivo. Recarga el directorio y elige otro técnico.',
    );
  }
  return technician;
}
