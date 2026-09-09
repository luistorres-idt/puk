import { createHash } from 'node:crypto';

import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import { formatOrderServiceType } from '@puk/contracts';

import type { ObjectStoragePort } from '../../integrations/ports.js';

const CATEGORY_LABELS: Record<string, string> = {
  DASHBOARD: 'Tablero',
  WINDOWS: 'Cristales',
  ACCESSORIES: 'Accesorios',
  TRIMS: 'Molduras',
  BODYWORK: 'Carrocería',
};

const CATEGORY_ORDER = ['DASHBOARD', 'WINDOWS', 'ACCESSORIES', 'TRIMS', 'BODYWORK'];

const CONDITION_LABELS: Record<string, string> = {
  GOOD: 'Bien',
  BAD: 'Mal',
  NOT_APPLICABLE: 'No aplica',
};

const VERIFICATION_LABELS: Record<string, string> = {
  MATCHED: 'Coincidente',
  DISCREPANCY_REPORTED: 'Discrepancia reportada',
  PENDING: 'Pendiente',
};

export interface ReportOrder {
  folio: string;
  serviceType: string;
  clientNameSnapshot: string;
  scheduledAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  serviceAddress: string | null;
  generalNotes: string | null;
  technician: { name: string; workshop: string | null } | null;
  signature: { signerName: string; objectKey: string; signedAt: Date } | null;
  units: Array<{
    label: string;
    makeModel: string;
    year: number | null;
    serialNumber: string;
    status: string;
    equipment: Array<{
      id: string;
      brandSnapshot: string | null;
      modelSnapshot: string | null;
      imei: string | null;
      verificationStatus: string;
    }>;
    checklist: {
      items: Array<{
        category: string;
        condition: string | null;
        notes: string | null;
        evidence: Array<{ id: string; objectKey: string; createdAt: Date }>;
      }>;
    } | null;
    discrepancies: Array<{
      orderEquipmentId: string | null;
      description: string;
      observedSnapshot: unknown;
    }>;
  }>;
}

export interface GeneratedReport {
  bytes: Uint8Array;
  checksum: string;
}

export interface ReportGeneratorPort {
  generate(order: ReportOrder, version: number): Promise<GeneratedReport>;
}

export class ServiceOrderReportGenerator implements ReportGeneratorPort {
  public constructor(
    private readonly storage: ObjectStoragePort,
    private readonly timeZone = 'America/Hermosillo',
  ) {}

  public async generate(order: ReportOrder, version: number): Promise<GeneratedReport> {
    const document = new PDFDocument({
      autoFirstPage: true,
      bufferPages: true,
      margins: { top: 48, right: 46, bottom: 48, left: 46 },
      size: 'LETTER',
      info: {
        Title: `Orden de servicio ${order.folio}`,
        Author: 'Bull Dog Solution',
        Subject: 'Reporte de orden de servicio',
      },
    });
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    const complete = new Promise<Buffer>((resolve, reject) => {
      document.once('end', () => resolve(Buffer.concat(chunks)));
      document.once('error', reject);
    });

    try {
      await this.drawCover(document, order, version);
      for (const [unitIndex, unit] of order.units.entries()) {
        this.drawUnit(document, order.folio, unit, unitIndex + 1, order.units.length);
        await this.drawEvidence(document, order.folio, unit);
      }

      const pages = document.bufferedPageRange();
      for (let index = pages.start; index < pages.start + pages.count; index += 1) {
        document.switchToPage(index);
        // El pie se dibuja dentro del margen físico. Mantener el margen lógico aquí
        // hace que PDFKit agregue una página vacía por cada página existente.
        document.page.margins.bottom = 0;
        document
          .font('Helvetica')
          .fontSize(8)
          .fillColor('#64748b')
          .text(
            `Bull Dog Solution · ${order.folio} · Página ${index + 1} de ${pages.count}`,
            46,
            760,
            {
              align: 'center',
              lineBreak: false,
              width: 520,
            },
          );
      }
    } catch (error) {
      document.end();
      await complete.catch(() => undefined);
      throw error;
    }
    document.end();

    const buffer = await complete;
    return {
      bytes: buffer,
      checksum: createHash('sha256').update(buffer).digest('hex'),
    };
  }

  private formatDate(value: Date | null): string {
    if (!value) return 'No registrado';
    return new Intl.DateTimeFormat('es-MX', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: this.timeZone,
    }).format(value);
  }

  private drawBrand(document: PDFKit.PDFDocument): void {
    document.roundedRect(46, 42, 52, 52, 10).fill('#1e3a8a');
    document.circle(72, 68, 17).lineWidth(4).strokeColor('#60a5fa').stroke();
    document
      .moveTo(62, 68)
      .lineTo(69, 75)
      .lineTo(83, 59)
      .lineWidth(4)
      .lineCap('round')
      .strokeColor('#ffffff')
      .stroke();
    document
      .font('Helvetica-Bold')
      .fontSize(18)
      .fillColor('#0f172a')
      .text('BULL DOG SOLUTION', 112, 55);
    document
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#64748b')
      .text('Servicios técnicos vehiculares', 112, 78);
  }

  private async drawCover(
    document: PDFKit.PDFDocument,
    order: ReportOrder,
    version: number,
  ): Promise<void> {
    this.drawBrand(document);
    document
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor('#334155')
      .text('REPORTE DE ORDEN DE SERVICIO', 46, 124, { align: 'center', width: 520 });
    document
      .font('Helvetica-Bold')
      .fontSize(30)
      .fillColor('#1e3a8a')
      .text(order.folio, 46, 150, { align: 'center', width: 520 });
    document
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#64748b')
      .text(`Versión ${version}`, 46, 188, {
        align: 'center',
        width: 520,
      });

    this.drawInfoGrid(document, 218, [
      ['Cliente', order.clientNameSnapshot],
      ['Tipo de servicio', formatOrderServiceType(order.serviceType)],
      ['Fecha programada', this.formatDate(order.scheduledAt)],
      ['Inicio', this.formatDate(order.startedAt)],
      ['Conclusión', this.formatDate(order.completedAt)],
      ['Técnico responsable', order.technician?.name ?? 'No registrado'],
      ['Lugar del servicio', order.serviceAddress ?? order.technician?.workshop ?? 'No registrado'],
    ]);

    document
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#334155')
      .text('OBSERVACIONES GENERALES', 58, 430);
    document.roundedRect(46, 447, 520, 80, 6).fillAndStroke('#f8fafc', '#cbd5e1');
    document
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#334155')
      .text(order.generalNotes?.trim() || 'Sin observaciones generales', 58, 460, {
        ellipsis: true,
        height: 56,
        width: 496,
      });

    document
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#334155')
      .text('CONFORMIDAD DEL CLIENTE', 58, 552);
    document.roundedRect(46, 569, 520, 150, 6).strokeColor('#cbd5e1').stroke();
    document
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#64748b')
      .text('Manifiesto de conformidad pendiente de aprobación por el negocio.', 58, 582, {
        width: 496,
      });

    if (order.signature) {
      const signature = await this.loadImage(order.signature.objectKey, false);
      document.image(signature, 68, 607, { align: 'center', fit: [210, 66], valign: 'center' });
      document.moveTo(58, 679).lineTo(288, 679).lineWidth(1).strokeColor('#94a3b8').stroke();
      document
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor('#0f172a')
        .text(order.signature.signerName, 58, 685, { align: 'center', width: 230 });
      document
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#64748b')
        .text(`Firmado: ${this.formatDate(order.signature.signedAt)}`, 318, 635, { width: 220 });
    } else {
      document
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#b91c1c')
        .text('Firma no disponible', 58, 635);
    }
  }

  private drawInfoGrid(document: PDFKit.PDFDocument, startY: number, rows: string[][]): void {
    let y = startY;
    for (const [label = '', value = ''] of rows) {
      document.roundedRect(46, y, 520, 26, 3).fill(y % 2 === 0 ? '#f8fafc' : '#ffffff');
      document
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor('#64748b')
        .text(label.toUpperCase(), 58, y + 8, { width: 145 });
      document
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#0f172a')
        .text(value, 205, y + 7, { ellipsis: true, width: 345 });
      y += 28;
    }
  }

  private drawUnit(
    document: PDFKit.PDFDocument,
    folio: string,
    unit: ReportOrder['units'][number],
    position: number,
    total: number,
  ): void {
    document.addPage();
    this.drawSectionHeader(document, folio, `Unidad ${position} de ${total}: ${unit.label}`);
    this.drawInfoGrid(document, 105, [
      ['Nombre de unidad', unit.label],
      ['Marca y modelo', unit.makeModel],
      ['Año', unit.year?.toString() ?? 'No registrado'],
      ['VIN / número de serie', unit.serialNumber],
      ['Estado final', unit.status === 'COMPLETED' ? 'Completada' : unit.status],
    ]);
    document.y = 260;
    this.drawHeading(document, 'EQUIPOS DE LA UNIDAD');
    if (unit.equipment.length === 0) {
      document
        .font('Helvetica-Oblique')
        .fontSize(9)
        .fillColor('#64748b')
        .text('Sin equipos registrados');
    }
    for (const [index, equipment] of unit.equipment.entries()) {
      this.ensureSpace(document, 105, folio, unit.label);
      const top = document.y + 5;
      document.roundedRect(46, top, 520, 90, 5).fillAndStroke('#f8fafc', '#cbd5e1');
      document
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#1e3a8a')
        .text(`Equipo ${index + 1}`, 58, top + 10);
      const values = [
        `Marca / modelo: ${[equipment.brandSnapshot, equipment.modelSnapshot].filter(Boolean).join(' ') || 'No registrado'}`,
        `IMEI: ${equipment.imei ?? 'No registrado'}`,
        `Verificación: ${VERIFICATION_LABELS[equipment.verificationStatus] ?? equipment.verificationStatus}`,
      ];
      document
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor('#334155')
        .text(values.join('\n'), 58, top + 30, {
          lineGap: 2,
          width: 230,
        });
      const discrepancies = unit.discrepancies.filter(
        (item) => item.orderEquipmentId === equipment.id,
      );
      if (discrepancies.length > 0) {
        const observed = discrepancies
          .map((item) => this.formatSnapshot(item.observedSnapshot))
          .filter(Boolean)
          .join('; ');
        document
          .font('Helvetica-Bold')
          .fillColor('#b45309')
          .text(
            `Discrepancia: ${discrepancies.map((item) => item.description).join('; ')}${observed ? ` · Observado: ${observed}` : ''}`,
            300,
            top + 30,
            {
              ellipsis: true,
              height: 50,
              width: 250,
            },
          );
      }
      document.y = top + 100;
    }

    const unitDiscrepancies = unit.discrepancies.filter((item) => !item.orderEquipmentId);
    if (unitDiscrepancies.length > 0) {
      this.ensureSpace(document, 70, folio, unit.label);
      document.roundedRect(46, document.y + 4, 520, 54, 5).fillAndStroke('#fffbeb', '#f59e0b');
      document
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .fillColor('#92400e')
        .text('OTRAS DISCREPANCIAS', 58, document.y + 14);
      document
        .font('Helvetica')
        .fillColor('#78350f')
        .text(unitDiscrepancies.map((item) => item.description).join('; '), 58, document.y + 5, {
          ellipsis: true,
          height: 25,
          width: 496,
        });
      document.y += 66;
    }

    this.ensureSpace(document, 225, folio, unit.label);
    this.drawHeading(document, 'CHECKLIST DE LA UNIDAD');
    const itemMap = new Map(unit.checklist?.items.map((item) => [item.category, item]) ?? []);
    for (const category of CATEGORY_ORDER) {
      const item = itemMap.get(category);
      const y = document.y + 3;
      document.roundedRect(46, y, 520, 35, 3).fillAndStroke('#ffffff', '#e2e8f0');
      document
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .fillColor('#334155')
        .text(CATEGORY_LABELS[category] ?? category, 58, y + 7, { width: 100 });
      document
        .font('Helvetica-Bold')
        .fillColor(item?.condition === 'BAD' ? '#b91c1c' : '#166534')
        .text(CONDITION_LABELS[item?.condition ?? ''] ?? 'No registrado', 165, y + 7, {
          width: 78,
        });
      document
        .font('Helvetica')
        .fillColor('#475569')
        .text(item?.notes?.trim() || 'Sin observaciones', 250, y + 7, {
          ellipsis: true,
          height: 22,
          width: 304,
        });
      document.y = y + 39;
    }
  }

  private async drawEvidence(
    document: PDFKit.PDFDocument,
    folio: string,
    unit: ReportOrder['units'][number],
  ): Promise<void> {
    const orderedItems = [...(unit.checklist?.items ?? [])].sort(
      (left, right) =>
        CATEGORY_ORDER.indexOf(left.category) - CATEGORY_ORDER.indexOf(right.category),
    );
    const evidence = orderedItems.flatMap((item) => item.evidence);
    for (const [index, photo] of evidence.entries()) {
      document.addPage();
      this.drawSectionHeader(
        document,
        folio,
        `${unit.label} · Evidencia ${index + 1} de ${evidence.length}`,
      );
      const image = await this.loadImage(photo.objectKey, true);
      document.image(image, 46, 120, { align: 'center', fit: [520, 585], valign: 'center' });
      document
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#64748b')
        .text(`Captura/carga registrada: ${this.formatDate(photo.createdAt)}`, 46, 718, {
          align: 'center',
          width: 520,
        });
    }
  }

  private drawSectionHeader(document: PDFKit.PDFDocument, folio: string, title: string): void {
    document.font('Helvetica-Bold').fontSize(10).fillColor('#1e3a8a').text(folio, 46, 50);
    document
      .font('Helvetica-Bold')
      .fontSize(17)
      .fillColor('#0f172a')
      .text(title, 46, 72, { width: 520 });
    document.moveTo(46, 98).lineTo(566, 98).lineWidth(2).strokeColor('#60a5fa').stroke();
  }

  private drawHeading(document: PDFKit.PDFDocument, title: string): void {
    document
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#334155')
      .text(title, 46, document.y, { width: 520 });
    document.moveDown(0.5);
  }

  private ensureSpace(
    document: PDFKit.PDFDocument,
    height: number,
    folio: string,
    unitLabel: string,
  ): void {
    if (document.y + height <= 740) return;
    document.addPage();
    this.drawSectionHeader(document, folio, `Unidad: ${unitLabel} (continuación)`);
    document.y = 112;
  }

  private async loadImage(objectKey: string, optimize: boolean): Promise<Buffer> {
    const bytes = await this.storage.getObject(objectKey);
    if (!bytes) throw new Error(`No se encontró un recurso requerido para el reporte`);
    try {
      const pipeline = sharp(bytes).rotate().flatten({ background: '#ffffff' });
      return optimize
        ? pipeline
            .resize({ height: 1800, width: 1800, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 88 })
            .toBuffer()
        : pipeline.png().toBuffer();
    } catch {
      throw new Error('No fue posible procesar una imagen requerida para el reporte');
    }
  }

  private formatSnapshot(value: unknown): string {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
    return Object.entries(value)
      .filter(([, item]) => item !== null && item !== undefined && item !== '')
      .map(([key, item]) => `${key}: ${String(item)}`)
      .join(', ');
  }
}
