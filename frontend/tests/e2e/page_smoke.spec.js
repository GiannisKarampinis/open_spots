const { test, expect } = require("@playwright/test");

async function login(page) {
  await page.goto("/accounts/login/");
  await page.locator('input[name="username"]').fill("test_user1");
  await page.locator('input[name="password"]').fill("pass_word1!");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL(/\/venues\/$/);
}

const publicPages = [
  {
    path: "/venues/about/",
    heading: "About Us",
  },
  {
    path: "/venues/apply-venue/",
    heading: "Apply to Register Your Venue",
  },
  {
    path: "/accounts/password-recover/",
    heading: "Password Recovery",
  },
  {
    path: "/accounts/reset-password/",
    heading: "Reset Your Password",
  },
];

for (const { path, heading } of publicPages) {
  test(`legacy page renders at ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  });
}

test("legacy profile page renders for the signed-in user", async ({ page }) => {
  await login(page);
  await page.goto("/accounts/profile/");
  await expect(page.getByRole("heading", { name: /Welcome, test_user1!/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "User Information" })).toBeVisible();
});

test("legacy reservation form renders for the seeded venue", async ({ page }) => {
  await page.goto("/venues/book/1/");
  await expect(page.getByRole("heading", { name: "Reserve at Playwright Test Venue" })).toBeVisible();
});

test("legacy venue dashboard redirects users without venue-admin access", async ({ page }) => {
  await page.goto("/venues/dashboard/1/");
  await expect(page).toHaveURL(/\/accounts\/login\/\?next=/);
});

test("legacy administration panel redirects users without venue-admin access", async ({ page }) => {
  await page.goto("/accounts/administration_panel/");
  await expect(page).toHaveURL(/\/accounts\/login\/\?next=/);
});
