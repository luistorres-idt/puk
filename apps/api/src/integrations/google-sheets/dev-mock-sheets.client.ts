import type {
  ExternalClientRecord,
  ExternalEquipmentRecord,
  SheetsPort,
  TechnicalReportRowInput,
} from '../ports.js';
import { AppError } from '../../shared/errors.js';

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
    values: Readonly<Partial<Record<'J' | 'K' | 'L' | 'M' | 'N' | 'O' | 'P', string>>>;
  }): Promise<void> {
    const item = this.equipment.find((e) => e.row === input.row);
    if (item) {
      item.values = { ...item.values, ...input.values };
    }
  }

  private techniciansDirectory: string[][] = [
    [
      'TECNICO',
      'TALLER',
      'RAZON SOCIAL',
      'TELEFONO',
      'CORREO',
      'DIRECCIÓN',
      'CIUDAD',
      'ESTADO',
      'FACTURA',
      'DATOS FISCALES',
      'DIRECCION FISCAL',
      'COSTO SALIDA DEL TALLER',
      'CAMBIO DE EQUIPO',
      'INSTALACION',
      'REVISION',
      'DESINSTALACION',
      'CITA FALLIDA',
      'SENSOR FUEL',
      'NOTAS ADICIONALES',
      'NOMBRE DE LA CUENTA BANCARIA',
      'CUENTA BANCARIA',
      'BANCO',
      'ID_TECNICO',
    ],
    [
      'Juan Perez',
      'Taller Central',
      'Juan Perez Soluciones SA',
      '6621234567',
      'juan@example.com',
      'Calle Principal 100',
      'Hermosillo',
      'Sonora',
      'SI',
      'PEPJ800101XXX',
      'Calle Principal 100',
      '$350.00',
      '$500.00',
      '$700.00',
      '$400.00',
      '$450.00',
      '$250.00',
      '$600.00',
      'Técnico preferente flotillas',
      '',
      '',
      '',
      'TEC-0001',
    ],
    [
      'Carlos Lopez',
      'Taller Norte',
      '',
      '6629876543',
      '',
      'Av Morelos 20',
      'Nogales',
      'Sonora',
      'NO',
      '',
      '',
      '0',
      '$450.00',
      '$650.00',
      '$350.00',
      '$400.00',
      '',
      '$550.00',
      '',
      '',
      '',
      '',
      'TEC-0002',
    ],
  ];

  private reportRows: string[][] = [
    [
      'sem',
      'orden',
      'tecnico',
      'nombre',
      'rfc',
      'economico',
      'serie',
      'imei/id',
      '',
      'fecha',
      'servicio',
      'costo',
      'viaticos',
      'total',
      'envio dhl',
      'notas',
    ],
  ];

  public async listTechniciansDirectory(): Promise<readonly (readonly string[])[]> {
    return this.techniciansDirectory;
  }

  public async syncTechnicalReportRow(
    input: TechnicalReportRowInput,
  ): Promise<{ row: number; created: boolean }> {
    if (this.reportRows.length === 0) {
      throw new AppError(400, 'REPORT_EMPTY', 'La hoja de reporte técnico está vacía');
    }

    const header = this.reportRows[0] ?? [];
    if (
      (header[0] ?? '').toString().trim().toLowerCase() !== 'sem' ||
      (header[1] ?? '').toString().trim().toLowerCase() !== 'orden' ||
      (header[2] ?? '').toString().trim().toLowerCase() !== 'tecnico' ||
      (header[14] ?? '').toString().trim().toLowerCase() !== 'envio dhl'
    ) {
      throw new AppError(
        400,
        'REPORT_HEADERS_INVALID',
        'Los encabezados de la hoja de reporte técnico no coinciden con el contrato esperado',
      );
    }

    const matchingIndices: number[] = [];
    for (let i = 1; i < this.reportRows.length; i++) {
      if ((this.reportRows[i]?.[1] ?? '').trim() === input.folio) {
        matchingIndices.push(i);
      }
    }

    if (matchingIndices.length > 1) {
      throw new AppError(
        409,
        'DUPLICATE_FOLIO_IN_REPORT',
        `El folio ${input.folio} aparece duplicado en el reporte técnico en las filas ${matchingIndices.map((idx) => idx + 1).join(', ')}`,
        { folio: input.folio },
      );
    }

    if (matchingIndices.length === 1) {
      const idx = matchingIndices[0]!;
      const row = this.reportRows[idx]!;
      const prevD = row[3] ?? '';
      const prevE = row[4] ?? '';
      const prevO = row[14] ?? '';

      row[0] = input.sem;
      row[1] = input.folio;
      row[2] = input.tecnico;
      row[5] = input.economico;
      row[6] = input.serie;
      row[7] = input.imeiId;
      row[8] = input.cliente;
      row[9] = input.fecha;
      row[10] = input.servicio;
      row[11] = input.costo;
      row[12] = input.viaticos;
      row[13] = input.total;
      row[15] = input.notas;

      if ((row[3] ?? '') !== prevD || (row[4] ?? '') !== prevE || (row[14] ?? '') !== prevO) {
        throw new AppError(
          500,
          'UNMANAGED_CELLS_MODIFIED',
          'Las celdas manuales no administradas fueron modificadas durante la escritura',
        );
      }

      return { row: idx + 1, created: false };
    }

    const newRow = new Array(16).fill('');
    newRow[0] = input.sem;
    newRow[1] = input.folio;
    newRow[2] = input.tecnico;
    newRow[3] = ''; // Col D manual: preserve empty
    newRow[4] = ''; // Col E manual: preserve empty
    newRow[5] = input.economico;
    newRow[6] = input.serie;
    newRow[7] = input.imeiId;
    newRow[8] = input.cliente;
    newRow[9] = input.fecha;
    newRow[10] = input.servicio;
    newRow[11] = input.costo;
    newRow[12] = input.viaticos;
    newRow[13] = input.total;
    newRow[14] = ''; // Col O manual: preserve empty
    newRow[15] = input.notas;

    this.reportRows.splice(1, 0, newRow);
    return { row: 2, created: true };
  }
}
