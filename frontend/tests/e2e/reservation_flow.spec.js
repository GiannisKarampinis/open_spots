import { test, expect } from "@playwright/test";

test("user can make a reservation", async ({ page }) => {
  await page.goto("/venues/venue/1");
  await page.fill('input[name="First name"]', "Jim");
  await page.fill('input[name="Last name"]', "Booki");
  await page.fill('input[name="Email"]', "jimbooki@gmail.com");
  await page.fill('input[name="Phone"]', "6971234567");
  await page.fill('input[name="date"]', "2025-11-10");
  await page.fill('input[name="time"]', "19:00");
  await page.click('button[type="submit"]');
  await expect(page.locator("text=Reservation Pending")).toBeVisible();
});
