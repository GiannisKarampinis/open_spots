import { test, expect } from "@playwright/test";

test("employee dashboard loads", async ({ page }) => {
  await page.goto("/accounts/login");
  await page.fill('input[name="username"]', "test_user2");
  await page.fill('input[name="password"]', "pass_word2!");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL("/accounts/signup/");
});
