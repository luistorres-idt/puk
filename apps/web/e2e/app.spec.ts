import { expect, test } from '@playwright/test';

test('shows the application foundation', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Órdenes de servicio' })).toBeVisible();
  await expect(page.getByText('Base del sistema lista')).toBeVisible();
});
