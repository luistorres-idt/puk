import { expect, test } from '@playwright/test';

test.describe('E2E Full Application Workflow', () => {
  test('login page displays clean accessible form with inputs', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
    await expect(page.getByLabel('Correo')).toBeVisible();
    await expect(page.getByLabel('Contraseña')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  });

  test('unauthenticated protected access redirects to login preserving query params', async ({
    page,
  }) => {
    await page.goto('/orders?status=ASSIGNED&page=2');
    await expect(page).toHaveURL(/\/login\?redirect=.*orders.*status.*page/);
  });

  test('offline disclaimer and navigation structure on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/login');

    // Branding header should be visible on mobile
    await expect(page.locator('text=Bull Dog Solution').first()).toBeVisible();
  });

  test('service worker file and web manifest are served properly over http', async ({
    request,
  }) => {
    const manifestRes = await request.get('/manifest.webmanifest');
    expect(manifestRes.status()).toBe(200);
    const manifestJson = await manifestRes.json();
    expect(manifestJson.display).toBe('standalone');
    expect(manifestJson.name).toContain('Bull Dog Solution');

    const swRes = await request.get('/sw.js');
    expect(swRes.status()).toBe(200);
    const swText = await swRes.text();
    expect(swText).toContain('bds-static-v1');
    expect(swText).toContain("url.pathname.startsWith('/api/')");
  });
});
