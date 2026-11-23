import type {
  OrderServiceType,
  TechnicalReportOrder,
  TechnicalReportResponse,
  UpdateOrderDhlShipping,
} from '@puk/contracts';
import { api, type ApiResponse } from '@/shared/http/client.js';

export interface TechnicalReportFilterParams {
  weekOffset?: number;
  technicianId?: string;
  serviceType?: OrderServiceType;
  search?: string;
}

export async function fetchTechnicalReport(
  filters: TechnicalReportFilterParams = {},
): Promise<TechnicalReportResponse> {
  const params: Record<string, string | number> = {};
  if (filters.weekOffset !== undefined) params.weekOffset = filters.weekOffset;
  if (filters.technicianId) params.technicianId = filters.technicianId;
  if (filters.serviceType) params.serviceType = filters.serviceType;
  if (filters.search?.trim()) params.search = filters.search.trim();

  return (await api.get<ApiResponse<TechnicalReportResponse>>('/technical-reports', { params }))
    .data.data;
}

export async function updateOrderDhlShipping(
  orderId: string,
  input: UpdateOrderDhlShipping,
): Promise<TechnicalReportOrder> {
  return (
    await api.patch<ApiResponse<TechnicalReportOrder>>(
      `/technical-reports/orders/${orderId}/dhl`,
      input,
    )
  ).data.data;
}

export async function downloadTechnicalReportExcel(params: {
  weekOffset?: number;
  technicianId?: string;
}): Promise<{ blob: Blob; fileName: string }> {
  const query: Record<string, string | number> = {};
  if (params.weekOffset !== undefined) query.weekOffset = params.weekOffset;
  if (params.technicianId) query.technicianId = params.technicianId;

  const response = await api.get<Blob>('/technical-reports/export', {
    params: query,
    responseType: 'blob',
  });

  const disposition = String(response.headers['content-disposition'] ?? '');
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const fileName = match?.[1] ?? 'Reporte_Tecnico.xlsx';
  return { blob: response.data, fileName };
}
