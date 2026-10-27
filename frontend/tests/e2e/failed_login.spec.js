import { test, expect } from "@playwright/test";

test("login rejects an incorrect password for an existing user", async ({ page }) => {
  await page.goto("/accounts/login");
  await page.fill('input[name="username"]', "test_user1");
  await page.fill('input[name="password"]', "incorrect-password");
  await page.getByRole("button", { name: "Login" }).click();

  await expect(page).toHaveURL(/\/accounts\/login\/?$/);
  await expect(page.locator(".alert-error")).toContainText("Incorrect password. Please try again.");
  await expect(page.locator('input[name="password"]')).toBeVisible();
});
