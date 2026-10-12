import type { ReportEmailRecipients, ReportEmailResult, SendReportEmail } from '@puk/contracts';
import { api, type ApiResponse } from '@/shared/http/client.js';
export async function fetchReportEmailRecipients(orderId: string): Promise<ReportEmailRecipients> {
  return (await api.get<ApiResponse<ReportEmailRecipients>>(`/orders/${orderId}/report/recipients`))
    .data.data;
}
export async function sendReportEmail(
  orderId: string,
  input: SendReportEmail,
): Promise<ReportEmailResult> {
  return (await api.post<ApiResponse<ReportEmailResult>>(`/orders/${orderId}/report/send`, input))
    .data.data;
}
