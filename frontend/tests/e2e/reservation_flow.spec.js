import { test, expect } from "@playwright/test";

test("user can make a reservation", async ({ page }) => {
  await page.goto("/venues/venue/1");
  await page.fill('input[name="first_name"]', "Jim");
  await page.fill('input[name="last_name"]', "Booki");
  await page.fill('input[name="email"]', "jimbooki@gmail.com");
  await page.fill('input[name="phone"]', "6971234567");
  await page.fill('input[name="date"]', Date.now() + 86400000); // Tomorrow's date");
  await page.fill('input[name="time"]', "19:00");
  await page.fill('input[name="guests"]', "3");
  await page.getByRole("button", { name: "Sumbit Reservation" }).click();
  await expect(page.locator("text=Reservation Pending")).toBeVisible();
});
