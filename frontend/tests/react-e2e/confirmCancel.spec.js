const { test, expect } = require("@playwright/test");

const apiBaseUrl = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8001";

async function loginAndGetAccessToken(page) {
  await page.goto("/accounts/login");
  await page.locator('input[name="username"]').fill("test_user1");
  await page.locator('input[name="password"]').fill("pass_word1!");

  const loginResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/accounts/login/") &&
    response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Login" }).click();
  const loginResponse = await loginResponsePromise;
  expect(loginResponse.ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/$/);

  const { access } = await loginResponse.json();
  expect(access).toBeTruthy();
  return access;
}

function authHeaders(access) {
  return { Authorization: "Bearer " + access };
}

async function createReservation(request, access, workerIndex) {
  const date = new Date();
  const dateOffset = 400 + Math.floor(Math.random() * 5_000) + workerIndex * 400;
  date.setDate(date.getDate() + dateOffset);
  const dateString = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  const minute = Math.floor(Math.random() * 60);
  const time = `18:${String(minute).padStart(2, "0")}:00`;
  const response = await request.post(`${apiBaseUrl}/api/v1/reservations/`, {
    headers: authHeaders(access),
    data: {
      venue_id: 1,
      firstname: "E2E",
      lastname: `Cancellation${workerIndex}`,
      email: "e2e-cancellation@example.test",
      phone: "6912345678",
      date: dateString,
      time,
      guests: 2,
    },
  });
  const status = response.status();
  const body = await response.text();
  expect(status, body).toBe(201);
  return JSON.parse(body);
}

async function deleteReservation(request, access, reservationId) {
  if (!reservationId) return;
  const response = await request.delete(
    `${apiBaseUrl}/api/v1/reservations/${reservationId}/`,
    { headers: authHeaders(access) },
  );
  expect(response.ok(), await response.text()).toBeTruthy();
}

test("user confirms cancellation and the reservation is cancelled in the API", async ({
  page,
  request,
}, testInfo) => {
  const access = await loginAndGetAccessToken(page);
  const reservation = await createReservation(request, access, testInfo.workerIndex);

  try {
    await page.goto(`/venues/reservation/${reservation.id}/cancel`);
    await expect(page.getByRole("heading", { name: "Cancel Reservation" })).toBeVisible();
    await expect(page.locator(".confirm-cancel-page")).toContainText(reservation.venue_name);
    await expect(page.locator(".confirm-cancel-page")).toContainText(reservation.date);

    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page).toHaveURL(/\/venues\/my-reservations$/);

    const response = await request.get(
      `${apiBaseUrl}/api/v1/reservations/${reservation.id}/`,
      { headers: authHeaders(access) },
    );
    expect(response.ok()).toBeTruthy();
    expect((await response.json()).status).toBe("cancelled");
  } finally {
    await deleteReservation(request, access, reservation.id);
  }
});

test("a reservation deleted after confirmation is shown cannot be cancelled", async ({
  page,
  request,
}, testInfo) => {
  const access = await loginAndGetAccessToken(page);
  const reservation = await createReservation(request, access, testInfo.workerIndex);
  let reservationExists = true;

  try {
    await page.goto(`/venues/reservation/${reservation.id}/cancel`);
    await expect(page.locator(".confirm-cancel-page")).toContainText(reservation.venue_name);

    const deletion = await request.delete(
      `${apiBaseUrl}/api/v1/reservations/${reservation.id}/`,
      { headers: authHeaders(access) },
    );
    expect(deletion.ok(), await deletion.text()).toBeTruthy();
    reservationExists = false;

    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Could not cancel reservation.");
    await expect(page).toHaveURL(new RegExp(`/venues/reservation/${reservation.id}/cancel$`));
  } finally {
    if (reservationExists) {
      await deleteReservation(request, access, reservation.id);
    }
  }
});

test("my reservations cancels an upcoming reservation and lists it under Cancelled", async ({
  page,
  request,
}, testInfo) => {
  const access = await loginAndGetAccessToken(page);
  const reservation = await createReservation(request, access, testInfo.workerIndex);

  try {
    await page.goto("/venues/my-reservations");
    const reservationCard = page.locator(".reservation-card").filter({
      hasText: reservation.venue_name,
    }).filter({ hasText: reservation.date });
    await expect(reservationCard).toContainText(reservation.date);
    await expect(reservationCard.getByRole("button", { name: "Cancel" })).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await reservationCard.getByRole("button", { name: "Cancel" }).click();

    await page.getByRole("button", { name: "Cancelled" }).click();
    const cancelledCard = page.locator(".reservation-card").filter({
      hasText: reservation.venue_name,
    }).filter({ hasText: reservation.date });
    await expect(cancelledCard).toContainText("Status: Cancelled");
    await expect(cancelledCard.getByRole("button", { name: "Cancel" })).toHaveCount(0);
  } finally {
    await deleteReservation(request, access, reservation.id);
  }
});

test("my reservations leaves a reservation active when cancellation is declined", async ({
  page,
  request,
}, testInfo) => {
  const access = await loginAndGetAccessToken(page);
  const reservation = await createReservation(request, access, testInfo.workerIndex);

  try {
    await page.goto("/venues/my-reservations");
    const reservationCard = page.locator(".reservation-card").filter({
      hasText: reservation.venue_name,
    }).filter({ hasText: reservation.date });
    await expect(reservationCard.getByRole("button", { name: "Cancel" })).toBeVisible();

    page.once("dialog", (dialog) => dialog.dismiss());
    await reservationCard.getByRole("button", { name: "Cancel" }).click();

    await expect(reservationCard).toContainText("Status: Pending");
  } finally {
    await deleteReservation(request, access, reservation.id);
  }
});
