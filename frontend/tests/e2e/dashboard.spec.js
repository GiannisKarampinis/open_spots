import { test, expect } from "@playwright/test";

test("employee dashboard loads", async ({ page }) => {
  await page.goto("/accounts/login");
  await page.fill('input[name="email"]', "staff@example.com");
  await page.fill('input[name="password"]', "admin123");
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL("/venues");
});
