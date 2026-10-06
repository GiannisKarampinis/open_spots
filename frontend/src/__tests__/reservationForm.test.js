import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { screen } from "@testing-library/dom";
import { getWithAuth } from "../utils/auth";
import ReservationFormPage from "../pages/ReservationFormPage";
import { isReservationUpcoming } from "../utils/reservationTime";

jest.mock("../utils/auth", () => ({ getWithAuth: jest.fn(), postWithAuth: jest.fn() }));
jest.mock("../styles/my_reservations.css", () => ({}));
jest.mock("../styles/make_reservation.css", () => ({}));
jest.mock("../styles/edit_reservation.css", () => ({}));
jest.mock("../components/ToastProvider", () => ({
  useToastMessage: () => require("react").useState(""),
}));
const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate,
  useParams: () => ({ reservationId: "7" }), Link: ({ children }) => <a>{children}</a> }));
jest.mock("react-i18next", () => {
  const t = (key) => key;
  return { useTranslation: () => ({ t }) };
});

test("uses the actual timestamp and timezone instead of a stale upcoming flag", () => {
  const reservation = { starts_at: "2026-10-06T15:00:00+03:00", is_upcoming: true };
  expect(isReservationUpcoming(reservation, Date.parse("2026-10-06T11:59:59Z"))).toBe(true);
  expect(isReservationUpcoming(reservation, Date.parse("2026-10-06T12:00:01Z"))).toBe(false);
  expect(isReservationUpcoming({ starts_at: "invalid" })).toBe(false);
});

test("edit requests slots for the reservation date and shows loading until they arrive", async () => {
  global.React = React;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  let resolveSlots;
  const pending = new Promise((resolve) => { resolveSlots = resolve; });
  getWithAuth.mockImplementation((url) => url.endsWith("/slots/") ? pending : Promise.resolve({
    data: { venue_id: 3, venue_name: "Cafe", date: "2030-01-10", time: "18:00", guests: 2 },
  }));
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ReservationFormPage mode="edit" />));
    expect(getWithAuth).toHaveBeenCalledWith("/api/v1/venues/3/slots/",
      { params: { date: "2030-01-10" } }, expect.any(Object));
    expect(screen.getByText("Loading...")).toBeTruthy();
    expect(screen.queryByText("No available times for this date.")).toBeNull();
    await act(async () => resolveSlots({ data: { slots: [{ is_available: true,
      slot_date: "2030-01-10", time: "19:00", starts_at: "2030-01-10T19:00:00+02:00" }] } }));
    expect(screen.getByText("19:00")).toBeTruthy();
    expect(screen.queryByText("Loading...")).toBeNull();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

