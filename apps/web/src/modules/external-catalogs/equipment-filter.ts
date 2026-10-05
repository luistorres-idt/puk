import type { AssignEquipment, ExternalEquipment, OrderServiceType } from '@puk/contracts';
import { normalizeString, isMatchingClient } from '@puk/contracts';

export { normalizeString, isMatchingClient };

/**
 * Checks whether an equipment is considered installed based on its service status.
 */
export function isInstalledEquipment(equipment: ExternalEquipment): boolean {
  const status = normalizeString(equipment.serviceStatus);
  return status === 'instalado' || status === 'instalada';
}

export interface EquipmentFilterOptions {
  serviceType?: OrderServiceType | string | null | undefined;
  clientName?: string | null | undefined;
  excludeKeys?: readonly string[] | Set<string> | null | undefined;
}

/**
 * Filters equipment according to the order's service type and client:
 * - Exclude any equipment whose externalKey is in options.excludeKeys.
 * - INSTALLATION: Only available / in-stock equipment (not installed, not assigned to another client).
 * - REVIEW / UNINSTALLATION: Only installed equipment that belongs to the order's client.
 * - Other/Undefined: All equipment.
 */
export function filterEquipmentByServiceType(
  equipmentList: readonly ExternalEquipment[],
  options: EquipmentFilterOptions = {},
): ExternalEquipment[] {
  const { serviceType, clientName, excludeKeys } = options;

  let filtered = equipmentList;

  if (excludeKeys) {
    const excludeSet = excludeKeys instanceof Set ? excludeKeys : new Set(excludeKeys);
    if (excludeSet.size > 0) {
      filtered = filtered.filter((eq) => !excludeSet.has(eq.externalKey));
    }
  }

  if (!serviceType) {
    return [...filtered];
  }

  const normalizedServiceType = normalizeString(serviceType);

  if (normalizedServiceType === 'installation' || normalizedServiceType === 'fuel_sensor') {
    return filtered.filter((eq) => {
      // Must not be currently installed
      if (isInstalledEquipment(eq)) {
        return false;
      }

      // If already assigned to a different client in Sheets, exclude to prevent conflict
      if (eq.currentClient && clientName) {
        if (!isMatchingClient(eq.currentClient, clientName)) {
          return false;
        }
      }

      return true;
    });
  }

  if (normalizedServiceType === 'review' || normalizedServiceType === 'uninstallation') {
    return filtered.filter((eq) => {
      // Must be installed
      if (!isInstalledEquipment(eq)) {
        return false;
      }

      // Must match the specified client if provided
      if (clientName && !isMatchingClient(eq.currentClient, clientName)) {
        return false;
      }

      return true;
    });
  }

  return [...filtered];
}

/**
 * Extracts and maps unit fields from an ExternalEquipment record (from Google Sheets).
 * Provides sensible fallbacks for empty or missing values.
 */
export function extractUnitFromEquipment(equipment: ExternalEquipment): {
  label: string;
  makeModel: string;
  serialNumber: string;
  year: number | null;
} {
  const parsedYear = equipment.unitYear ? parseInt(equipment.unitYear, 10) : null;
  const validYear =
    parsedYear !== null && !isNaN(parsedYear) && parsedYear >= 1900 && parsedYear <= 2100
      ? parsedYear
      : null;

  const fallbackIdentifier = equipment.id || equipment.imei || equipment.externalKey;

  return {
    label: equipment.unit?.trim() || `Unidad ${fallbackIdentifier}`,
    makeModel: equipment.unitMakeModel?.trim() || 'No especificada',
    serialNumber: equipment.unitSerialNumber?.trim() || `SN-${fallbackIdentifier}`,
    year: validYear,
  };
}

export function toEquipmentAssignment(equipment: ExternalEquipment): AssignEquipment {
  return {
    externalKey: equipment.externalKey,
    externalId: equipment.id,
    imei: equipment.imei,
    sheetName: 'SALIDAS',
    sheetRowHint: equipment.rowNumber,
    brandSnapshot: equipment.brand,
    modelSnapshot: equipment.model,
    lineSnapshot: equipment.line,
    iccidSnapshot: equipment.iccid,
    carrierSnapshot: equipment.carrier,
    equipmentConditionSnapshot: equipment.condition,
    serviceStatusSnapshot: equipment.serviceStatus,
    rawSnapshot: equipment.rawValues,
  };
}
