import { test, expect } from "@playwright/test";

test("user signup and login flow", async ({ page }) => {
  await page.goto("/accounts/signup");
  await page.fill('input[name="Username"]', "yoda");
  await page.fill('input[name="Email address"]', "yoda@starwars.com");
  await page.fill('input[name="Password"]', "pass1234!");
  await page.fill('input[name="Password confirmation"]', "pass1234!");
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL("/accounts/login");
});
