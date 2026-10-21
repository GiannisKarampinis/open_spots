import { test, expect } from "@playwright/test";

const username = `yoda${Date.now()}`;

test("user signup and login flow", async ({ page }) => {
  await page.goto("/accounts/signup");

  await page.getByRole('textbox', { name: 'First name' }).fill('Yoda');
  await page.getByRole('textbox', { name: 'Last name' }).fill('Jedi');
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="email"]', `${username}@example.test`);
  await page.fill('input[name="phone_number"]', "6912345678");
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill("pass1234!");
  await page.getByRole('textbox', { name: 'Password confirmation' }).fill("pass1234!");

  // Your form uses <input type="submit" value="Create Account">
  await page.getByRole("button", { name: "Create Account" }).click();

  // Confirm redirect
  await expect(page).toHaveURL("/accounts/confirm-code/");
});
