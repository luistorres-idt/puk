import { describe, expect, it } from 'vitest';
import { AppError } from '../../shared/errors.js';
import {
  allocateNextTechnicianId,
  parseMoneyRate,
  parseTechnicianDirectoryRows,
  validateDirectoryHeaders,
} from './directory-parser.js';

describe('Directory Parser', () => {
  const validHeaderRow = [
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
  ];

  describe('validateDirectoryHeaders', () => {
    it('accepts valid header row', () => {
      expect(() => validateDirectoryHeaders(validHeaderRow)).not.toThrow();
    });

    it('throws AppError if headers are missing or empty', () => {
      expect(() => validateDirectoryHeaders([])).toThrow(AppError);
      expect(() => validateDirectoryHeaders(undefined)).toThrow(AppError);
    });

    it('throws AppError if headers do not match', () => {
      const corrupted = [...validHeaderRow];
      corrupted[0] = 'NOMBRE';
      corrupted[22] = 'OTRO_ID';
      expect(() => validateDirectoryHeaders(corrupted)).toThrow(AppError);
    });
  });

  describe('parseMoneyRate', () => {
    it('returns null for empty or null strings', () => {
      expect(parseMoneyRate(null)).toEqual({ isValid: true, value: null });
      expect(parseMoneyRate(undefined)).toEqual({ isValid: true, value: null });
      expect(parseMoneyRate('')).toEqual({ isValid: true, value: null });
      expect(parseMoneyRate('   ')).toEqual({ isValid: true, value: null });
    });

    it('differentiates zero from null', () => {
      expect(parseMoneyRate('0')).toEqual({ isValid: true, value: '0.00' });
      expect(parseMoneyRate('0.00')).toEqual({ isValid: true, value: '0.00' });
      expect(parseMoneyRate('$0.00')).toEqual({ isValid: true, value: '0.00' });
      expect(parseMoneyRate('$0')).toEqual({ isValid: true, value: '0.00' });
    });

    it('parses valid currency formats with decimals and commas', () => {
      expect(parseMoneyRate('1500')).toEqual({ isValid: true, value: '1500.00' });
      expect(parseMoneyRate('1,500.50')).toEqual({ isValid: true, value: '1500.50' });
      expect(parseMoneyRate('$1,500.50')).toEqual({ isValid: true, value: '1500.50' });
      expect(parseMoneyRate('  $2,345.67  ')).toEqual({ isValid: true, value: '2345.67' });
    });

    it('flags invalid currency formats as invalid', () => {
      expect(parseMoneyRate('PENDIENTE')).toEqual({ isValid: false, value: null });
      expect(parseMoneyRate('-500')).toEqual({ isValid: false, value: null });
      expect(parseMoneyRate('N/A')).toEqual({ isValid: false, value: null });
      expect(parseMoneyRate('$abc')).toEqual({ isValid: false, value: null });
    });
  });

  describe('parseTechnicianDirectoryRows', () => {
    it('parses valid technicians correctly', () => {
      const rows = [
        validHeaderRow,
        [
          'Juan Perez',
          'Taller Central',
          'Juan Perez SA',
          '6621234567',
          'juan@example.com',
          'Calle 123',
          'Hermosillo',
          'Sonora',
          'SI',
          'PEPJ800101XXX',
          'Calle 123',
          '$350.00',
          '$500.00',
          '$700.00',
          '$400.00',
          '$450.00',
          '$200.00',
          '$600.00',
          'Notas juan',
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
          'Av Norte',
          'Nogales',
          'Sonora',
          'NO',
          '',
          '',
          '0',
          '', // null rate
          '$800.00',
          'INVALID_RATE', // invalid rate
          '$500.00',
          '', // null cita fallida
          '$650.00',
          '',
          '',
          '',
          '',
          'TEC-0002',
        ],
      ];

      const result = parseTechnicianDirectoryRows(rows);
      expect(result.technicians.length).toBe(2);
      expect(result.invalidRows.length).toBe(0);
      expect(result.maxExternalId).toBe(2);

      const t1 = result.technicians[0]!;
      expect(t1.name).toBe('Juan Perez');
      expect(t1.externalKey).toBe('TEC-0001');
      expect(t1.workshop).toBe('Taller Central');
      expect(t1.city).toBe('Hermosillo');
      expect(t1.departureCost).toEqual({ isValid: true, value: '350.00' });
      expect(t1.installationRate).toEqual({ isValid: true, value: '700.00' });
      expect(t1.failedAppointmentRate).toEqual({ isValid: true, value: '200.00' });

      const t2 = result.technicians[1]!;
      expect(t2.name).toBe('Carlos Lopez');
      expect(t2.externalKey).toBe('TEC-0002');
      expect(t2.departureCost).toEqual({ isValid: true, value: '0.00' });
      expect(t2.replacementRate).toEqual({ isValid: true, value: null });
      expect(t2.reviewRate).toEqual({ isValid: false, value: null });
      expect(t2.failedAppointmentRate).toEqual({ isValid: true, value: null });
    });

    it('throws AppError on duplicate external key', () => {
      const rows = [
        validHeaderRow,
        ['Juan Perez', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'TEC-0001'],
        ['Pedro Gomez', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'TEC-0001'],
      ];

      expect(() => parseTechnicianDirectoryRows(rows)).toThrow(AppError);
    });

    it('captures rows without key or without name in invalidRows', () => {
      const rows = [
        validHeaderRow,
        ['Sin Id', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'TEC-0005'],
        ['Formato Mal', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'INVALID-ID'],
      ];

      const result = parseTechnicianDirectoryRows(rows);
      expect(result.technicians.length).toBe(0);
      expect(result.invalidRows.length).toBe(3);
    });
  });

  describe('allocateNextTechnicianId', () => {
    it('allocates TEC-0001 when empty', () => {
      expect(allocateNextTechnicianId([])).toBe('TEC-0001');
    });

    it('allocates next sequence based on highest existing ID', () => {
      expect(allocateNextTechnicianId(['TEC-0001', 'TEC-0002', 'TEC-0088'])).toBe('TEC-0089');
    });

    it('does not reuse retired IDs if max is preserved', () => {
      // E.g. TEC-0002 was retired, but max was 0088
      expect(allocateNextTechnicianId(['TEC-0001', 'TEC-0088'])).toBe('TEC-0089');
      expect(allocateNextTechnicianId(88)).toBe('TEC-0089');
    });
  });
});
