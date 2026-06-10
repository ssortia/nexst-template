import { expect, test } from '@playwright/test';

import { uniqueEmail } from './helpers/api';

test.describe('Ошибка входа', () => {
  test('показывает сообщение об ошибке при неверных учётных данных', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Email').fill(uniqueEmail('no-such-user'));
    await page.getByLabel('Пароль').fill('wrong-password123');
    await page.getByRole('button', { name: 'Войти' }).click();

    await expect(page.getByText('Неверный email или пароль')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });
});
