const { test, expect } = require("@playwright/test");

const credentials = {
  username: "test_user1",
  password: "pass_word1!",
};

async function loginWithMockedSession(page) {
  const user = { username: credentials.username, full_name: "Test User" };
  await page.route("**/api/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });
  await page.route("**/api/v1/csrf/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ csrfToken: "react-smoke-csrf" }),
    });
  });
  await page.route("**/api/v1/accounts/login/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ access: "react-smoke-access", user }),
    });
  });
  await page.route("**/api/token/refresh/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ access: "react-smoke-refreshed-access" }),
    });
  });
  await page.route("**/api/v1/accounts/navigation/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(user),
    });
  });
  await page.route("**/api/v1/venues/owned/", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "null" });
  });

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

test("React password recovery form submits and navigates to verification", async ({ page }) => {
  await page.route("**/api/v1/accounts/password/recover/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ challenge_id: "smoke-recovery", detail: "Verification code sent." }),
    });
  });

  await page.goto("/accounts/password-recover");
  await page.getByLabel("Email").fill("ada@example.com");
  await page.getByRole("button", { name: "Send Verification Code" }).click();
  await page.waitForURL(/\/accounts\/verify-email$/);
});

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
    await loginWithMockedSession(page);
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

async function mockReservation(page, reservationId, cancelHandler) {
  await page.route(`**/api/v1/reservations/${reservationId}/**`, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          venue_name: "Smoke Test Cafe",
          date: "2030-01-02",
          time: "18:30:45",
        }),
      });
      return;
    }

    await cancelHandler(route);
  });
}

test("reservation cancellation page shows reservation details and goes back without cancelling", async ({ page }) => {
  const reservationId = "e2e-back";
  let cancelRequestCount = 0;
  await loginWithMockedSession(page);
  await mockReservation(page, reservationId, async (route) => {
    cancelRequestCount += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.goto(`/venues/reservation/${reservationId}/cancel`);
  await expect(page.getByRole("heading", { name: "Cancel Reservation" })).toBeVisible();
  const reservationDetails = page.locator(".confirm-cancel-page > p").filter({
    hasText: "Smoke Test Cafe",
  });
  await expect(reservationDetails).toContainText("2030-01-02");
  await expect(reservationDetails).toContainText("18:30");

  await page.getByRole("button", { name: "Go back" }).click();
  await expect(page).toHaveURL(/\/venues\/my-reservations$/);
  expect(cancelRequestCount).toBe(0);
});

test("confirming reservation cancellation posts once and returns to reservations", async ({ page }) => {
  const reservationId = "e2e-confirm";
  let cancelRequestCount = 0;
  await loginWithMockedSession(page);
  await mockReservation(page, reservationId, async (route) => {
    cancelRequestCount += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.goto(`/venues/reservation/${reservationId}/cancel`);
  await expect(page.getByText(/Smoke Test Cafe/)).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();

  await expect(page).toHaveURL(/\/venues\/my-reservations$/);
  expect(cancelRequestCount).toBe(1);
});

test("failed reservation cancellation displays an error and stays on the confirmation page", async ({ page }) => {
  const reservationId = "e2e-failure";
  await loginWithMockedSession(page);
  await mockReservation(page, reservationId, async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Cancellation failed." }),
    });
  });

  await page.goto(`/venues/reservation/${reservationId}/cancel`);
  await expect(page.getByText(/Smoke Test Cafe/)).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();

  await expect(page.getByRole("alert")).toContainText("Could not cancel reservation.");
  await expect(page).toHaveURL(new RegExp(`/venues/reservation/${reservationId}/cancel$`));
});
