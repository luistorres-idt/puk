import { describe, expect, it } from 'vitest';
import {
  formatReportDate,
  formatTechnicalReportRow,
  getIsoWeek,
  type ReportOrderSource,
} from './technical-report-formatter.js';

describe('Technical Report Formatter', () => {
  it('computes correct ISO week and date for Hermosillo', () => {
    // 2026-09-09
    const date = new Date('2026-09-09T18:00:00.000Z');
    const week = getIsoWeek(date, 'America/Hermosillo');
    const formattedDate = formatReportDate(date, 'America/Hermosillo');

    expect(week).toBe(37);
    expect(formattedDate).toBe('2026-09-09');
  });

  it('formats order row with multiline economics, series, and equipment IMEIs in stable order', () => {
    const order: ReportOrderSource = {
      folio: 'OS-2026-0001',
      serviceType: 'INSTALLATION',
      status: 'COMPLETED',
      clientNameSnapshot: 'Transportes Bull Dog',
      scheduledAt: '2026-09-09T17:00:00.000Z',
      technicianNameSnapshot: 'Juan Perez',
      pricingBaseCost: '1400.00',
      pricingTravelExpenses: '350.00',
      pricingTotal: '1750.00',
      generalNotes: 'Instalación completada sin novedades',
      units: [
        {
          id: 'u-1',
          label: 'ECO-101',
          serialNumber: 'SER-101',
          createdAt: new Date('2026-09-09T10:00:00.000Z'),
          equipment: [
            { imei: '861234567890123', externalKey: 'EQ-001' },
            { imei: '861234567890124', externalKey: 'EQ-002' },
          ],
        },
        {
          id: 'u-2',
          label: 'ECO-102',
          serialNumber: 'SER-102',
          createdAt: new Date('2026-09-09T10:05:00.000Z'),
          equipment: [{ externalId: 'ID-999', externalKey: 'EQ-003' }],
        },
      ],
    };

    const row = formatTechnicalReportRow(order, 'America/Hermosillo');

    expect(row.folio).toBe('OS-2026-0001');
    expect(row.tecnico).toBe('Juan Perez');
    expect(row.cliente).toBe('Transportes Bull Dog');
    expect(row.servicio).toBe('Instalación');
    expect(row.costo).toBe('1400.00');
    expect(row.viaticos).toBe('350.00');
    expect(row.total).toBe('1750.00');
    expect(row.economico).toBe('ECO-101\nECO-102');
    expect(row.serie).toBe('SER-101\nSER-102');
    expect(row.imeiId).toBe('861234567890123\n861234567890124\nID-999');
    expect(row.notas).toBe('Instalación completada sin novedades');
  });

  it('labels a failed appointment and includes its reason while preserving the original service type', () => {
    const order: ReportOrderSource = {
      folio: 'OS-FAIL-001',
      serviceType: 'INSTALLATION',
      status: 'FAILED_APPOINTMENT',
      clientNameSnapshot: 'Flotillas Azteca',
      scheduledAt: '2026-09-09T17:00:00.000Z',
      technicianNameSnapshot: 'Carlos Lopez',
      pricingBaseCost: '0.00',
      pricingTravelExpenses: '0.00',
      pricingTotal: '0.00',
      failedReason: 'Cliente no estuvo presente en el domicilio',
      generalNotes: 'Se esperaron 45 minutos',
      units: [],
    };

    const row = formatTechnicalReportRow(order);
    expect(row.servicio).toBe('Cita Fallida');
    expect(row.costo).toBe('0.00');
    expect(row.total).toBe('0.00');
    expect(row.notas).toBe(
      'Motivo cita fallida: Cliente no estuvo presente en el domicilio | Se esperaron 45 minutos',
    );
  });

  it('labels a failed appointment without adding a reason when none was captured', () => {
    const order: ReportOrderSource = {
      folio: 'OS-FAIL-002',
      serviceType: 'REVIEW',
      status: 'FAILED_APPOINTMENT',
      clientNameSnapshot: 'Flotillas Azteca',
      scheduledAt: '2026-09-09T17:00:00.000Z',
      generalNotes: 'No fue posible realizar el servicio',
      units: [
        {
          id: 'u-1',
          label: 'ECO-101',
          serialNumber: 'SER-101',
          serviceType: 'REVIEW',
        },
      ],
    };

    const row = formatTechnicalReportRow(order);

    expect(row.servicio).toBe('Cita Fallida');
    expect(row.notas).toBe('No fue posible realizar el servicio');
  });

  it('includes a failed reason from a legacy payload without failed appointment status', () => {
    const order: ReportOrderSource = {
      folio: 'OS-FAIL-003',
      serviceType: 'INSTALLATION',
      clientNameSnapshot: 'Flotillas Azteca',
      scheduledAt: '2026-09-09T17:00:00.000Z',
      failedReason: '  Acceso denegado  ',
      units: [],
    };

    const row = formatTechnicalReportRow(order);

    expect(row.servicio).toBe('Instalación');
    expect(row.notas).toBe('Motivo cita fallida: Acceso denegado');
  });

  it('formats mixed services in servicio column matching multiline units', () => {
    const order: ReportOrderSource = {
      folio: 'OS-MIXED-001',
      clientNameSnapshot: 'Logistica Del Norte',
      scheduledAt: '2026-09-09T18:00:00.000Z',
      technicianNameSnapshot: 'Carlos Lopez',
      pricingBaseCost: '1100.00',
      pricingTravelExpenses: '350.00',
      pricingTotal: '1450.00',
      units: [
        {
          id: 'u-1',
          label: 'Eco-101',
          serialNumber: 'SN-101',
          serviceType: 'INSTALLATION',
          createdAt: '2026-09-09T10:00:00.000Z',
          equipment: [{ imei: '111111111111111' }],
        },
        {
          id: 'u-2',
          label: 'Eco-202',
          serialNumber: 'SN-202',
          serviceType: 'REVIEW',
          createdAt: '2026-09-09T10:05:00.000Z',
          equipment: [{ imei: '222222222222222' }],
        },
      ],
    };

    const row = formatTechnicalReportRow(order);
    expect(row.economico).toBe('Eco-101\nEco-202');
    expect(row.serie).toBe('SN-101\nSN-202');
    expect(row.imeiId).toBe('111111111111111\n222222222222222');
    expect(row.servicio).toBe('Instalación\nRevisión');
    expect(row.costo).toBe('1100.00');
    expect(row.total).toBe('1450.00');
  });
});
