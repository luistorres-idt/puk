import { expect, test } from '@playwright/test';

test('theme toggle is keyboard accessible and persists across reloads', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/login');
  const toggle = page.getByRole('switch');
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-label', 'Cambiar a modo oscuro');
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(toggle).toHaveAttribute('aria-label', 'Cambiar a modo claro');
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
  await expect(toggle).toHaveAttribute('aria-label', 'Cambiar a modo oscuro');
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('uses the system dark preference until the user chooses light', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/login');
  const toggle = page.getByRole('switch');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(toggle).toHaveAttribute('aria-label', 'Cambiar a modo claro');
  await toggle.click();
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
});

test('header toggle updates authenticated content and mobile navigation', async ({
  page,
  isMobile,
}) => {
  if (!isMobile) {
    await page.setViewportSize({ width: 1280, height: 720 });
  }
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
  const toggle = page.getByRole('switch');
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect
    .poll(() =>
      page.locator('header').evaluate((header) => {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas 2D context is unavailable');
        context.fillStyle = getComputedStyle(header).backgroundColor;
        context.fillRect(0, 0, 1, 1);
        return Array.from(context.getImageData(0, 0, 1, 1).data);
      }),
    )
    .toEqual([30, 41, 59, 242]);
  await expect(page.locator('footer')).toHaveCSS('background-color', 'rgb(30, 41, 59)');
  const desktopNavigation = page
    .locator('.app-header nav[aria-label="Navegación principal"]')
    .first();
  if (isMobile || !(await desktopNavigation.isVisible())) {
    await page.getByRole('button', { name: 'Menú principal' }).click();
  }
  await page.getByRole('link', { name: 'Órdenes', exact: true }).click();
  await expect(page).toHaveURL(/\/orders$/);
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  const hasNoHorizontalOverflow = () =>
    page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  await expect.poll(hasNoHorizontalOverflow).toBe(true);
  if (!isMobile) {
    await page.setViewportSize({ width: 1024, height: 720 });
    await expect.poll(hasNoHorizontalOverflow).toBe(true);
  }
});
