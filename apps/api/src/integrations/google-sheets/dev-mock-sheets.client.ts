import type { ExternalClientRecord, ExternalEquipmentRecord, SheetsPort } from '../ports.js';

export class DevMockSheetsClient implements SheetsPort {
  private clients: ExternalClientRecord[] = [
    { externalId: 'CLI-001', name: 'Transportes Bull Dog S.A. de C.V.' },
    { externalId: 'CLI-002', name: 'Distribuidora Logistica del Bajio' },
    { externalId: 'CLI-003', name: 'Flotillas Azteca' },
  ];

  private equipment: ExternalEquipmentRecord[] = [
    {
      externalId: 'EQ-001',
      imei: '861234567890123',
      row: 2,
      values: {
        A: '2026-01-10',
        B: 'Teltonika',
        C: 'FMB920',
        D: 'EQ-001',
        E: '861234567890123',
        F: '5511223344',
        G: '895200000000001',
        H: 'Telcel',
        I: 'NUEVO',
        J: '',
        K: 'STOCK TECNICO',
        L: '',
        M: '',
        N: '',
        O: '',
        P: 'ESTANDAR',
      },
    },
    {
      externalId: 'EQ-002',
      imei: '869876543210987',
      row: 3,
      values: {
        A: '2026-01-12',
        B: 'Queclink',
        C: 'GV300',
        D: 'EQ-002',
        E: '869876543210987',
        F: '5522334455',
        G: '895200000000002',
        H: 'AT&T',
        I: 'NUEVO',
        J: '',
        K: 'STOCK TECNICO',
        L: '',
        M: '',
        N: '',
        O: '',
        P: 'ESTANDAR',
      },
    },
    {
      externalId: 'EQ-003',
      imei: '354455667788990',
      row: 4,
      values: {
        A: '2026-01-15',
        B: 'CalAmp',
        C: 'LMU-3030',
        D: 'EQ-003',
        E: '354455667788990',
        F: '5533445566',
        G: '895200000000003',
        H: 'Movistar',
        I: 'USADO',
        J: '',
        K: 'STOCK TECNICO',
        L: '',
        M: '',
        N: '',
        O: '',
        P: 'OBD/SCAN',
      },
    },
    {
      externalId: '',
      imei: '865555555555555',
      row: 5,
      values: {
        A: '2026-01-18',
        B: 'Queclink',
        C: 'GV55',
        D: 'PENDIENTE',
        E: '865555555555555',
        F: '5544556677',
        G: '895200000000004',
        H: 'Telcel',
        I: 'NUEVO',
        J: '',
        K: 'STOCK TECNICO',
        L: '',
        M: '',
        N: '',
        O: '',
        P: '',
      },
    },
    {
      externalId: '',
      imei: '',
      row: 6,
      values: {
        A: '2026-01-20',
        B: 'Generico',
        C: 'X1',
        D: 'N/A',
        E: 'PENDIENTE',
        F: '',
        G: '',
        H: '',
        I: 'USADO',
        J: '',
        K: 'REVISION',
        L: '',
        M: '',
        N: '',
        O: '',
        P: '',
      },
    },
  ];

  public async listClients(): Promise<readonly ExternalClientRecord[]> {
    return this.clients;
  }

  public async listEquipment(): Promise<readonly ExternalEquipmentRecord[]> {
    return this.equipment;
  }

  public async findEquipment(identity: {
    externalId: string;
    imei: string;
  }): Promise<ExternalEquipmentRecord | null> {
    return (
      this.equipment.find(
        (eq) =>
          (identity.externalId && eq.externalId === identity.externalId) ||
          (identity.imei && eq.imei === identity.imei),
      ) ?? null
    );
  }

  public async updateAssignment(input: {
    row: number;
    values: Readonly<Partial<Record<'J' | 'L' | 'M' | 'N' | 'O' | 'P', string>>>;
  }): Promise<void> {
    const item = this.equipment.find((e) => e.row === input.row);
    if (item) {
      item.values = { ...item.values, ...input.values };
    }
  }
}
