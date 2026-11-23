import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TechnicalReportResponse } from '@puk/contracts';
import * as api from './api.js';
import { useTechnicalReports } from './useTechnicalReports.js';

vi.mock('./api.js', () => ({
  fetchTechnicalReport: vi.fn(),
  updateOrderDhlShipping: vi.fn(),
  downloadTechnicalReportExcel: vi.fn(),
}));

const sampleResponse: TechnicalReportResponse = {
  window: {
    weekOffset: 0,
    isoWeek: 47,
    start: '2026-11-18T07:00:00.000Z',
    end: '2026-11-25T06:59:59.999Z',
    cutoffWeekday: 2,
    timeZone: 'America/Hermosillo',
  },
  summary: {
    totalOrders: 1,
    totalTechnicians: 1,
    totalEquipment: 2,
    baseCost: 2400,
    travelExpenses: 350,
    dhlShippingCost: 280,
    grandTotal: 3030,
    currency: 'MXN',
  },
  groups: [
    {
      technicianId: '00000000-0000-4000-8000-000000000001',
      technicianName: 'Carlos Méndez',
      legalName: 'Taller GPS Sonora S.A.',
      taxData: 'TGS190412AB3',
      externalKey: 'TEC-0001',
      orderCount: 1,
      equipmentCount: 2,
      baseCost: 2400,
      travelExpenses: 350,
      dhlShippingCost: 280,
      total: 3030,
      orders: [
        {
          id: '00000000-0000-4000-8000-000000000010',
          folio: 'OS-2026-0421',
          isoWeek: 47,
          scheduledAt: '2026-11-19T18:00:00.000Z',
          completedAt: '2026-11-19T20:00:00.000Z',
          status: 'COMPLETED',
          serviceType: 'INSTALLATION',
          serviceLabel: 'Instalación',
          clientName: 'Transportes del Pacífico',
          technicianId: '00000000-0000-4000-8000-000000000001',
          technicianName: 'Carlos Méndez',
          technicianLegalName: 'Taller GPS Sonora S.A.',
          technicianTaxData: 'TGS190412AB3',
          baseCost: 2400,
          travelExpenses: 350,
          dhlShippingCost: 280,
          total: 3030,
          currency: 'MXN',
          notes: 'Incluye arneses.',
          unitsCount: 1,
          equipmentCount: 2,
          units: [
            {
              id: '00000000-0000-4000-8000-000000000020',
              label: 'ECO-201',
              serialNumber: 'SN-201',
              serviceType: 'INSTALLATION',
              equipmentIdentifiers: ['864291045900111', '864291045900112'],
            },
          ],
        },
      ],
    },
  ],
};

describe('useTechnicalReports composable', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.fetchTechnicalReport).mockResolvedValue(sampleResponse);
  });

  it('loads weekly report and navigates weeks', async () => {
    const state = useTechnicalReports();
    await state.load();
    expect(state.report.value?.summary.grandTotal).toBe(3030);
    expect(state.allOrders.value).toHaveLength(1);

    await state.changeWeek(-1);
    expect(state.weekOffset.value).toBe(-1);
    expect(api.fetchTechnicalReport).toHaveBeenLastCalledWith({ weekOffset: -1 });
  });

  it('updates DHL shipping cost and refreshes report totals', async () => {
    const order = sampleResponse.groups[0]!.orders[0]!;
    vi.mocked(api.updateOrderDhlShipping).mockResolvedValue({
      ...order,
      dhlShippingCost: 400,
      total: 3150,
    });

    const state = useTechnicalReports();
    const updated = await state.saveDhlShipping(order.id, 400);
    expect(updated?.dhlShippingCost).toBe(400);
    expect(api.fetchTechnicalReport).toHaveBeenCalledOnce();
  });
});
