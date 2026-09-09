import type { OrderServiceType } from '../../generated/prisma/client.js';
import type { EquipmentAssignmentValues } from '../../integrations/ports.js';

export interface EquipmentSheetAssignmentInput {
  clientName: string;
  equipmentServiceStatus?: string | null;
  serviceType: OrderServiceType;
  unit: {
    label: string;
    makeModel: string;
    serialNumber: string;
    year?: number | null;
  };
}

function installedAssignment(input: EquipmentSheetAssignmentInput): EquipmentAssignmentValues {
  return {
    J: input.clientName,
    K: 'INSTALADO',
    L: input.unit.label,
    M: input.unit.makeModel,
    N: input.unit.year ? String(input.unit.year) : '',
    O: input.unit.serialNumber,
  };
}

function stockAssignment(): EquipmentAssignmentValues {
  return {
    K: 'STOCK TECNICO',
    L: '',
    M: '',
    N: '',
    O: '',
  };
}

/**
 * Produces the final SALIDAS values for one piece of equipment.
 *
 * The same mapping is used when the order is assigned and when it is completed,
 * so a completion always repairs a missing or stale initial synchronization.
 */
export function buildEquipmentSheetAssignment(
  input: EquipmentSheetAssignmentInput,
): EquipmentAssignmentValues | null {
  switch (input.serviceType) {
    case 'INSTALLATION':
    case 'FUEL_SENSOR':
    case 'REVIEW':
      return installedAssignment(input);

    case 'UNINSTALLATION':
      return stockAssignment();

    case 'EQUIPMENT_REPLACEMENT':
      return input.equipmentServiceStatus?.trim().toUpperCase() === 'INSTALADO'
        ? stockAssignment()
        : installedAssignment(input);

    case 'FAILED_APPOINTMENT':
      return null;
  }
}
