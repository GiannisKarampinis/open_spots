import { test, expect } from "@playwright/test";

test("user signup and login flow", async ({ page }) => {
  await page.goto("/accounts/signup");
  await page.fill('input[name="email"]', "e2euser@example.com");
  await page.fill('input[name="password1"]', "pass1234!");
  await page.fill('input[name="password2"]', "pass1234!");
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/accounts\/verify/);
});
