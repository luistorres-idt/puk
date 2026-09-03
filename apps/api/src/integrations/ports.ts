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

export interface SheetsPort {
  findEquipment(identity: {
    externalId: string;
    imei: string;
  }): Promise<ExternalEquipmentRecord | null>;
  listClients(): Promise<readonly ExternalClientRecord[]>;
  listEquipment(): Promise<readonly ExternalEquipmentRecord[]>;
  updateAssignment(input: {
    row: number;
    values: Readonly<Partial<Record<'J' | 'L' | 'M' | 'N' | 'O' | 'P', string>>>;
  }): Promise<void>;
}

export interface ObjectStoragePort {
  createDownloadUrl(key: string, expiresInSeconds: number): Promise<string>;
  createUploadUrl(key: string, mimeType: string, expiresInSeconds: number): Promise<string>;
  getObject(key: string): Promise<Uint8Array | null>;
  headObject(key: string): Promise<{ bytes: number; mimeType: string } | null>;
  putObject(key: string, body: Uint8Array, mimeType: string): Promise<void>;
  removeObject(key: string): Promise<void>;
}
