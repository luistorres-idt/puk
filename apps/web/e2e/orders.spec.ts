import { expect, test, type Page } from '@playwright/test';
import {
  ORDER_SERVICE_LABELS,
  OrderServiceTypeSchema,
  type OrderServiceType,
} from '@puk/contracts';

const orderId = '00000000-0000-4000-8000-000000000002';
const technician = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Técnico de prueba',
  workshop: 'Taller Norte',
  city: 'Ciudad Demo',
};
const unit = {
  id: '00000000-0000-4000-8000-000000000003',
  label: 'Unidad Demo',
  makeModel: 'Modelo Demo',
  serialNumber: 'SERIAL-DEMO',
  status: 'PENDING',
  year: 2026,
  equipment: [
    {
      id: 'equipment-demo',
      externalId: 'EQ-DEMO',
      externalKey: 'EQ-DEMO',
      verificationStatus: 'PENDING',
    },
  ],
};

async function mockApi(
  page: Page,
  options: {
    serviceType?: OrderServiceType;
    empty?: boolean;
    technicianFailures?: number;
    noTechnicians?: boolean;
    clientSheetsAvailable?: boolean;
    noClients?: boolean;
  } = {},
) {
  const submitted: Record<string, unknown>[] = [];
  let technicianRequests = 0;
  const order = {
    id: orderId,
    folio: 'OS-DEMO',
    status: 'DRAFT',
    serviceType: options.serviceType ?? 'INSTALLATION',
    clientSheetId: 'CLIENT-DEMO',
    clientNameSnapshot: 'Cliente de prueba',
    technician,
    scheduledAt: '2026-09-08T18:00:00.000Z',
    isHomeService: false,
    units: options.empty ? [] : [unit],
  };
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const respond = (data: unknown) =>
      route.fulfill({ json: { data, meta: { requestId: 'e2e-demo' } } });
    if (path.endsWith('/auth/refresh')) {
      return respond({
        accessToken: 'e2e-placeholder',
        user: {
          id: 'admin-demo',
          name: 'Admin de prueba',
          email: 'admin@example.invalid',
          role: 'ADMIN',
          orderAccessMode: 'INDIVIDUAL',
          technicianId: null,
        },
      });
    }
    if (path.endsWith('/technicians/selectable')) {
      technicianRequests++;
      if (technicianRequests <= (options.technicianFailures ?? 0)) {
        return route.fulfill({
          status: 503,
          json: {
            error: {
              code: 'DIRECTORY_UNAVAILABLE',
              message: 'Directorio temporalmente no disponible',
            },
          },
        });
      }
      return respond(options.noTechnicians ? [] : [technician]);
    }
    if (path.endsWith('/external/clients'))
      return route.fulfill({
        json: {
          data: options.noClients ? [] : [{ id: 'CLIENT-DEMO', name: 'Cliente de prueba' }],
          meta: {
            requestId: 'e2e-demo',
            fetchedAt: '2026-10-26T12:00:00.000Z',
            total: options.noClients ? 0 : 1,
            sheetsAvailable: options.clientSheetsAvailable ?? true,
          },
        },
      });
    if (path.endsWith('/external/refresh')) return respond({ refreshed: true });
    if (path.endsWith('/external/equipment')) return respond([]);
    if (path.endsWith('/orders') && route.request().method() === 'POST') {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      submitted.push(payload);
      return route.fulfill({ status: 201, json: { data: { ...order, ...payload }, meta: {} } });
    }
    if (path.endsWith(`/orders/${orderId}`)) return respond(order);
    if (path.endsWith('/sync')) return respond({ isFullySynced: true, operations: [] });
    if (path.endsWith('/audit')) return respond([]);
    if (path.endsWith('/report')) return respond(null);
    return route.fulfill({
      status: 404,
      json: { error: { message: `Unexpected mock request: ${path}` } },
    });
  });
  return { submitted };
}

async function reachTechnicianStep(page: Page) {
  await page.goto('/orders/new');
  await page.getByRole('textbox').first().click();
  await page.getByText('Cliente de prueba (CLIENT-DEMO)', { exact: true }).click();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByPlaceholder('ej. Camión 01, T-12...').fill('Unidad E2E');
  await page.getByPlaceholder('ej. Kenworth T680').fill('Modelo E2E');
  await page.getByPlaceholder('ej. 3AKJH567...').fill('SERIE-E2E');
  await page.getByRole('button', { name: '+ Agregar a Instalación' }).press('Enter');
  await page.getByRole('button', { name: 'Siguiente' }).press('Enter');
  await page.getByRole('button', { name: 'Siguiente' }).press('Enter');
  await expect(page.getByText('Paso 4: Técnico Asignado', { exact: true })).toBeVisible();
}

test('wizard requires a technician, retries a directory failure and submits its UUID', async ({
  page,
}) => {
  const { submitted } = await mockApi(page, { technicianFailures: 1 });
  await reachTechnicianStep(page);
  const next = page.getByRole('button', { name: 'Siguiente' });
  await expect(
    page.getByText('Directorio temporalmente no disponible', { exact: true }),
  ).toBeVisible();
  await expect(next).toBeDisabled();
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(
    page.getByText('Directorio temporalmente no disponible', { exact: true }),
  ).toHaveCount(0);
  await expect(next).toBeDisabled();
  await page.getByRole('textbox').fill('Ciudad Demo');
  await page.getByText('Técnico de prueba · Taller Norte · Ciudad Demo', { exact: true }).click();
  await next.press('Enter');
  await expect(page.getByText('Técnico de prueba', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Crear Orden de Servicio', exact: true }).press('Enter');
  await expect(page).toHaveURL(new RegExp(`/orders/${orderId}$`));
  expect(submitted).toHaveLength(1);
  expect(submitted[0]?.technicianId).toBe(technician.id);
});

test('wizard blocks an empty technician directory', async ({ page }) => {
  const { submitted } = await mockApi(page, { noTechnicians: true });
  await reachTechnicianStep(page);
  await expect(
    page.getByText('No hay técnicos activos disponibles.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  expect(submitted).toHaveLength(0);
});

test('ADMIN can register a missing installation equipment without losing the wizard unit', async ({
  page,
}) => {
  await mockApi(page);
  let registration: Record<string, unknown> | undefined;
  const inventoryId = '11111111-1111-4111-8111-111111111112';
  await page.route('**/api/v1/inventory/equipment', async (route) => {
    registration = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      json: {
        data: {
          source: 'DB',
          inventoryEquipmentId: inventoryId,
          externalKey: `DB:${inventoryId}`,
          id: inventoryId,
          imei: '123456789012345',
          brand: 'GPS',
          model: 'Nuevo',
          line: null,
          iccid: null,
          carrier: null,
          condition: null,
          currentClientSheetId: null,
          currentClient: null,
          serviceStatus: 'DISPONIBLE',
          unit: null,
          unitMakeModel: null,
          unitYear: null,
          unitSerialNumber: null,
          serviceType: null,
          rowNumber: 0,
          hasValidIdentity: true,
          rawValues: {},
        },
        meta: {},
      },
    });
  });

  await page.goto('/orders/new');
  await page.getByRole('textbox').first().click();
  await page.getByText('Cliente de prueba (CLIENT-DEMO)', { exact: true }).click();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByPlaceholder('ej. Camión 01, T-12...').fill('Unidad Preservada');
  await page.getByPlaceholder('ej. Kenworth T680').fill('Modelo de unidad');
  await page.getByPlaceholder('ej. 3AKJH567...').fill('SERIE-PRESERVADA');
  const registrationButton = page.getByRole('button', { name: 'Registrar equipo nuevo' });
  await registrationButton.focus();
  await registrationButton.press('Enter');
  await page.getByPlaceholder('Marca', { exact: true }).fill('GPS');
  await page.getByPlaceholder('Modelo', { exact: true }).fill('Nuevo');
  await page.getByPlaceholder('IMEI', { exact: true }).fill('123456789012345');
  await page.getByRole('button', { name: 'Guardar equipo' }).press('Enter');

  await expect.poll(() => registration?.['imei']).toBe('123456789012345');
  expect(registration).toMatchObject({
    brand: 'GPS',
    model: 'Nuevo',
    clientSheetId: 'CLIENT-DEMO',
    clientName: 'Cliente de prueba',
    serviceType: 'INSTALLATION',
  });
  await expect(page.getByPlaceholder('ej. Camión 01, T-12...')).toHaveValue('Unidad Preservada');
  await page.getByRole('button', { name: '+ Agregar a Instalación' }).press('Enter');
  await expect(page.getByText('Unidad Preservada', { exact: true })).toBeVisible();
});

for (const serviceType of OrderServiceTypeSchema.options) {
  test(`draft detail preserves existing items and allows additions: ${serviceType}`, async ({
    page,
  }) => {
    await mockApi(page, { serviceType });
    await page.goto(`/orders/${orderId}`);
    await expect(
      page.getByText(ORDER_SERVICE_LABELS[serviceType], { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText('Unidad Demo', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Eliminar', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Quitar', exact: true })).toBeVisible();
    for (const name of ['Agregar Unidad', 'Asignar Equipo']) {
      await expect(page.getByRole('button', { name })).toHaveCount(1);
    }
  });

  test(`empty draft allows both unit entry points: ${serviceType}`, async ({ page }) => {
    await mockApi(page, { serviceType, empty: true });
    await page.goto(`/orders/${orderId}`);
    await expect(
      page.getByText('No hay unidades registradas en esta orden.', { exact: true }),
    ).toBeVisible();
    for (const name of ['Agregar Unidad', 'Registrar Primera Unidad']) {
      await expect(page.getByRole('button', { name })).toHaveCount(1);
    }
  });
}

test('order detail keeps extracted tabs and Add Unit modal connected', async ({ page }) => {
  await mockApi(page);
  await page.goto(`/orders/${orderId}`);

  await page.getByText('Evidencias y Firma', { exact: true }).click();
  await expect(page.getByText('Checklist y Evidencias por Unidad')).toBeVisible();
  await expect(page.getByText('No se ha registrado firma en esta orden.')).toBeVisible();

  await page.getByText('Sincronización Sheets', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Operaciones de Sincronización' })).toBeVisible();
  await expect(
    page.getByText('No existen operaciones de sincronización para esta orden.'),
  ).toBeVisible();

  await page.getByText('Unidades y Equipos', { exact: true }).click();
  await page.getByRole('button', { name: 'Agregar Unidad' }).first().click();
  await expect(page.getByText('Agregar Unidad a la Orden', { exact: true })).toBeVisible();
  await expect(page.getByText('Tipo de Servicio', { exact: true }).last()).toBeVisible();
});

test('order units tab forwards equipment actions to the parent', async ({ page }) => {
  await mockApi(page);
  let removedEquipment = false;
  await page.route(
    `**/api/v1/orders/${orderId}/units/${unit.id}/equipment/equipment-demo`,
    async (route) => {
      if (route.request().method() === 'DELETE') {
        removedEquipment = true;
        await route.fulfill({ json: { data: { deleted: true }, meta: {} } });
        return;
      }
      await route.fallback();
    },
  );

  await page.goto(`/orders/${orderId}`);
  await page.getByRole('button', { name: 'Quitar', exact: true }).click();
  await expect.poll(() => removedEquipment).toBe(true);
  await expect(page.getByText('Equipo removido de la unidad.')).toBeVisible();

  await page.getByRole('button', { name: 'Asignar Equipo' }).click();
  await expect(page.getByText('Asignar Equipo del Catálogo')).toBeVisible();
});

const partialClientCatalogNotice =
  'Google Sheets no está disponible por el momento. Solo se muestran clientes guardados en el sistema.';

test('client catalog outage shows a quiet note while stored clients stay selectable, and recovery clears it', async ({
  page,
}) => {
  const options = { clientSheetsAvailable: false };
  await mockApi(page, options);
  await page.goto('/orders/new');
  const notice = page.getByRole('status').filter({ hasText: partialClientCatalogNotice });
  await expect(notice).toBeVisible();
  await expect(notice).toHaveClass(/text-xs/);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('textbox').first().click();
  await page.getByText('Cliente de prueba (CLIENT-DEMO)', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Siguiente' })).toBeEnabled();
  options.clientSheetsAvailable = true;
  await page.getByRole('button', { name: 'Recargar', exact: true }).click();
  await expect(notice).toHaveCount(0);
});

test('healthy client catalog has no degraded notice', async ({ page }) => {
  await mockApi(page);
  await page.goto('/orders/new');
  await page.getByRole('textbox').first().click();
  await expect(page.getByText('Cliente de prueba (CLIENT-DEMO)', { exact: true })).toBeVisible();
  await expect(page.getByText(partialClientCatalogNotice, { exact: true })).toHaveCount(0);
});

test('an empty stored client catalog still explains the Sheets outage', async ({ page }) => {
  await mockApi(page, { clientSheetsAvailable: false, noClients: true });
  await page.goto('/orders/new');
  await expect(
    page.getByRole('status').filter({ hasText: partialClientCatalogNotice }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
});
