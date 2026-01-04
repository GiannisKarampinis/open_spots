import { test, expect } from "@playwright/test";

test.use({
  reducedMotion: 'reduce',
});

test("user can make a reservation", async ({ page }) => {
  // Go to venue page and login
  await page.goto("/venues/venue/1");
  await page.getByRole('link', { name: 'Log in to reserve' }).click();
  await page.fill('input[name="username"]', "test_user1");
  await page.fill('input[name="password"]', "pass_word1!");
  await page.getByRole("button", { name: "Login" }).click();

  // Reload venue page after login
  await page.goto("/venues/venue/1");

  // Fill STEP 1: Personal info
  await page.fill('input[name="name"]', "Jim Booki");
  await page.fill('input[name="email"]', "jimbooki@gmail.com");
  await page.fill('input[name="phone"]', "6971234567");

  await page.getByRole('button', { name: 'Date and time' }).click();

  await page.fill('input[name="date"]', "2026-01-31");
  await page.getByText('04:00 PM').click();
  await page.fill('input[name="guests"]', "3");

  await page.getByRole('button', { name: 'Additional Notes' }).click();

  // Wait for success message on the same page
  await page.getByTestId('submit-reservation').click();
});
