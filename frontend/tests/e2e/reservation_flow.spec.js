import { test, expect } from "@playwright/test";

const venueId = 1;

function getTomorrow() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date;
}

function formatDateForRequest(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

test.use({
  reducedMotion: 'reduce',
});

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request }) => {
  const res = await request.post("/venues/test-utils/delete-reservation/", {
    form: {
      user: "test_user1",
      name: "Jim Booki",
      date: formatDateForRequest(getTomorrow()),
      time: "19:00",
      venue_id: String(venueId),
    },
  });

  expect(res.ok()).toBeTruthy();
});

test("user can make a reservation", async ({ page }) => {
  // Go to venue page and login
  await page.goto(`/venues/venue/${venueId}`);
  await page.getByRole('link', { name: 'Log in to reserve' }).click();
  await page.fill('input[name="username"]', "test_user1");
  await page.fill('input[name="password"]', "pass_word1!");
  await page.getByRole("button", { name: "Login" }).click();

  await expect(page.getByRole("link", { name: "Apply to Register a Venue" })).toBeHidden({ timeout: 15000 });

  // Reload venue page after login
  await page.goto(`/venues/venue/${venueId}`);

  // Fill STEP 1: Personal info
  await page.getByRole('textbox', { name: 'First Name:' }).fill("Jim");
  await page.getByRole('textbox', { name: 'Last Name:' }).fill("Booki");
  await page.getByRole('textbox', { name: 'Email:' }).click();
  await page.fill('input[name="email"]', "jimbooki@gmail.com");
  await page.getByRole('textbox', { name: 'Phone:' }).click();
  await page.fill('input[name="phone"]', "6971234567");

  const dateTimeButton = page.getByRole('button', { name: 'Date and time' });

  await expect(dateTimeButton).not.toHaveClass(/disabled/);
  await dateTimeButton.click();


  const reservationDate = getTomorrow();
  await page.locator(".flatpickr-alt").click();
  const dateLabel = reservationDate.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  await page.locator(`.flatpickr-day[aria-label="${dateLabel}"]`).click();

  await page.locator("#time-slot-container").getByText("19:00", { exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Number of guests:' }).click();
  await page.fill('input[name="guests"]', "3");

  const AdditionalNotesButton = page.getByRole('button', { name: 'Additional Notes' });

  await expect(AdditionalNotesButton).not.toHaveClass(/disabled/);
  await AdditionalNotesButton.click();

  await page.getByRole('textbox', { name: 'Allergies:' }).click();
  await page.getByRole('textbox', { name: 'Allergies:' }).fill('Nuts');

  // Wait for success message on the same page
  await page.getByTestId('submit-reservation').click();

  await expect(page.locator("text=Reservation Pending")).toBeVisible();
});

test("a stale unavailable time cannot be used to create a reservation", async ({ page }) => {
  await page.goto(`/venues/venue/${venueId}`);
  await page.getByRole('link', { name: 'Log in to reserve' }).click();
  await page.fill('input[name="username"]', "test_user1");
  await page.fill('input[name="password"]', "pass_word1!");
  await page.getByRole("button", { name: "Login" }).click();
  await page.goto(`/venues/venue/${venueId}`);

  await page.getByRole('textbox', { name: 'First Name:' }).fill("Jim");
  await page.getByRole('textbox', { name: 'Last Name:' }).fill("Booki");
  await page.fill('input[name="email"]', "jimbooki@gmail.com");
  await page.fill('input[name="phone"]', "6971234567");
  await page.getByRole('button', { name: 'Date and time' }).click();

  const reservationDate = getTomorrow();
  await page.locator(".flatpickr-alt").click();
  const dateLabel = reservationDate.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  await page.locator(`.flatpickr-day[aria-label="${dateLabel}"]`).click();
  await page.locator("#time-slot-container").getByText("19:00", { exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Number of guests:' }).fill("2");
  await page.getByRole('button', { name: 'Additional Notes' }).click();

  await page.locator('input[name="time"]').evaluate((input) => {
    input.value = "00:00";
  });
  await page.getByTestId('submit-reservation').click();

  await expect(page.locator(".alert-error")).toContainText(
    "Selected time is no longer available.",
  );
  await expect(page.locator("text=Reservation Pending")).toHaveCount(0);
});
