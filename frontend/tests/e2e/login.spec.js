import { test, expect } from "@playwright/test";

test("valid credentials log the seeded user in", async ({ page }) => {
  await page.goto("/accounts/login");
  await page.fill('input[name="username"]', "test_user1");
  await page.fill('input[name="password"]', "pass_word1!");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL("/venues/");
});
