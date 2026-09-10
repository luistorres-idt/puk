import type { ExternalClient, ExternalEquipment } from '@puk/contracts';

export interface ExternalClientRecord {
  externalId: string;
  name: string;
}

export interface ExternalEquipmentRecord {
  externalId: string;
  imei: string;
  row: number;
  values: Readonly<Record<string, string>>;
}

export interface TechnicalReportRowInput {
  folio: string;
  sem: string;
  tecnico: string;
  economico: string;
  serie: string;
  imeiId: string;
  cliente: string;
  fecha: string;
  servicio: string;
  costo: string;
  viaticos: string;
  total: string;
  notas: string;
}

export type EquipmentAssignmentValues = Partial<
  Record<'J' | 'K' | 'L' | 'M' | 'N' | 'O' | 'P', string>
>;

export interface SheetsPort {
  findEquipment(identity: {
    externalId: string;
    imei: string;
  }): Promise<ExternalEquipmentRecord | null>;
  listClients(): Promise<readonly ExternalClientRecord[]>;
  listEquipment(): Promise<readonly ExternalEquipmentRecord[]>;
  updateAssignment(input: {
    row: number;
    values: Readonly<EquipmentAssignmentValues>;
  }): Promise<void>;
  listTechniciansDirectory(): Promise<readonly (readonly string[])[]>;
  syncTechnicalReportRow(
    input: TechnicalReportRowInput,
  ): Promise<{ row: number; created: boolean }>;
}

export interface ObjectStoragePort {
  createDownloadUrl(key: string, expiresInSeconds: number): Promise<string>;
  createUploadUrl(key: string, mimeType: string, expiresInSeconds: number): Promise<string>;
  getObject(key: string): Promise<Uint8Array | null>;
  headObject(key: string): Promise<{ bytes: number; mimeType: string } | null>;
  putObject(key: string, body: Uint8Array, mimeType: string): Promise<void>;
  removeObject(key: string): Promise<void>;
}

export interface EquipmentCatalogPort {
  getEquipment(options?: {
    forceFresh?: boolean;
    search?: string;
  }): Promise<{ data: readonly ExternalEquipment[]; fetchedAt: string }>;
}

export interface ClientCatalogPort {
  getClients(options?: {
    forceFresh?: boolean;
    search?: string;
  }): Promise<{ data: readonly ExternalClient[]; fetchedAt: string }>;
}

export interface CatalogServicePort extends EquipmentCatalogPort, ClientCatalogPort {
  findEquipmentByKey(
    externalKey: string,
    options?: { forceFresh?: boolean },
  ): Promise<{ equipment: ExternalEquipment | null; fetchedAt: string }>;
  invalidateCache(): void;
}
