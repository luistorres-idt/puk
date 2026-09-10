export const ID_COLUMN = 22;
export const ID_HEADER = 'ID_TECNICO';

export class MaintenanceError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/** One-time initialization. Later additions need a durable ID allocator. */
export function planTechnicianIds(rows) {
  if (rows[0]?.[0] !== 'TECNICO' || rows[0]?.[ID_COLUMN] !== ID_HEADER) {
    throw new MaintenanceError('DIRECTORY_HEADERS_CHANGED');
  }

  const identifiers = new Set();
  const pendingRows = [];
  let technicians = 0;
  for (let index = 1; index < rows.length; index++) {
    const row = rows[index];
    if (row.every((value) => value === '' || value === null || value === undefined)) continue;
    const name = row[0];
    if (typeof name !== 'string' || !name.trim() || name.startsWith('=')) {
      throw new MaintenanceError('TECHNICIAN_ROW_REQUIRES_REVIEW');
    }
    technicians++;
    const id = row[ID_COLUMN];
    if (id === undefined || id === null || id === '') {
      pendingRows.push(index + 1);
      continue;
    }
    if (typeof id !== 'string' || !/^TEC-\d{4,}$/.test(id)) {
      throw new MaintenanceError('EXISTING_ID_REQUIRES_REVIEW');
    }
    if (identifiers.has(id)) throw new MaintenanceError('DUPLICATE_TECHNICIAN_ID');
    identifiers.add(id);
  }

  // Do not reuse a retired ID by deriving a new sequence from surviving rows.
  // A complete rerun is a no-op; mixed old/new rows need the future allocator.
  if (identifiers.size > 0 && pendingRows.length > 0) {
    throw new MaintenanceError('PARTIAL_INITIALIZATION_REQUIRES_REVIEW');
  }
  return {
    technicians,
    existingIds: identifiers.size,
    changes: pendingRows.map((rowNumber, index) => ({
      rowNumber,
      id: `TEC-${String(index + 1).padStart(4, '0')}`,
    })),
  };
}

export function applyPlanToSnapshot(rows, changes) {
  const expected = rows.map((row) => [...row]);
  for (const { rowNumber, id } of changes) {
    const row = expected[rowNumber - 1];
    while (row.length <= ID_COLUMN) row.push('');
    if (row[ID_COLUMN] !== '') throw new MaintenanceError('TARGET_CELL_NOT_EMPTY');
    row[ID_COLUMN] = id;
  }
  return expected;
}
