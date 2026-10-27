const { test, expect } = require("@playwright/test");

const credentials = {
  username: "test_user1",
  password: "pass_word1!",
};

async function login(page) {
  await page.goto("/accounts/login");
  await page.locator('input[name="username"]').fill(credentials.username);
  await page.locator('input[name="password"]').fill(credentials.password);
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL(/\/$/);
}

const publicPages = [
  {
    path: "/",
    heading: "See the spot, make the move.",
  },
  {
    path: "/venues/1",
    heading: "Playwright Test Venue",
  },
  {
    path: "/venues/venue/1",
    heading: "Playwright Test Venue",
  },
  {
    path: "/accounts/login",
    heading: "Welcome Back",
  },
  {
    path: "/accounts/signup",
    heading: "Sign Up",
  },
  {
    path: "/accounts/verify-email",
    heading: "Verify Your Email",
  },
  {
    path: "/venues/about",
    heading: "About Us",
  },
  {
    path: "/accounts/password-recover",
    heading: "Password Recovery",
  },
  {
    path: "/accounts/reset-password",
    heading: "Reset Your Password",
  },
  {
    path: "/venues/apply-venue",
    heading: "Apply to Register Your Venue",
  },
  {
    path: "/venues/reservation-pending",
    heading: "Reservation Pending",
  },
];

for (const { path, heading } of publicPages) {
  test(`React page renders at ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  });
}

const authenticatedPages = [
  {
    path: "/accounts/profile",
    heading: "Profile",
  },
  {
    path: "/venues/dashboard/1",
    heading: /Venue Dashboard|Playwright Test Venue/,
  },
  {
    path: "/venues/my-reservations",
    heading: "My Reservations",
  },
  {
    path: "/venues/book/1",
    heading: /Reserve at/,
  },
  {
    path: "/venues/reservations/99999/edit",
    heading: /Edit Reservation for/,
  },
  {
    path: "/venues/reservation/99999/cancel",
    heading: "Cancel Reservation",
  },
];

for (const { path, heading } of authenticatedPages) {
  test(`authenticated React page renders at ${path}`, async ({ page }) => {
    await login(page);
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  });
}

test("React social-login completion reports the unavailable session and returns to login", async ({ page }) => {
  await page.route("**/api/v1/accounts/social/session/", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ detail: "No social session is available." }),
    });
  });

  await page.goto("/accounts/social-login-complete");
  await expect(page.getByRole("heading", { name: "Google Login" })).toBeVisible();
  await expect(page).toHaveURL(/\/accounts\/login$/, { timeout: 5_000 });
});
