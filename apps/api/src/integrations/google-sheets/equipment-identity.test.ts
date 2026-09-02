import { describe, expect, it } from 'vitest';
import { isValidIdentifier, parseEquipmentRow } from './equipment-identity.js';

describe('equipment-identity', () => {
  it('identifies valid and invalid identifiers correctly', () => {
    expect(isValidIdentifier('EQ-1001')).toBe(true);
    expect(isValidIdentifier('123456789012345')).toBe(true);
    expect(isValidIdentifier('')).toBe(false);
    expect(isValidIdentifier('   ')).toBe(false);
    expect(isValidIdentifier('PENDIENTE')).toBe(false);
    expect(isValidIdentifier('pendiente')).toBe(false);
    expect(isValidIdentifier('N/A')).toBe(false);
    expect(isValidIdentifier('na')).toBe(false);
    expect(isValidIdentifier('-')).toBe(false);
    expect(isValidIdentifier(null)).toBe(false);
    expect(isValidIdentifier(undefined)).toBe(false);
  });

  it('uses ID as primary key when valid', () => {
    const row = [
      '2026-01-01', // A: Fecha
      'CalAmp',     // B: Marca
      'LMU-3030',   // C: Modelo
      'ID-999',     // D: ID
      '8675309',    // E: IMEI
      '5512345678', // F: Linea
      '8952...',    // G: ICCID
      'Telcel',     // H: Compania
      'NUEVO',      // I: Estado
      'Cliente X',  // J: Cliente
      'STOCK',      // K: Estado servicio
      '', '', '', '', ''
    ];

    const parsed = parseEquipmentRow(row, 5);
    expect(parsed.hasValidIdentity).toBe(true);
    expect(parsed.externalKey).toBe('ID-999');
    expect(parsed.id).toBe('ID-999');
    expect(parsed.imei).toBe('8675309');
    expect(parsed.rowNumber).toBe(5);
  });

  it('falls back to IMEI when ID is PENDIENTE or N/A', () => {
    const row = [
      '2026-01-01',
      'Queclink',
      'GV300',
      'PENDIENTE',  // D: ID
      '3569874123', // E: IMEI
      '', '', '', 'NUEVO', '', 'STOCK', '', '', '', '', ''
    ];

    const parsed = parseEquipmentRow(row, 10);
    expect(parsed.hasValidIdentity).toBe(true);
    expect(parsed.externalKey).toBe('3569874123');
    expect(parsed.id).toBeNull();
    expect(parsed.imei).toBe('3569874123');
  });

  it('marks equipment as invalid identity if both ID and IMEI are missing or invalid', () => {
    const row = [
      '2026-01-01',
      'Queclink',
      'GV300',
      'N/A',
      'PENDIENTE',
      '', '', '', '', '', '', '', '', '', '', ''
    ];

    const parsed = parseEquipmentRow(row, 15);
    expect(parsed.hasValidIdentity).toBe(false);
    expect(parsed.externalKey).toBe('INCOMPLETE:row-15');
    expect(parsed.id).toBeNull();
    expect(parsed.imei).toBeNull();
  });
});
