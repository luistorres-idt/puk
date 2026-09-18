import { expect, test } from '@playwright/test';

test('theme toggle is keyboard accessible and persists across reloads', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/login');
  const toggle = page.getByRole('switch', { name: 'Modo oscuro' });
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('main')).toHaveCSS('background-color', 'rgb(15, 23, 42)');
  await expect(page.locator('.n-card')).toHaveCSS('background-color', 'rgb(30, 41, 59)');
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toHaveCSS(
    'color',
    'rgb(241, 245, 249)',
  );
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('uses the system dark preference until the user chooses light', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/login');
  const toggle = page.getByRole('switch', { name: 'Modo oscuro' });
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
});

test('header toggle updates authenticated content and mobile navigation', async ({
  page,
  isMobile,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/refresh')) {
      return route.fulfill({
        json: {
          data: {
            accessToken: 'e2e-placeholder',
            user: {
              id: 'admin-demo',
              name: 'Admin de prueba',
              email: 'admin@example.invalid',
              role: 'ADMIN',
              orderAccessMode: 'INDIVIDUAL',
              technicianId: null,
            },
          },
          meta: {},
        },
      });
    }
    return route.fulfill({
      json: { data: [], meta: { pagination: { total: 0, page: 1, pageSize: 50 } } },
    });
  });
  await page.goto('/');
  const toggle = page.getByRole('switch', { name: 'Modo oscuro' });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.locator('header')).toHaveCSS('background-color', 'rgba(30, 41, 59, 0.95)');
  await expect(page.locator('footer')).toHaveCSS('background-color', 'rgb(30, 41, 59)');
  if (isMobile) {
    await page.getByRole('button', { name: 'Menú principal' }).click();
  }
  await page.getByRole('link', { name: 'Órdenes', exact: true }).click();
  await expect(page).toHaveURL(/\/orders$/);
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
