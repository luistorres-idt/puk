import { expect, test } from '@playwright/test';

test('redirects anonymous visitors to login', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveURL(/\/login\?redirect=/);
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  await expect(page.getByLabel('Correo')).toBeVisible();
});
