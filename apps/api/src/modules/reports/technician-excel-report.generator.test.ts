import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  buildTechnicianReportRows,
  generateTechnicianExcelReport,
} from './technician-excel-report.generator.js';

describe('TechnicianExcelReportGenerator', () => {
  const sampleOrder1 = {
    folio: 'ORD-001',
    scheduledAt: '2026-09-08T15:00:00.000Z',
    clientNameSnapshot: 'Transportes del Norte',
    serviceType: 'INSTALLATION' as const,
    status: 'COMPLETED' as const,
    pricingBaseCost: '1500.00',
    pricingTravelExpenses: '300.00',
    pricingTotal: '1800.00',
    pricingUnitRate: '500.00',
    generalNotes: 'Instalación completada sin contratiempos',
    units: [
      {
        id: 'u-1',
        label: 'ECO-101',
        serialNumber: 'SN-001',
        serviceType: 'INSTALLATION' as const,
        equipment: [{ imei: '123456789012345' }],
      },
      {
        id: 'u-2',
        label: 'ECO-102',
        serialNumber: 'SN-002',
        serviceType: 'INSTALLATION' as const,
        equipment: [{ imei: '987654321098765' }],
      },
    ],
  };

  const sampleOrder2 = {
    folio: 'ORD-002',
    scheduledAt: '2026-09-08T18:00:00.000Z',
    clientNameSnapshot: 'Logística Express',
    serviceType: 'REVIEW' as const,
    status: 'FAILED_APPOINTMENT' as const,
    pricingBaseCost: '400.00',
    pricingTravelExpenses: '100.00',
    pricingTotal: '500.00',
    failedReason: 'Cliente no se presentó',
    units: [],
  };

  it('breaks down multi-unit orders into granular rows and assigns viáticos to the first unit', () => {
    const rows = buildTechnicianReportRows([sampleOrder1]);
    expect(rows).toHaveLength(2);

    expect(rows[0]).toMatchObject({
      folio: 'ORD-001',
      cliente: 'Transportes del Norte',
      economico: 'ECO-101',
      serie: 'SN-001',
      imeiId: '123456789012345',
      servicio: 'Instalación',
      costo: 500,
      viaticos: 300,
      total: 800,
      notas: 'Instalación completada sin contratiempos',
    });

    expect(rows[1]).toMatchObject({
      folio: 'ORD-001',
      economico: 'ECO-102',
      serie: 'SN-002',
      imeiId: '987654321098765',
      servicio: 'Instalación',
      costo: 500,
      viaticos: 0,
      total: 500,
      notas: '',
    });
  });

  it('formats failed appointment notes and preserves order when units are empty', () => {
    const rows = buildTechnicianReportRows([sampleOrder2]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      folio: 'ORD-002',
      cliente: 'Logística Express',
      servicio: 'Cita Fallida',
      costo: 400,
      viaticos: 100,
      total: 500,
      notas: 'Motivo cita fallida: Cliente no se presentó',
    });
  });

  it('generates a readable and valid Excel buffer with styled worksheets', async () => {
    const bytes = await generateTechnicianExcelReport(
      { name: 'Carlos Mendoza', externalKey: 'TECH-001' },
      [sampleOrder1, sampleOrder2],
    );

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(1000);

    // Read back through ExcelJS to ensure file integrity
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as never);

    const sheet = workbook.getWorksheet('Carlos Mendoza');
    expect(sheet).toBeDefined();
    expect(sheet?.rowCount).toBe(4); // 1 header + 2 units (order 1) + 1 order (order 2)

    const header = sheet?.getRow(1);
    expect(header?.getCell(1).value).toBe('Semana');
    expect(header?.getCell(2).value).toBe('Folio');
    expect(header?.getCell(4).value).toBe('Cliente');
    expect(header?.getCell(8).value).toBe('Servicio');

    const row2 = sheet?.getRow(2);
    expect(row2?.getCell(2).value).toBe('ORD-001');
    expect(row2?.getCell(5).value).toBe('ECO-101');

    const row4 = sheet?.getRow(4);
    expect(row4?.getCell(2).value).toBe('ORD-002');
    expect(row4?.getCell(8).value).toBe('Cita Fallida');
  });
});
