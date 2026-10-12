import { expect, test, type Page } from '@playwright/test';
const orderId = '00000000-0000-4000-8000-000000000010';
const reportId = '00000000-0000-4000-8000-000000000020';
const clientId = '00000000-0000-4000-8000-000000000030';
const originalId = '00000000-0000-4000-8000-000000000040';
const addedId = '00000000-0000-4000-8000-000000000050';
async function mockApi(page: Page, configured = true) {
  const sent: Array<{ reportId: string; recipientIds: string[] }> = [];
  const requests: string[] = [];
  const client = {
    id: clientId,
    clientSheetId: 'C1',
    name: 'Test client',
    emails: [{ id: originalId, email: 'one@example.invalid' }],
  };
  const user = {
    id: clientId,
    name: 'Test admin',
    email: 'admin@example.invalid',
    role: 'ADMIN',
    active: true,
    orderAccessMode: 'INDIVIDUAL',
    technicianId: null,
  };
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const respond = (data: unknown, status = 200) =>
      route.fulfill({ status, json: { data, meta: { requestId: 'report-email-test' } } });
    requests.push(`${request.method()} ${path}`);
    if (path.endsWith('/auth/refresh')) return respond({ accessToken: 'mock-only', user });
    if (path.endsWith('/auth/me')) return respond(user);
    if (path.endsWith(`/orders/${orderId}`))
      return respond({
        id: orderId,
        folio: 'OS-TEST',
        status: 'COMPLETED',
        serviceType: 'INSTALLATION',
        clientSheetId: 'C1',
        clientNameSnapshot: 'Test client',
        technician: { id: clientId, name: 'Test technician', workshop: null },
        scheduledAt: '2026-09-08T18:00:00Z',
        units: [],
        version: 1,
      });
    if (path.endsWith('/report/recipients')) return respond({ client, configured });
    if (path.endsWith('/report/send')) {
      sent.push(request.postDataJSON() as { reportId: string; recipientIds: string[] });
      return respond({
        reportId,
        version: 2,
        attemptId: clientId,
        status: 'PARTIAL_FAILURE',
        results: [
          {
            recipientId: originalId,
            email: 'one@example.invalid',
            status: 'SENT',
            messageId: 'mock-message',
          },
          {
            recipientId: addedId,
            email: 'new@example.invalid',
            status: 'FAILED',
            failureCode: 'DELIVERY_UNCONFIRMED',
          },
        ],
      });
    }
    if (path.endsWith(`/clients/${clientId}/emails`)) {
      const recipient = { id: addedId, email: 'new@example.invalid' };
      client.emails.push(recipient);
      return respond(recipient, 201);
    }
    if (path.endsWith('/reports')) return respond([]);
    if (path.endsWith('/report'))
      return respond({
        id: reportId,
        orderId,
        version: 2,
        status: 'READY',
        createdAt: '2026-09-08T18:00:00Z',
      });
    if (path.endsWith('/audit')) return respond([]);
    if (path.endsWith('/sync')) return respond({ operations: [], isFullySynced: true });
    return route.fulfill({
      status: 404,
      json: { error: { message: `Unexpected mock request: ${path}` } },
    });
  });
  return { sent, requests };
}
test('explicit report sending selects recipients, adds email inline and reports partial outcomes', async ({
  page,
}) => {
  const { sent, requests } = await mockApi(page);
  await page.goto(`/orders/${orderId}`);
  await page.getByRole('button', { name: 'Enviar reporte', exact: true }).click();
  await expect(page.getByText('Test client (C1)', { exact: true })).toBeVisible();
  expect(sent).toHaveLength(0);
  await expect(
    page.getByRole('button', { name: 'Enviar PDF seleccionado', exact: true }),
  ).toBeDisabled();
  await page.getByTestId('report-recipient-select').click();
  await page.getByText('one@example.invalid', { exact: true }).click();
  await page.getByLabel('Nuevo destinatario').fill('New@Example.invalid');
  await page.getByRole('button', { name: 'Agregar destinatario', exact: true }).click();
  await expect(
    page.getByTestId('report-recipient-select').getByText('new@example.invalid', { exact: true }),
  ).toBeVisible();
  expect(sent).toHaveLength(0);
  await page.getByRole('button', { name: 'Enviar PDF seleccionado', exact: true }).click();
  await expect(
    page.getByText('¿Enviar la versión 2 a one@example.invalid, new@example.invalid?', {
      exact: true,
    }),
  ).toBeVisible();
  expect(sent).toHaveLength(0);
  await page.getByRole('button', { name: 'Confirmar envío', exact: true }).click();
  await expect(
    page
      .getByRole('region', { name: 'Resultado del envío' })
      .getByText('one@example.invalid', { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Resultado del envío' })
      .getByText('new@example.invalid', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Resultado del envío' }).getByText('Aceptado por Gmail'),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Resultado del envío' }).getByText('No confirmado'),
  ).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Resultado del envío' })
      .getByText(/Revisa la carpeta Enviados antes de reintentar/),
  ).toBeVisible();
  expect(sent).toEqual([{ reportId, recipientIds: [originalId, addedId] }]);
  expect(requests.some((request) => /report\/(file|download)/.test(request))).toBe(false);
});
test('unconfigured Gmail leaves download available and sending disabled', async ({ page }) => {
  const { sent } = await mockApi(page, false);
  await page.goto(`/orders/${orderId}`);
  await expect(page.getByRole('button', { name: 'Descargar PDF', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Enviar reporte', exact: true }).click();
  await expect(
    page.getByText('El envío por Gmail no está configurado.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Enviar PDF seleccionado', exact: true }),
  ).toBeDisabled();
  expect(sent).toHaveLength(0);
});
