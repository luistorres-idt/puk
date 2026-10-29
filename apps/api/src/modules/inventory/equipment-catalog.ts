import {
  isMatchingClient,
  normalizeString,
  type ExternalClient,
  type ExternalEquipment,
} from '@puk/contracts';
import type { Equipment } from '../../generated/prisma/client.js';
import type { CatalogServicePort } from '../../integrations/ports.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

/**
 * Builds the canonical external key prefix (`DB:<id>`) for database-backed equipment.
 */
export function inventoryKey(id: string): string {
  return `DB:${id}`;
}

/**
 * Projects a database `Equipment` entity into the unified `ExternalEquipment` catalog
 * shape consumed by order creation and assignment workflows.
 */
export function toCatalogEquipment(equipment: Equipment): ExternalEquipment {
  return {
    source: 'DB',
    inventoryEquipmentId: equipment.id,
    externalKey: inventoryKey(equipment.id),
    id: equipment.id,
    imei: equipment.imei,
    brand: equipment.brand,
    model: equipment.model,
    line: null,
    iccid: null,
    carrier: null,
    condition: null,
    currentClientSheetId: equipment.currentClientSheetId,
    currentClient: equipment.currentClientName,
    serviceStatus: equipment.state === 'INSTALLED' ? 'INSTALADO' : 'DISPONIBLE',
    unit: equipment.unitLabel,
    unitMakeModel: equipment.unitMakeModel,
    unitSerialNumber: equipment.unitSerialNumber,
    unitYear: equipment.unitYear === null ? null : String(equipment.unitYear),
    serviceType: null,
    rowNumber: 0,
    hasValidIdentity: true,
    rawValues: {},
    reservedOrderId: equipment.reservedOrderId,
  };
}

/**
 * Checks whether two catalog entries (typically one from PostgreSQL and one from Google Sheets)
 * describe the same physical installation state, client ownership, and unit serial number.
 */
function samePhysicalContext(a: ExternalEquipment, b: ExternalEquipment): boolean {
  const installed = (e: ExternalEquipment) =>
    ['instalado', 'instalada'].includes(normalizeString(e.serviceStatus));
  const sameClient =
    a.currentClientSheetId && b.currentClientSheetId
      ? a.currentClientSheetId === b.currentClientSheetId
      : (!a.currentClient && !b.currentClient) ||
        isMatchingClient(a.currentClient, b.currentClient);
  return (
    installed(a) === installed(b) &&
    sameClient &&
    (!a.unitSerialNumber ||
      !b.unitSerialNumber ||
      normalizeString(a.unitSerialNumber) === normalizeString(b.unitSerialNumber))
  );
}

/**
 * Merges database-backed and Google Sheets equipment lists by IMEI.
 * If a single DB record and a single Sheets row share the same IMEI and physical context,
 * the canonical DB record is selected; otherwise duplicate IMEIs are flagged as conflicts.
 */
export function combineEquipment(
  db: readonly ExternalEquipment[],
  sheets: readonly ExternalEquipment[],
) {
  const groups = new Map<string, ExternalEquipment[]>();
  const withoutImei: ExternalEquipment[] = [];
  for (const equipment of [...db, ...sheets]) {
    const imei = equipment.imei?.trim();
    if (!imei) {
      withoutImei.push(equipment);
      continue;
    }
    const group = groups.get(imei) ?? [];
    group.push(equipment);
    groups.set(imei, group);
  }
  const data = [...withoutImei];
  let conflicts = false;
  for (const group of groups.values()) {
    const local = group.find((e) => e.source === 'DB');
    // Matching cross-source copies share a canonical DB choice; no records are merged or rewritten.
    if (local && group.length === 2 && group.every((e) => samePhysicalContext(local, e))) {
      data.push(local);
      continue;
    }
    if (group.length > 1) {
      conflicts = true;
      data.push(...group.map((e) => ({ ...e, identityConflict: true, hasValidIdentity: false })));
    } else {
      data.push(...group);
    }
  }
  return { data, conflicts };
}

/**
 * Unified catalog adapter that combines PostgreSQL records with legacy Google Sheets rows,
 * degrading gracefully to local database records when Google Sheets is unreachable.
 */
export class HybridEquipmentCatalog implements CatalogServicePort {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly sheets: CatalogServicePort,
  ) {}

  /**
   * Returns the merged client directory (PostgreSQL overrides + Google Sheets fallback)
   * filtered by optional search term and sorted alphabetically.
   */
  public async getClients(options: { forceFresh?: boolean; search?: string } = {}) {
    const stored = await this.prisma.client.findMany({
      select: { clientSheetId: true, name: true },
      orderBy: { name: 'asc' },
    });
    let legacy: readonly ExternalClient[] = [];
    let sheetsAvailable = true;
    try {
      legacy = (
        await this.sheets.getClients(
          options.forceFresh === undefined ? {} : { forceFresh: options.forceFresh },
        )
      ).data;
    } catch {
      sheetsAvailable = false;
    }
    const clients = new Map(legacy.map((client) => [client.id, client]));
    for (const client of stored) {
      clients.set(client.clientSheetId, { id: client.clientSheetId, name: client.name });
    }
    const term = options.search?.trim().toLowerCase();
    const data = [...clients.values()]
      .filter(
        (client) =>
          !term || [client.id, client.name].some((value) => value.toLowerCase().includes(term)),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
    return { data, fetchedAt: new Date().toISOString(), sheetsAvailable };
  }
  public invalidateCache() {
    this.sheets.invalidateCache();
  }
  /**
   * Returns the combined equipment catalog from active DB records (`deletedAt: null`) and
   * Google Sheets, attaching availability warnings and disabling new registrations if Sheets fails.
   */
  public async getEquipment(options: { forceFresh?: boolean; search?: string } = {}) {
    const db = (
      await this.prisma.equipment.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
      })
    ).map(toCatalogEquipment);
    let sheets: readonly ExternalEquipment[] = [];
    let sheetsAvailable = true;
    let fetchedAt = new Date().toISOString();
    try {
      const result = await this.sheets.getEquipment(
        options.forceFresh === undefined ? {} : { forceFresh: options.forceFresh },
      );
      sheets = result.data.map((e) => ({ ...e, source: 'SHEETS' as const }));
      fetchedAt = result.fetchedAt;
    } catch {
      sheetsAvailable = false;
    }
    const combined = combineEquipment(db, sheets);
    const term = options.search?.trim().toLowerCase();
    const data = term
      ? combined.data.filter((e) =>
          [e.externalKey, e.imei, e.brand, e.model, e.currentClient].some((s) =>
            s?.toLowerCase().includes(term),
          ),
        )
      : combined.data;
    const warnings: string[] = [];
    if (!sheetsAvailable)
      warnings.push(
        'Google Sheets no está disponible. Puedes seleccionar equipos de la BD, pero no registrar equipos nuevos.',
      );
    if (combined.conflicts)
      warnings.push(
        'Hay equipos con IMEI duplicado y datos ambiguos o contradictorios. No se pueden seleccionar hasta aclarar los registros.',
      );
    return { data, fetchedAt, sheetsAvailable, registrationAllowed: sheetsAvailable, warnings };
  }
  /**
   * Looks up a single equipment record by its `externalKey` (`DB:<uuid>` or Sheets row key).
   */
  public async findEquipmentByKey(externalKey: string, options: { forceFresh?: boolean } = {}) {
    const result = await this.getEquipment(options);
    return {
      equipment: result.data.find((e) => e.externalKey === externalKey) ?? null,
      fetchedAt: result.fetchedAt,
    };
  }
}
