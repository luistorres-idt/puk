import { AppError } from '../../shared/errors.js';

export const DIRECTORY_COLUMN_COUNT = 23;
export const ID_COLUMN_INDEX = 22; // Column W
export const ID_COLUMN_HEADER = 'ID_TECNICO';

export interface ParsedRate {
  readonly isValid: boolean;
  readonly value: string | null; // formatted to 2 decimals or null
}

export interface ParsedTechnicianRecord {
  readonly externalKey: string;
  readonly name: string;
  readonly workshop: string | null;
  readonly legalName: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly address: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly invoice: string | null;
  readonly taxData: string | null;
  readonly taxAddress: string | null;
  readonly departureCost: ParsedRate;
  readonly replacementRate: ParsedRate;
  readonly installationRate: ParsedRate;
  readonly reviewRate: ParsedRate;
  readonly uninstallationRate: ParsedRate;
  readonly failedAppointmentRate: ParsedRate;
  readonly fuelSensorRate: ParsedRate;
  readonly notes: string | null;
  readonly row: number;
}

export interface InvalidRowReport {
  readonly row: number;
  readonly reason: string;
  readonly externalKey?: string | undefined;
  readonly name?: string | undefined;
}

export interface DirectoryParseResult {
  readonly technicians: readonly ParsedTechnicianRecord[];
  readonly invalidRows: readonly InvalidRowReport[];
  readonly maxExternalId: number;
}

const EXPECTED_HEADERS: Readonly<Record<number, string>> = {
  0: 'TECNICO',
  1: 'TALLER',
  2: 'RAZON SOCIAL',
  3: 'TELEFONO',
  4: 'CORREO',
  5: 'DIRECCIÓN',
  6: 'CIUDAD',
  7: 'ESTADO',
  8: 'FACTURA',
  9: 'DATOS FISCALES',
  10: 'DIRECCION FISCAL',
  11: 'COSTO SALIDA DEL TALLER',
  12: 'CAMBIO DE EQUIPO',
  13: 'INSTALACION',
  14: 'REVISION',
  15: 'DESINSTALACION',
  16: 'CITA FALLIDA',
  17: 'SENSOR FUEL',
  18: 'NOTAS ADICIONALES',
  22: 'ID_TECNICO',
};

export function validateDirectoryHeaders(headerRow?: readonly string[]): void {
  if (!headerRow || headerRow.length === 0) {
    throw new AppError(
      400,
      'DIRECTORY_HEADERS_MISSING',
      'El directorio técnico no contiene fila de encabezados',
    );
  }

  const mismatches: string[] = [];
  for (const [colIndexStr, expectedHeader] of Object.entries(EXPECTED_HEADERS)) {
    const colIndex = Number(colIndexStr);
    const actual = (headerRow[colIndex] ?? '').toString().trim().toUpperCase();
    if (actual !== expectedHeader.toUpperCase()) {
      mismatches.push(`Columna ${colIndex} (${expectedHeader}): encontrada "${actual}"`);
    }
  }

  if (mismatches.length > 0) {
    throw new AppError(
      400,
      'DIRECTORY_HEADERS_INVALID',
      `Los encabezados del directorio técnico no coinciden con el contrato: ${mismatches.join(', ')}`,
      { mismatches },
    );
  }
}

export function parseMoneyRate(raw?: string | null): ParsedRate {
  if (raw === undefined || raw === null) {
    return { isValid: true, value: null };
  }

  const str = raw.toString().trim();
  if (str === '') {
    return { isValid: true, value: null };
  }

  // Remove currency symbol, spaces, and thousand separator commas
  const cleaned = str.replace(/^\$/, '').replaceAll(',', '').trim();

  // If after cleaning it's empty
  if (cleaned === '') {
    return { isValid: true, value: null };
  }

  // Validate number format (allowing decimals, but not negative)
  if (!/^\d+(\.\d+)?$/.test(cleaned)) {
    return { isValid: false, value: null };
  }

  const num = Number(cleaned);
  if (!Number.isFinite(num) || num < 0) {
    return { isValid: false, value: null };
  }

  return {
    isValid: true,
    value: num.toFixed(2),
  };
}

export function parseTechnicianDirectoryRows(
  rows: readonly (readonly string[])[],
): DirectoryParseResult {
  if (!rows || rows.length === 0) {
    throw new AppError(400, 'DIRECTORY_EMPTY', 'El directorio técnico está vacío');
  }

  validateDirectoryHeaders(rows[0]);

  const technicians: ParsedTechnicianRecord[] = [];
  const invalidRows: InvalidRowReport[] = [];
  const seenKeys = new Set<string>();
  let maxExternalId = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const rowNumber = i + 1;

    // Check if entire row is blank
    const isBlank = row.every(
      (cell) => cell === undefined || cell === null || cell.toString().trim() === '',
    );
    if (isBlank) {
      continue;
    }

    const name = (row[0] ?? '').toString().trim();
    const externalKey = (row[ID_COLUMN_INDEX] ?? '').toString().trim();

    if (!externalKey) {
      invalidRows.push({
        row: rowNumber,
        name: name || undefined,
        reason: 'Fila sin ID_TECNICO asignado',
      });
      continue;
    }

    const match = externalKey.match(/^TEC-(\d+)$/);
    if (!match) {
      invalidRows.push({
        row: rowNumber,
        externalKey,
        name: name || undefined,
        reason: 'Formato de ID_TECNICO inválido (se esperaba TEC-XXXX)',
      });
      continue;
    }

    const idNumber = Number(match[1]);
    if (idNumber > maxExternalId) {
      maxExternalId = idNumber;
    }

    if (seenKeys.has(externalKey)) {
      throw new AppError(
        409,
        'DUPLICATE_EXTERNAL_KEY',
        `Clave externa duplicada en el directorio técnico: ${externalKey} (fila ${rowNumber})`,
        { externalKey, row: rowNumber },
      );
    }
    seenKeys.add(externalKey);

    if (!name) {
      invalidRows.push({
        row: rowNumber,
        externalKey,
        reason: 'Fila con ID_TECNICO pero sin nombre de técnico',
      });
      continue;
    }

    const cleanStr = (val?: string | null): string | null => {
      if (val === undefined || val === null) return null;
      const t = val.toString().trim();
      return t === '' ? null : t;
    };

    technicians.push({
      row: rowNumber,
      externalKey,
      name,
      workshop: cleanStr(row[1]),
      legalName: cleanStr(row[2]),
      phone: cleanStr(row[3]),
      email: cleanStr(row[4]),
      address: cleanStr(row[5]),
      city: cleanStr(row[6]),
      state: cleanStr(row[7]),
      invoice: cleanStr(row[8]),
      taxData: cleanStr(row[9]),
      taxAddress: cleanStr(row[10]),
      departureCost: parseMoneyRate(row[11]),
      replacementRate: parseMoneyRate(row[12]),
      installationRate: parseMoneyRate(row[13]),
      reviewRate: parseMoneyRate(row[14]),
      uninstallationRate: parseMoneyRate(row[15]),
      failedAppointmentRate: parseMoneyRate(row[16]),
      fuelSensorRate: parseMoneyRate(row[17]),
      notes: cleanStr(row[18]),
    });
  }

  return {
    technicians,
    invalidRows,
    maxExternalId,
  };
}

export function allocateNextTechnicianId(existingIdsOrMax: readonly string[] | number): string {
  let maxId = 0;
  if (typeof existingIdsOrMax === 'number') {
    maxId = existingIdsOrMax;
  } else {
    for (const id of existingIdsOrMax) {
      const match = id.match(/^TEC-(\d+)$/);
      if (match) {
        const num = Number(match[1]);
        if (num > maxId) maxId = num;
      }
    }
  }

  const nextNumber = maxId + 1;
  return `TEC-${String(nextNumber).padStart(4, '0')}`;
}
