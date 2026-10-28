import { expect, test, type Page } from '@playwright/test';
import type { InventoryEquipment } from '@puk/contracts';
const id = '00000000-0000-4000-8000-000000000021';
const available: InventoryEquipment = {
  id,
  imei: '012345678901234',
  brand: 'GPS',
  model: 'Model',
  state: 'AVAILABLE',
  currentClientSheetId: null,
  currentClientName: null,
  unitLabel: null,
  unitMakeModel: null,
  unitSerialNumber: null,
  unitYear: null,
  reservedOrderId: null,
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  canDelete: true,
};
async function mockInventory(page: Page, role = 'ADMIN') {
  let items = [
    available,
    {
      ...available,
      id: '00000000-0000-4000-8000-000000000022',
      imei: '999999999999999',
      state: 'INSTALLED' as const,
      currentClientName: 'Installed client',
      unitLabel: 'Truck',
      canDelete: false,
    },
  ];
  const requests: string[] = [];
  const user = {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Inventory admin',
    email: 'test@example.invalid',
    role,
    active: true,
    orderAccessMode: 'INDIVIDUAL',
    technicianId: null,
  };
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const respond = (data: unknown) =>
      route.fulfill({ json: { data, meta: { requestId: 'inventory-e2e' } } });
    if (path.endsWith('/auth/refresh')) return respond({ accessToken: 'mock-only', user });
    if (path.endsWith('/auth/me')) return respond(user);
    requests.push(`${req.method()} ${path}`);
    if (path.endsWith('/inventory/equipment') && req.method() === 'GET') return respond(items);
    if (path.endsWith(`/inventory/equipment/${id}`) && req.method() === 'PATCH') {
      expect(req.postDataJSON()).toEqual({
        imei: '123456789012345',
        brand: 'Updated',
        model: 'Model',
        version: 1,
      });
      items = items.map((item) =>
        item.id === id ? { ...item, imei: '123456789012345', brand: 'Updated', version: 2 } : item,
      );
      return respond(items[0]);
    }
    if (path.endsWith(`/inventory/equipment/${id}`) && req.method() === 'DELETE') {
      expect(req.postDataJSON()).toEqual({ version: 2 });
      items = items.filter((item) => item.id !== id);
      return respond({ deleted: true });
    }
    if (path.endsWith('/orders')) return respond([]);
    return route.fulfill({
      status: 404,
      json: { error: { message: `Unexpected request ${path}` } },
    });
  });
  return requests;
}
test('admin searches, filters, edits and safely deletes DB equipment without Sheets', async ({
  page,
}) => {
  const requests = await mockInventory(page);
  await page.goto('/admin/equipment');
  await expect(page.getByRole('heading', { name: 'Equipos', exact: true })).toBeVisible();
  await page.getByLabel('Estado del equipo').selectOption('INSTALLED');
  await expect(page.getByRole('cell', { name: '999999999999999', exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Eliminar equipo 999999999999999', exact: true }),
  ).toHaveCount(0);
  await page.getByLabel('Estado del equipo').selectOption('');
  await page.getByLabel('Buscar equipos').fill('012345');
  await expect(page.getByRole('cell', { name: '999999999999999', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Editar equipo 012345678901234', exact: true }).click();
  const editor = page.getByRole('dialog');
  await expect(editor).toBeVisible();
  await expect(editor.getByText(/Estás editando el equipo con IMEI/)).toBeVisible();
  await expect(editor.getByText(/El IMEI nuevo debe ser único/)).toBeVisible();
  await editor.getByLabel('IMEI del equipo').fill('123456789012345');
  await editor.getByLabel('Marca del equipo').fill('Updated');
  await editor.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(editor).toBeHidden();
  await page.getByLabel('Buscar equipos').fill('');
  await expect(page.getByRole('cell', { name: '123456789012345', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Updated / Model', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Eliminar equipo 123456789012345', exact: true }).click();
  await page.getByRole('button', { name: 'Eliminar equipo', exact: true }).click();
  await expect(page.getByRole('cell', { name: '123456789012345', exact: true })).toHaveCount(0);
  expect(requests.some((entry) => entry.includes('/external/'))).toBe(false);
  await page.reload();
  await expect(page.getByRole('cell', { name: '999999999999999', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '123456789012345', exact: true })).toHaveCount(0);
});
test('technician cannot access equipment administration', async ({ page }) => {
  const requests = await mockInventory(page, 'TECHNICIAN');
  await page.goto('/admin/equipment');
  await expect(page).toHaveURL(/\/$/);
  expect(requests.some((entry) => entry.includes('/inventory/'))).toBe(false);
});
