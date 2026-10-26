import { expect, test, type Page } from '@playwright/test';
import type { Client } from '@puk/contracts';

const clientId = '00000000-0000-4000-8000-000000000011';
const localClientKey = `DB:${clientId}`;
const emailId = '00000000-0000-4000-8000-000000000012';
async function mockClients(page: Page, role: 'ADMIN' | 'TECHNICIAN' = 'ADMIN') {
  let client: Client | undefined;
  const requests: string[] = [];
  const user = {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Test user',
    email: 'test@example.invalid',
    role,
    active: true,
    orderAccessMode: 'INDIVIDUAL',
    technicianId: null,
  };
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const respond = (data: unknown, status = 200) =>
      route.fulfill({ status, json: { data, meta: { requestId: 'client-e2e' } } });
    if (path.endsWith('/auth/refresh')) return respond({ accessToken: 'mock-only', user });
    if (path.endsWith('/auth/me')) return respond(user);
    requests.push(`${method} ${path}`);
    if (path.endsWith('/external/clients'))
      return route.fulfill({ status: 503, json: { error: { message: 'Sheets offline' } } });
    if (path.endsWith('/clients') && method === 'GET') return respond(client ? [client] : []);
    if (path.endsWith('/clients') && method === 'POST') {
      const body = request.postDataJSON() as { name: string };
      expect(body).toEqual({ name: 'Local client' });
      client = { id: clientId, clientSheetId: localClientKey, ...body, emails: [] };
      return respond(client, 201);
    }
    if (path.endsWith(`/clients/${clientId}`) && method === 'PATCH') {
      client!.name = (request.postDataJSON() as { name: string }).name;
      return respond(client);
    }
    if (path.endsWith(`/clients/${clientId}/emails`) && method === 'POST') {
      const email = {
        id: emailId,
        email: (request.postDataJSON() as { email: string }).email.trim().toLowerCase(),
      };
      client!.emails.push(email);
      return respond(email, 201);
    }
    if (path.endsWith(`/clients/${clientId}/emails/${emailId}`) && method === 'PATCH') {
      const email = {
        id: emailId,
        email: (request.postDataJSON() as { email: string }).email.trim().toLowerCase(),
      };
      client!.emails = [email];
      return respond(email);
    }
    if (path.endsWith(`/clients/${clientId}/emails/${emailId}`) && method === 'DELETE') {
      client!.emails = [];
      return respond({ deleted: true });
    }
    if (path.endsWith('/orders') && method === 'GET') return respond([]);
    return route.fulfill({
      status: 404,
      json: { error: { message: `Unexpected mock request: ${method} ${path}` } },
    });
  });
  return requests;
}

test('administrator creates a local client and manages recipients without Sheets access', async ({
  page,
}) => {
  const requests = await mockClients(page);
  await page.goto('/admin/clients');
  await expect(page.getByRole('heading', { name: 'Clientes y correos' })).toBeVisible();
  await page.getByLabel('Nombre del nuevo cliente').fill('Local client');
  await page.getByRole('button', { name: 'Registrar', exact: true }).click();
  await expect(
    page.getByText(`Identificador del cliente: ${localClientKey}.`, { exact: false }),
  ).toBeVisible();
  await page.getByLabel('Nombre del cliente', { exact: true }).fill('Renamed client');
  await page.getByRole('button', { name: 'Guardar nombre', exact: true }).click();
  await expect(page.getByText(`Renamed client (${localClientKey})`, { exact: true })).toBeVisible();
  await page.getByLabel('Correo del cliente').fill(' Recipient@Example.invalid ');
  await page.getByRole('button', { name: 'Agregar correo', exact: true }).click();
  await expect(
    page.getByRole('cell', { name: 'recipient@example.invalid', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await page.getByLabel('Correo del cliente').fill('Updated@Example.invalid');
  await page.getByRole('button', { name: 'Guardar correo', exact: true }).click();
  await expect(
    page.getByRole('cell', { name: 'updated@example.invalid', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(
    page.getByText('El cliente todavía no tiene correos.', { exact: true }),
  ).toBeVisible();
  expect(requests.filter((request) => request.includes('/external/'))).toEqual([]);
  await page.reload();
  await expect(page.getByText(`Renamed client (${localClientKey})`, { exact: true })).toBeVisible();
  expect(requests).toContain(`DELETE /api/v1/clients/${clientId}/emails/${emailId}`);
});

test('individual technician cannot open client administration', async ({ page }) => {
  const requests = await mockClients(page, 'TECHNICIAN');
  await page.goto('/admin/clients');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Clientes y correos' })).toHaveCount(0);
  expect(requests.some((request) => request.includes('/clients'))).toBe(false);
});
