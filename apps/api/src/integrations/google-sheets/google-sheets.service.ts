import type { ExternalClient, ExternalEquipment } from '@puk/contracts';
import type { SheetsPort } from '../ports.js';
import { parseEquipmentRow } from './equipment-identity.js';

export interface CatalogCacheEntry<T> {
  data: readonly T[];
  fetchedAt: string;
  expiresAt: number;
}

export class GoogleSheetsCatalogService {
  private readonly sheetsPort: SheetsPort;
  private readonly ttlMs: number;
  private clientsCache: CatalogCacheEntry<ExternalClient> | null = null;
  private equipmentCache: CatalogCacheEntry<ExternalEquipment> | null = null;

  public constructor(sheetsPort: SheetsPort, ttlSeconds: number = 60) {
    this.sheetsPort = sheetsPort;
    this.ttlMs = ttlSeconds * 1000;
  }

  public invalidateCache(): void {
    this.clientsCache = null;
    this.equipmentCache = null;
  }

  public async getClients(options: {
    forceFresh?: boolean;
    search?: string;
  } = {}): Promise<{ data: readonly ExternalClient[]; fetchedAt: string }> {
    const now = Date.now();
    let entry = this.clientsCache;

    if (options.forceFresh || !entry || entry.expiresAt <= now) {
      const records = await this.sheetsPort.listClients();
      const mapped: ExternalClient[] = records.map((r) => ({
        id: r.externalId,
        name: r.name,
      }));
      entry = {
        data: mapped,
        fetchedAt: new Date(now).toISOString(),
        expiresAt: now + this.ttlMs,
      };
      this.clientsCache = entry;
    }

    let result = entry.data;
    if (options.search) {
      const term = options.search.trim().toLowerCase();
      result = result.filter(
        (c) => c.name.toLowerCase().includes(term) || c.id.toLowerCase().includes(term),
      );
    }

    return { data: result, fetchedAt: entry.fetchedAt };
  }

  public async getEquipment(options: {
    forceFresh?: boolean;
    search?: string;
  } = {}): Promise<{ data: readonly ExternalEquipment[]; fetchedAt: string }> {
    const now = Date.now();
    let entry = this.equipmentCache;

    if (options.forceFresh || !entry || entry.expiresAt <= now) {
      const records = await this.sheetsPort.listEquipment();
      const mapped: ExternalEquipment[] = records.map((record) => {
        const rowValues: string[] = [];
        const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P'];
        for (let i = 0; i < cols.length; i++) {
          rowValues.push(record.values[cols[i]!] ?? '');
        }
        return parseEquipmentRow(rowValues, record.row);
      });

      entry = {
        data: mapped,
        fetchedAt: new Date(now).toISOString(),
        expiresAt: now + this.ttlMs,
      };
      this.equipmentCache = entry;
    }

    let result = entry.data;
    if (options.search) {
      const term = options.search.trim().toLowerCase();
      result = result.filter(
        (eq) =>
          eq.externalKey.toLowerCase().includes(term) ||
          (eq.id && eq.id.toLowerCase().includes(term)) ||
          (eq.imei && eq.imei.toLowerCase().includes(term)) ||
          (eq.brand && eq.brand.toLowerCase().includes(term)) ||
          (eq.model && eq.model.toLowerCase().includes(term)) ||
          (eq.line && eq.line.toLowerCase().includes(term)) ||
          (eq.currentClient && eq.currentClient.toLowerCase().includes(term)),
      );
    }

    return { data: result, fetchedAt: entry.fetchedAt };
  }

  public async findEquipmentByKey(
    externalKey: string,
    options: { forceFresh?: boolean } = {},
  ): Promise<{ equipment: ExternalEquipment | null; fetchedAt: string }> {
    const { data, fetchedAt } = await this.getEquipment(options);
    const found = data.find((eq) => eq.externalKey === externalKey) ?? null;
    return { equipment: found, fetchedAt };
  }

  public async updateEquipmentAssignment(input: {
    row: number;
    values: Readonly<Partial<Record<'J' | 'L' | 'M' | 'N' | 'O' | 'P', string>>>;
  }): Promise<void> {
    await this.sheetsPort.updateAssignment(input);
    // Invalidate equipment cache on write so subsequent reads see latest state
    this.equipmentCache = null;
  }
}
