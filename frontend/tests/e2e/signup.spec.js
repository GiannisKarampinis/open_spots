import { test, expect } from "@playwright/test";

const username = `yoda${Date.now()}`;

test("valid signup starts email verification", async ({ page }) => {
  await page.goto("/accounts/signup");

  await page.getByRole('textbox', { name: 'First name' }).fill('Yoda');
  await page.getByRole('textbox', { name: 'Last name' }).fill('Jedi');
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="email"]', `${username}@example.test`);
  await page.fill('input[name="phone_number"]', "6912345678");
  await page.getByLabel('Password', { exact: true }).fill("pass1234!");
  await page.locator('input[name="password2"]').fill("pass1234!");

  await page.getByRole("button", { name: "Create Account" }).click();

  await expect(page).toHaveURL("/accounts/confirm-code/");
});

test("signup rejects mismatched passwords without creating an account", async ({ page }) => {
  await page.goto("/accounts/signup");

  await page.getByLabel("First name").fill("Yoda");
  await page.getByLabel("Last name").fill("Jedi");
  await page.getByLabel("Username").fill(`${username}-invalid`);
  await page.getByLabel("Email").fill(`${username}-invalid@example.test`);
  await page.getByLabel("Phone number").fill("6912345678");
  await page.getByLabel("Password", { exact: true }).fill("pass1234!");
  await page.locator('input[name="password2"]').fill("different123!");
  await page.getByRole("button", { name: "Create Account" }).click();

  await expect(page).toHaveURL(/\/accounts\/signup\/?$/);
  await expect(page.locator("#password2-errors")).toContainText(
    "The two password fields didn’t match.",
  );
});
