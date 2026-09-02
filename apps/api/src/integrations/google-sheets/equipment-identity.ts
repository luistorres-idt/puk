import type { ExternalEquipment } from '@puk/contracts';

const INVALID_IDENTIFIERS = new Set([
  '',
  'pending',
  'pendiente',
  'n/a',
  'na',
  'none',
  'null',
  '-',
  '--',
]);

export function isValidIdentifier(value: string | null | undefined): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 && !INVALID_IDENTIFIERS.has(trimmed);
}

export function parseEquipmentRow(
  rowValues: readonly string[],
  rowNumber: number,
): ExternalEquipment {
  const getCol = (index: number): string | null => {
    const val = rowValues[index]?.trim();
    return val && val.length > 0 ? val : null;
  };

  const brand = getCol(1);
  const model = getCol(2);
  const rawId = getCol(3);
  const rawImei = getCol(4);
  const line = getCol(5);
  const iccid = getCol(6);
  const carrier = getCol(7);
  const condition = getCol(8);
  const currentClient = getCol(9);
  const serviceStatus = getCol(10);
  const unit = getCol(11);
  const unitMakeModel = getCol(12);
  const unitYear = getCol(13);
  const unitSerialNumber = getCol(14);
  const serviceType = getCol(15);

  const hasValidId = isValidIdentifier(rawId);
  const hasValidImei = isValidIdentifier(rawImei);

  let externalKey: string;
  let hasValidIdentity: boolean;

  if (hasValidId) {
    externalKey = rawId!;
    hasValidIdentity = true;
  } else if (hasValidImei) {
    externalKey = rawImei!;
    hasValidIdentity = true;
  } else {
    externalKey = `INCOMPLETE:row-${rowNumber}`;
    hasValidIdentity = false;
  }

  const rawValues: Record<string, string> = {
    A: rowValues[0] ?? '',
    B: rowValues[1] ?? '',
    C: rowValues[2] ?? '',
    D: rowValues[3] ?? '',
    E: rowValues[4] ?? '',
    F: rowValues[5] ?? '',
    G: rowValues[6] ?? '',
    H: rowValues[7] ?? '',
    I: rowValues[8] ?? '',
    J: rowValues[9] ?? '',
    K: rowValues[10] ?? '',
    L: rowValues[11] ?? '',
    M: rowValues[12] ?? '',
    N: rowValues[13] ?? '',
    O: rowValues[14] ?? '',
    P: rowValues[15] ?? '',
  };

  return {
    externalKey,
    id: hasValidId ? rawId! : null,
    imei: hasValidImei ? rawImei! : null,
    brand,
    model,
    line,
    iccid,
    carrier,
    condition,
    currentClient,
    serviceStatus,
    unit,
    unitMakeModel,
    unitYear,
    unitSerialNumber,
    serviceType,
    rowNumber,
    hasValidIdentity,
    rawValues,
  };
}
