import { expect, test } from '@playwright/test';

test('administrator can replay a read-only contextual guide on desktop and mobile', async ({
  page,
}) => {
  const businessMutations: string[] = [];
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (
      !path.includes('/auth/') &&
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method())
    ) {
      businessMutations.push(`${request.method()} ${path}`);
    }
    if (path.endsWith('/orders')) {
      return route.fulfill({
        json: {
          data: [],
          meta: { requestId: 'onboarding-e2e', pagination: { total: 0, page: 1, pageSize: 50 } },
        },
      });
    }
    const user = {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Admin de prueba',
      email: 'admin@example.invalid',
      role: 'ADMIN',
      active: true,
      orderAccessMode: 'INDIVIDUAL',
      technicianId: null,
    };
    const data = path.endsWith('/auth/refresh')
      ? { accessToken: 'mock-only', user }
      : path.endsWith('/auth/me')
        ? user
        : [];
    return route.fulfill({ json: { data, meta: {} } });
  });

  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Ayuda: ver recorrido' })).toBeVisible();
  await page.getByRole('button', { name: 'Ayuda: ver recorrido' }).click();
  await expect(page.locator('.driver-popover')).toContainText('Tu guía de administración');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.locator('.driver-popover')).toContainText('Muévete por el sistema');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.locator('.driver-popover')).toContainText('Prepara un servicio nuevo');
  await page.getByRole('button', { name: 'Cerrar guía' }).click();

  expect(businessMutations).toEqual([]);
  await expect(page.getByRole('button', { name: 'Ayuda: ver recorrido' })).toBeVisible();
});
