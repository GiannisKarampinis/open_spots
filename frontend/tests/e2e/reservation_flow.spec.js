import { test, expect } from "@playwright/test";

function getTomorrowDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().split("T")[0]; // YYYY-MM-DD
}

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
  await page.getByRole('textbox', { name: 'Name:' }).click();
  await page.fill('input[name="name"]', "Jim Booki");
  await page.getByRole('textbox', { name: 'Email:' }).click();
  await page.fill('input[name="email"]', "jimbooki@gmail.com");
  await page.getByRole('textbox', { name: 'Phone:' }).click();
  await page.fill('input[name="phone"]', "6971234567");

  const dateTimeButton = page.getByRole('button', { name: 'Date and time' });

  await expect(dateTimeButton).not.toHaveClass(/disabled/);
  await dateTimeButton.click();


  const reservationDate = getTomorrowDate();
  await page.fill('input[name="date"]', reservationDate);

  await page.getByText('05:00 PM').click();
  await page.getByRole('spinbutton', { name: 'Number of guests:' }).click();
  await page.fill('input[name="guests"]', "3");

  const AdditionalNotesButton = page.getByRole('button', { name: 'Additional Notes' });

  await expect(AdditionalNotesButton).not.toHaveClass(/disabled/);
  await AdditionalNotesButton.click();

  await page.getByLabel('Special requests:').selectOption('vegetarian');
  await page.getByRole('textbox', { name: 'Allergies:' }).click();
  await page.getByRole('textbox', { name: 'Allergies:' }).fill('Nuts');

  // Wait for success message on the same page
  await page.getByTestId('submit-reservation').click();

  await expect(page.locator("text=Reservation Pending")).toBeVisible();
});
