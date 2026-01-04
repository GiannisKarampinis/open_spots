import { test, expect } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  // Reset DB before every test run
  await request.get("/test/delete-yoda/");
});

test("user signup and login flow", async ({ page }) => {
  await page.goto("/accounts/signup");

  await page.fill('input[name="username"]', "yoda");
  await page.fill('input[name="email"]', "yoda@starwars.com");
  await page.fill('input[name="phone_number"]', "6912345678");
  await page.fill('input[name="password1"]', "pass1234!");
  await page.fill('input[name="password2"]', "pass1234!");

  // Your form uses <input type="submit" value="Create Account">
  await page.getByRole("button", { name: "Create Account" }).click();

  // Confirm redirect
  await expect(page).toHaveURL("/accounts/confirm-code/");
});
