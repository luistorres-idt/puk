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

  it('formats multi-unit orders with line breaks inside the cells and keeps one row per order', () => {
    const rows = buildTechnicianReportRows([sampleOrder1]);
    expect(rows).toHaveLength(1);

    expect(rows[0]).toMatchObject({
      folio: 'ORD-001',
      cliente: 'Transportes del Norte',
      economico: 'ECO-101\nECO-102',
      serie: 'SN-001\nSN-002',
      imeiId: '123456789012345\n987654321098765',
      servicio: 'Instalación\nInstalación',
      viaticos: 300,
      total: 1800,
      notas: 'Instalación completada sin contratiempos',
    });
    expect(rows[0]?.costo).toBe('500.00\n500.00');
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

  it('generates a readable and valid Excel buffer with styled worksheets and wrapText enabled', async () => {
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
    expect(sheet?.rowCount).toBe(3); // 1 header + 1 row for order1 + 1 row for order2

    const header = sheet?.getRow(1);
    expect(header?.getCell(1).value).toBe('Semana');
    expect(header?.getCell(2).value).toBe('Folio');
    expect(header?.getCell(4).value).toBe('Cliente');
    expect(header?.getCell(8).value).toBe('Servicio');

    const colCosto = sheet?.getColumn(9);
    const colViaticos = sheet?.getColumn(10);
    const colTotal = sheet?.getColumn(11);
    expect(colCosto?.numFmt).toBe('#,##0.00');
    expect(colViaticos?.numFmt).toBe('#,##0.00');
    expect(colTotal?.numFmt).toBe('$#,##0.00');

    const row2 = sheet?.getRow(2);
    expect(row2?.getCell(2).value).toBe('ORD-001');
    expect(row2?.getCell(5).value).toBe('ECO-101\nECO-102');
    expect(row2?.getCell(11).value).toBe(1800);
    expect(row2?.alignment?.wrapText).toBe(true);

    const row3 = sheet?.getRow(3);
    expect(row3?.getCell(2).value).toBe('ORD-002');
    expect(row3?.getCell(8).value).toBe('Cita Fallida');
    expect(row3?.getCell(11).value).toBe(500);
  });
});
