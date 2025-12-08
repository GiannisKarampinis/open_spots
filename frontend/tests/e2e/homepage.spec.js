import { test, expect } from '@playwright/test';

test('homepage loads and shows title', async ({ page }) => {
  await page.goto('/venues'); // homepage
  await expect(page).toHaveTitle(/Browse Venues/i); // match real title
});

