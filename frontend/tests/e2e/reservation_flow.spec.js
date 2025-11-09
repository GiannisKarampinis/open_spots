import { test, expect } from "@playwright/test";

test("user can make a reservation", async ({ page }) => {
  await page.goto("/venues");
  await page.click("text=Reserve Table");
  await page.fill('input[name="name"]', "John Doe");
  await page.fill('input[name="date"]', "2025-11-10");
  await page.fill('input[name="time"]', "19:00");
  await page.click('button[type="submit"]');
  await expect(page.locator("text=Reservation Confirmed")).toBeVisible();
});
