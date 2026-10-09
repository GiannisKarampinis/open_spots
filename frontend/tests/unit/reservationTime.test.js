import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent, screen } from "@testing-library/dom";
import { getWithAuth } from "../../src/utils/auth";
import MyReservationsPage from "../../src/pages/MyReservationsPage";
import { isReservationUpcoming } from "../../src/utils/reservationTime";

jest.mock("../../src/utils/auth", () => ({ getWithAuth: jest.fn(), postWithAuth: jest.fn() }));
jest.mock("../../src/styles/my_reservations.css", () => ({}));
jest.mock("../../src/styles/make_reservation.css", () => ({}));
jest.mock("../../src/styles/edit_reservation.css", () => ({}));
jest.mock("../../src/components/ToastProvider", () => ({
  useToastMessage: () => require("react").useState(""),
}));
const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate,
  useParams: () => ({ reservationId: "7" }), Link: ({ children }) => <a>{children}</a> }));
jest.mock("react-i18next", () => {
  const t = (key) => key;
  return { useTranslation: () => ({ t }) };
});

test("moves an elapsed reservation to Past and removes editing while the page stays open", async () => {
  global.React = React;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-10-06T11:59:59Z"));
  getWithAuth.mockResolvedValue({ data: [{ id: 1, venue_name: "Clock Cafe", guests: 2,
    status: "pending", date: "2026-10-06", time: "15:00", starts_at: "2026-10-06T15:00:00+03:00", is_upcoming: true }] });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<MyReservationsPage />));
    expect(screen.getByText("Edit")).toBeTruthy();
    await act(async () => jest.advanceTimersByTime(2000));
    expect(screen.queryByText("Edit")).toBeNull();
    expect(screen.queryByText(/Clock Cafe/)).toBeNull();
    await act(async () => fireEvent.click(screen.getByText("Past")));
    expect(screen.getByText(/Clock Cafe/)).toBeTruthy();
    expect(screen.queryByText("Edit")).toBeNull();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    jest.useRealTimers();
  }
});
