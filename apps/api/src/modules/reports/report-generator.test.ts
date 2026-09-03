import { describe, expect, it } from 'vitest';

import { DevMockStorageClient } from '../../integrations/object-storage/dev-mock-storage.client.js';
import { ServiceOrderReportGenerator } from './report-generator.js';

describe('ServiceOrderReportGenerator', () => {
  it('generates a PDF with cover, units and full-page evidence', async () => {
    const storage = new DevMockStorageClient();
    await storage.createUploadUrl('signature.png', 'image/png', 300);
    await storage.createUploadUrl('evidence-1.jpg', 'image/jpeg', 300);

    const result = await new ServiceOrderReportGenerator(storage).generate(
      {
        folio: 'OS-TEST-001',
        serviceType: 'INSTALLATION',
        clientNameSnapshot: 'Transportes de prueba',
        scheduledAt: new Date('2026-09-02T16:00:00.000Z'),
        startedAt: new Date('2026-09-02T16:05:00.000Z'),
        completedAt: new Date('2026-09-02T18:00:00.000Z'),
        serviceAddress: 'Taller principal',
        generalNotes: 'Instalación terminada sin incidentes.',
        technician: { name: 'Técnico de prueba', workshop: 'Taller principal' },
        signature: {
          signerName: 'Cliente de prueba',
          objectKey: 'signature.png',
          signedAt: new Date('2026-09-02T18:00:00.000Z'),
        },
        units: [
          {
            label: 'Unidad 01',
            makeModel: 'Marca Modelo',
            year: 2025,
            serialNumber: 'VIN123456789',
            status: 'COMPLETED',
            equipment: [
              {
                id: 'equipment-1',
                brandSnapshot: 'Marca GPS',
                modelSnapshot: 'Modelo GPS',
                imei: '123456789012345',
                verificationStatus: 'MATCHED',
              },
            ],
            discrepancies: [],
            checklist: {
              items: [
                {
                  category: 'DASHBOARD',
                  condition: 'GOOD',
                  notes: null,
                  evidence: [
                    {
                      id: 'evidence-1',
                      objectKey: 'evidence-1.jpg',
                      createdAt: new Date('2026-09-02T17:00:00.000Z'),
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
      1,
    );

    expect(Buffer.from(result.bytes).subarray(0, 5).toString()).toBe('%PDF-');
    expect(result.bytes.byteLength).toBeGreaterThan(2_000);
    expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(
      Buffer.from(result.bytes)
        .toString('latin1')
        .match(/\/Type\s*\/Page\b/g),
    ).toHaveLength(3);
  });

  it('fails rather than silently omitting a missing image', async () => {
    const storage = new DevMockStorageClient();
    await storage.createUploadUrl('signature.png', 'image/png', 300);

    await expect(
      new ServiceOrderReportGenerator(storage).generate(
        {
          folio: 'OS-TEST-002',
          serviceType: 'REVIEW',
          clientNameSnapshot: 'Cliente',
          scheduledAt: new Date(),
          startedAt: new Date(),
          completedAt: new Date(),
          serviceAddress: null,
          generalNotes: null,
          technician: { name: 'Técnico', workshop: null },
          signature: { signerName: 'Cliente', objectKey: 'signature.png', signedAt: new Date() },
          units: [
            {
              label: 'Unidad',
              makeModel: 'Modelo',
              year: null,
              serialNumber: 'VIN',
              status: 'COMPLETED',
              equipment: [],
              discrepancies: [],
              checklist: {
                items: [
                  {
                    category: 'DASHBOARD',
                    condition: 'GOOD',
                    notes: null,
                    evidence: [{ id: 'missing', objectKey: 'missing.jpg', createdAt: new Date() }],
                  },
                ],
              },
            },
          ],
        },
        1,
      ),
    ).rejects.toThrow('No se encontró un recurso requerido');
  });
});
