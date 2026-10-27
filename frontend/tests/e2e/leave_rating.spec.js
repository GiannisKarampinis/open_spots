import { test, expect } from "@playwright/test";

const venueId = 1;

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request }) => {
  const res = await request.post("/venues/test-utils/delete-review/", {
    form: {
      venue_id: String(venueId),
      username: "test_user1",
    },
  });
  expect(res.ok()).toBeTruthy();
});

async function loginForReview(page) {
  await page.goto(`/venues/venue/${venueId}`);
  await page.getByRole('link', { name: 'Log in to reserve' }).click();
  await page.fill('input[name="username"]', "test_user1");
  await page.fill('input[name="password"]', "pass_word1!");
  await page.getByRole("button", { name: "Login" }).click();
}

async function openReviewForm(page) {
  await page.goto(`/venues/venue/${venueId}`);
  await page.locator('#tabs').getByText('Reviews').click();
}

test("user can submit a rated review", async ({ page }) => {
  await loginForReview(page);
  await openReviewForm(page);
  await page.locator('label[for="star-4"]').click();
  await page.getByRole('textbox', { name: 'Share your experience...' }).fill('A very good E2E review.');
  await page.getByRole('button', { name: 'Submit Review' }).click();

  await page.locator('#tabs').getByText('Reviews').click();
  const submittedReview = page.locator(".review-card").filter({ hasText: "A very good E2E review." });
  await expect(submittedReview).toBeVisible();
  await expect(submittedReview.locator(".review-stars .star.full")).toHaveCount(4);
});

test("a review cannot be submitted without selecting a rating", async ({ page }) => {
  await loginForReview(page);
  await openReviewForm(page);
  await page.getByRole('textbox', { name: 'Share your experience...' }).fill('This should not be submitted.');
  await page.getByRole('button', { name: 'Submit Review' }).click();

  expect(await page.locator("#reviewForm").evaluate((form) => form.checkValidity())).toBe(false);
  await expect(page.locator(".review-card").filter({ hasText: "This should not be submitted." })).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/venues/venue/${venueId}/?$`));
});

test("a user cannot submit a second review for the same venue", async ({ page }) => {
  await loginForReview(page);
  await openReviewForm(page);
  await page.locator('label[for="star-4"]').click();
  await page.getByRole('textbox', { name: 'Share your experience...' }).fill('First review for duplicate check.');
  await page.getByRole('button', { name: 'Submit Review' }).click();
  await page.locator('#tabs').getByText('Reviews').click();
  const firstReview = page.locator(".review-card").filter({ hasText: "First review for duplicate check." });
  await expect(firstReview).toBeVisible();
  const reviewCount = await page.locator(".review-card").count();

  await page.locator('#tabs').getByText('Reviews').click();
  await page.locator('label[for="star-5"]').click();
  await page.getByRole('textbox', { name: 'Share your experience...' }).fill('Duplicate review should be rejected.');
  await page.getByRole('button', { name: 'Submit Review' }).click();

  await expect(page.locator(".messages-container")).toContainText(
    "You have already submitted a review for this venue.",
  );
  await expect(page.locator(".review-card")).toHaveCount(reviewCount);
  await expect(page.locator(".review-card").filter({ hasText: "Duplicate review should be rejected." })).toHaveCount(0);
});