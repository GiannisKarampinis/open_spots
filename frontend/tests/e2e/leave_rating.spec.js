import { test, expect } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  await request.post("/venues/test-utils/delete-review/", {
    form: {
      venue_id: "1",
      username: "test_user1",
    },
  });
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

  // Click Reviews tab and leave a rating
  await page.locator('#tabs').getByText('Reviews').click();
  await page.getByText('★').nth(1).click();
  await page.getByRole('textbox', { name: 'Share your experience...' }).click();
  await page.getByRole('textbox', { name: 'Share your experience...' }).fill('It was a very good experience overall!!');
  
  // Submit the review and verify it appears
  await page.getByRole('button', { name: 'Submit Review' }).click();
  await page.locator('#tabs').getByText('Reviews').click();

  await expect(page.locator('text=It was a very good experience')).toBeVisible();

  // Click Reviews tab and leave a rating
  await page.locator('#tabs').getByText('Reviews').click();
  await page.getByText('★').nth(1).click();
  await page.getByRole('textbox', { name: 'Share your experience...' }).click();
  await page.getByRole('textbox', { name: 'Share your experience...' }).fill('It was a very good experience overall!!');
  
  // Submit the review and verify IntegrityError appears
  await page.getByRole('button', { name: 'Submit Review' }).click();

  await expect(page.locator('text=IntegrityError at /venues/')).toBeVisible();

});