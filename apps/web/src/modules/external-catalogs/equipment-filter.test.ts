import { describe, expect, it } from 'vitest';
import type { ExternalEquipment } from '@puk/contracts';
import {
  normalizeString,
  isMatchingClient,
  isInstalledEquipment,
  filterEquipmentByServiceType,
  extractUnitFromEquipment,
} from './equipment-filter.js';

function createMockEquipment(overrides: Partial<ExternalEquipment> = {}): ExternalEquipment {
  return {
    externalKey: 'EQ-001',
    id: 'EQ-001',
    imei: '861234567890123',
    brand: 'Teltonika',
    model: 'FMB920',
    line: '5511223344',
    iccid: '895200000000001',
    carrier: 'Telcel',
    condition: 'NUEVO',
    currentClient: null,
    serviceStatus: 'STOCK TECNICO',
    unit: null,
    unitMakeModel: null,
    unitYear: null,
    unitSerialNumber: null,
    serviceType: 'ESTANDAR',
    rowNumber: 2,
    hasValidIdentity: true,
    rawValues: {},
    ...overrides,
  };
}

describe('normalizeString', () => {
  it('handles null, undefined and empty strings', () => {
    expect(normalizeString(null)).toBe('');
    expect(normalizeString(undefined)).toBe('');
    expect(normalizeString('')).toBe('');
  });

  it('converts to lowercase and trims whitespace', () => {
    expect(normalizeString('  INSTALADO  ')).toBe('instalado');
  });

  it('removes accents and diacritics', () => {
    expect(normalizeString('Instalación')).toBe('instalacion');
    expect(normalizeString('Distribuidora del Bajío')).toBe('distribuidora del bajio');
    expect(normalizeString('TÉCNICO')).toBe('tecnico');
  });

  it('collapses multiple whitespace characters', () => {
    expect(normalizeString('Transportes   Bull   Dog')).toBe('transportes bull dog');
  });
});

describe('isMatchingClient', () => {
  it('returns true for exact matches with different casing and accents', () => {
    expect(
      isMatchingClient('Transportes Bull Dog S.A. de C.V.', 'TRANSPORTES BULL DOG S.A. DE C.V.'),
    ).toBe(true);
    expect(
      isMatchingClient('Distribuidora Logística del Bajío', 'DISTRIBUIDORA LOGISTICA DEL BAJIO'),
    ).toBe(true);
  });

  it('returns true when one name contains the other as a significant substring', () => {
    expect(isMatchingClient('Transportes Bull Dog', 'Transportes Bull Dog S.A. de C.V.')).toBe(
      true,
    );
    expect(isMatchingClient('Transportes Bull Dog S.A. de C.V.', 'Transportes Bull Dog')).toBe(
      true,
    );
  });

  it('returns false for completely different clients', () => {
    expect(isMatchingClient('Transportes Bull Dog', 'Flotillas Azteca')).toBe(false);
  });

  it('returns false when one or both clients are empty', () => {
    expect(isMatchingClient(null, 'Transportes Bull Dog')).toBe(false);
    expect(isMatchingClient('Transportes Bull Dog', '')).toBe(false);
  });
});

describe('isInstalledEquipment', () => {
  it('identifies installed statuses regardless of casing or accents', () => {
    expect(isInstalledEquipment(createMockEquipment({ serviceStatus: 'INSTALADO' }))).toBe(true);
    expect(isInstalledEquipment(createMockEquipment({ serviceStatus: 'Instalado' }))).toBe(true);
    expect(isInstalledEquipment(createMockEquipment({ serviceStatus: '  instalado  ' }))).toBe(
      true,
    );
    expect(isInstalledEquipment(createMockEquipment({ serviceStatus: 'INSTALADA' }))).toBe(true);
  });

  it('returns false for stock or other statuses', () => {
    expect(isInstalledEquipment(createMockEquipment({ serviceStatus: 'STOCK TECNICO' }))).toBe(
      false,
    );
    expect(isInstalledEquipment(createMockEquipment({ serviceStatus: 'STOCK' }))).toBe(false);
    expect(isInstalledEquipment(createMockEquipment({ serviceStatus: 'DISPONIBLE' }))).toBe(false);
    expect(isInstalledEquipment(createMockEquipment({ serviceStatus: null }))).toBe(false);
  });

  it('returns false for uninstalled statuses', () => {
    expect(isInstalledEquipment(createMockEquipment({ serviceStatus: 'DESINSTALADO' }))).toBe(
      false,
    );
    expect(isInstalledEquipment(createMockEquipment({ serviceStatus: 'DESINSTALADA' }))).toBe(
      false,
    );
    expect(isInstalledEquipment(createMockEquipment({ serviceStatus: 'Desinstalado' }))).toBe(
      false,
    );
    expect(isInstalledEquipment(createMockEquipment({ serviceStatus: '  desinstalado  ' }))).toBe(
      false,
    );
  });
});

describe('filterEquipmentByServiceType', () => {
  const stockEq1 = createMockEquipment({
    externalKey: 'STOCK-1',
    id: 'STOCK-1',
    serviceStatus: 'STOCK TECNICO',
    currentClient: null,
  });

  const stockEq2 = createMockEquipment({
    externalKey: 'STOCK-2',
    id: 'STOCK-2',
    serviceStatus: 'DISPONIBLE',
    currentClient: null,
  });

  const installedClientA = createMockEquipment({
    externalKey: 'INST-A1',
    id: 'INST-A1',
    serviceStatus: 'INSTALADO',
    currentClient: 'Transportes Bull Dog S.A. de C.V.',
    unit: 'Eco-101',
  });

  const installedClientB = createMockEquipment({
    externalKey: 'INST-B1',
    id: 'INST-B1',
    serviceStatus: 'INSTALADO',
    currentClient: 'Distribuidora del Bajio',
    unit: 'Camion-2',
  });

  const allItems = [stockEq1, stockEq2, installedClientA, installedClientB];

  it('returns all items when serviceType is not specified', () => {
    const result = filterEquipmentByServiceType(allItems);
    expect(result).toHaveLength(4);
  });

  it('filters only available / in-stock equipment for INSTALLATION', () => {
    const result = filterEquipmentByServiceType(allItems, {
      serviceType: 'INSTALLATION',
      clientName: 'Transportes Bull Dog S.A. de C.V.',
    });

    expect(result.map((e) => e.externalKey)).toEqual(['STOCK-1', 'STOCK-2']);
  });

  it('filters only available / in-stock equipment for FUEL_SENSOR', () => {
    const result = filterEquipmentByServiceType(allItems, {
      serviceType: 'FUEL_SENSOR',
      clientName: 'Transportes Bull Dog S.A. de C.V.',
    });

    expect(result.map((equipment) => equipment.externalKey)).toEqual(['STOCK-1', 'STOCK-2']);
  });

  it('filters only installed equipment for the specified client for REVIEW', () => {
    const result = filterEquipmentByServiceType(allItems, {
      serviceType: 'REVIEW',
      clientName: 'TRANSPORTES BULL DOG S.A. DE C.V.',
    });

    expect(result.map((e) => e.externalKey)).toEqual(['INST-A1']);
  });

  it('filters only installed equipment for the specified client for UNINSTALLATION', () => {
    const result = filterEquipmentByServiceType(allItems, {
      serviceType: 'UNINSTALLATION',
      clientName: 'Distribuidora del Bajío',
    });

    expect(result.map((e) => e.externalKey)).toEqual(['INST-B1']);
  });

  it('returns empty array when client has no installed equipment for REVIEW', () => {
    const result = filterEquipmentByServiceType(allItems, {
      serviceType: 'REVIEW',
      clientName: 'Cliente Sin Equipos',
    });

    expect(result).toEqual([]);
  });

  it('excludes uninstalled equipment for REVIEW and UNINSTALLATION', () => {
    const uninstalledEquipment = createMockEquipment({
      externalKey: 'UNINST-A1',
      id: 'UNINST-A1',
      serviceStatus: 'DESINSTALADO',
      currentClient: 'Transportes Bull Dog S.A. de C.V.',
      unit: 'Eco-999',
    });
    const itemsWithUninstalled = [...allItems, uninstalledEquipment];

    const reviewResult = filterEquipmentByServiceType(itemsWithUninstalled, {
      serviceType: 'REVIEW',
      clientName: 'Transportes Bull Dog S.A. de C.V.',
    });
    expect(reviewResult.map((e) => e.externalKey)).toEqual(['INST-A1']);

    const uninstResult = filterEquipmentByServiceType(itemsWithUninstalled, {
      serviceType: 'UNINSTALLATION',
      clientName: 'Transportes Bull Dog S.A. de C.V.',
    });
    expect(uninstResult.map((e) => e.externalKey)).toEqual(['INST-A1']);
  });

  it('excludes equipment specified in excludeKeys array', () => {
    const result = filterEquipmentByServiceType(allItems, {
      serviceType: 'INSTALLATION',
      clientName: 'Transportes Bull Dog S.A. de C.V.',
      excludeKeys: ['STOCK-1'],
    });

    expect(result.map((e) => e.externalKey)).toEqual(['STOCK-2']);
  });

  it('excludes equipment specified in excludeKeys Set', () => {
    const result = filterEquipmentByServiceType(allItems, {
      serviceType: 'INSTALLATION',
      clientName: 'Transportes Bull Dog S.A. de C.V.',
      excludeKeys: new Set(['STOCK-1', 'STOCK-2']),
    });

    expect(result).toEqual([]);
  });

  it('excludes equipment without serviceType specified', () => {
    const result = filterEquipmentByServiceType(allItems, {
      excludeKeys: ['STOCK-1', 'INST-A1'],
    });

    expect(result.map((e) => e.externalKey)).toEqual(['STOCK-2', 'INST-B1']);
  });
});

describe('extractUnitFromEquipment', () => {
  it('extracts unit information when all fields are present', () => {
    const eq = createMockEquipment({
      unit: 'Eco-200',
      unitMakeModel: 'Freightliner Cascadia',
      unitSerialNumber: '3AKJH56789',
      unitYear: '2024',
    });

    const unit = extractUnitFromEquipment(eq);

    expect(unit).toEqual({
      label: 'Eco-200',
      makeModel: 'Freightliner Cascadia',
      serialNumber: '3AKJH56789',
      year: 2024,
    });
  });

  it('provides safe fallbacks when unit fields are missing or empty', () => {
    const eq = createMockEquipment({
      id: 'EQ-999',
      imei: '861111111111111',
      unit: null,
      unitMakeModel: null,
      unitSerialNumber: null,
      unitYear: null,
    });

    const unit = extractUnitFromEquipment(eq);

    expect(unit.label).toBe('Unidad EQ-999');
    expect(unit.makeModel).toBe('No especificada');
    expect(unit.serialNumber).toBe('SN-EQ-999');
    expect(unit.year).toBeNull();
  });

  it('handles invalid year strings gracefully by setting year to null', () => {
    const eq = createMockEquipment({
      unitYear: 'invalid-year',
    });

    const unit = extractUnitFromEquipment(eq);
    expect(unit.year).toBeNull();
  });
});
