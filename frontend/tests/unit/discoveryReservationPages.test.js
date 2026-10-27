import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent, screen, waitFor } from "@testing-library/dom";
import axios from "axios";
import VenuesPage from "../../src/pages/VenuesPage";
import VenueDetailPage from "../../src/pages/VenueDetailPage";
import MyReservationsPage from "../../src/pages/MyReservationsPage";
import ReservationFormPage from "../../src/pages/ReservationFormPage";
import { getWithAuth, postWithAuth } from "../../src/utils/auth";

const mockT = (key) => key;

jest.mock("axios", () => ({ get: jest.fn() }));
jest.mock("../../src/utils/auth", () => ({
  getAccessToken: () => "test-token",
  refreshAccessToken: jest.fn(),
  getWithAuth: jest.fn(),
  postWithAuth: jest.fn(),
  patchWithAuth: jest.fn(),
}));
jest.mock("../../src/styles/venue_list.css", () => ({}));
jest.mock("../../src/styles/venue_detail.css", () => ({}));
jest.mock("../../src/styles/my_reservations.css", () => ({}));
jest.mock("../../src/styles/make_reservation.css", () => ({}));
jest.mock("../../src/styles/openspots-forms-style.css", () => ({}));
jest.mock("../../src/styles/edit_reservation.css", () => ({}));
jest.mock("leaflet/dist/leaflet.css", () => ({}));
jest.mock("../../src/components/venues/VenueSection", () => ({ title, venues }) => (
  <section aria-label={title}>
    {venues.map((venue) => <p key={venue.id}>{venue.name}</p>)}
  </section>
));
jest.mock("react-leaflet", () => {
  const React = require("react");
  const Stub = ({ children }) => React.createElement("div", null, children);
  return {
    CircleMarker: Stub,
    MapContainer: Stub,
    Popup: Stub,
    ZoomControl: Stub,
  };
});
jest.mock("../../src/components/venues/OpenFreeMapLayer", () => () => null);
jest.mock("../../src/components/ToastProvider", () => ({
  useToastMessage: () => {
    const [message, setMessage] = require("react").useState("");
    const [type, setType] = require("react").useState("success");
    return [message, setMessage, type, setType];
  },
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: mockT, i18n: { language: "en" } }),
}));
const mockNavigate = jest.fn();
const mockLocation = { pathname: "/venues/book/7", search: "" };
jest.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => mockLocation,
  useParams: () => ({ venueId: "7", reservationId: "21" }),
  useOutletContext: () => ({ user: { username: "guest" }, authLoading: false }),
  Link: ({ children, to }) => <a href={to}>{children}</a>,
}));

let root;
let container;

async function renderPage(page) {
  global.React = React;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(page));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNavigate.mockReset();
  container = null;
  root = null;
});

afterEach(async () => {
  if (root) {
    await act(async () => root.unmount());
    container.remove();
    root = null;
  }
  jest.clearAllTimers();
  jest.useRealTimers();
});

test("venue browsing applies type and availability filters and debounces search", async () => {
  axios.get.mockResolvedValue({
    data: { results: { restaurants: [{ id: 4, name: "Ada Bistro" }] } },
  });
  await renderPage(<VenuesPage />);
  await waitFor(() => expect(screen.getByText("Ada Bistro")).toBeInTheDocument());

  await act(async () => {
    fireEvent.change(screen.getByDisplayValue("All Venues"), { target: { value: "restaurant" } });
    fireEvent.change(screen.getByDisplayValue("All"), { target: { value: "available" } });
    fireEvent.change(screen.getByPlaceholderText("Search venues"), { target: { value: "Ada" } });
  });
  await act(async () => new Promise((resolve) => setTimeout(resolve, 350)));

  expect(axios.get).toHaveBeenLastCalledWith("/api/v1/venues/", expect.objectContaining({
    params: { kind: "restaurant", availability: "available", search: "Ada" },
  }));
  expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Clear" })));
  expect(screen.getByDisplayValue("All Venues")).toBeInTheDocument();
  expect(screen.getByDisplayValue("All")).toBeInTheDocument();
});

test("venue detail switches tabs and submits a rated review", async () => {
  axios.get.mockResolvedValue({
    data: {
      id: 7,
      name: "Ada Bistro",
      location: "Athens",
      description: "Seasonal food",
      reviews: [],
      menu_images: [],
      images: [],
    },
  });
  postWithAuth.mockResolvedValue({
    data: { id: 2, username: "guest", rating: 5, comment: "Excellent" },
  });
  await renderPage(<VenueDetailPage />);
  await screen.findByRole("heading", { name: "Ada Bistro" });

  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Menu" })));
  expect(screen.getByText("This venue has not added a menu yet.")).toBeInTheDocument();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Reviews" })));
  await act(async () => {
    fireEvent.click(screen.getAllByRole("radio")[4]);
    fireEvent.change(screen.getByLabelText("Comment"), { target: { value: "Excellent" } });
    fireEvent.submit(document.querySelector(".venue-detail-review-form"));
  });

  expect(postWithAuth).toHaveBeenCalledWith(
    "/api/v1/venues/7/reviews/",
    { rating: 5, comment: "Excellent" },
    {},
    expect.any(Object),
  );
  expect(await screen.findByText("Your review has been submitted.")).toBeInTheDocument();
  expect(screen.getByText("Excellent")).toBeInTheDocument();
});

test("my reservations switches tabs and confirms cancellation before refreshing", async () => {
  const upcoming = {
    id: 21,
    venue_name: "Ada Bistro",
    date: "2099-05-01",
    time: "18:30:00",
    starts_at: "2099-05-01T18:30:00Z",
    guests: 2,
    status: "pending",
  };
  getWithAuth
    .mockResolvedValueOnce({ data: [upcoming, {
      ...upcoming, id: 22, date: "2020-01-01", venue_name: "Past Cafe",
        starts_at: "2020-01-01T18:30:00Z",
    }, {
      ...upcoming, id: 23, status: "cancelled", venue_name: "Cancelled Bar",
    }] })
    .mockResolvedValueOnce({ data: [{ ...upcoming, status: "cancelled" }] });
  postWithAuth.mockResolvedValue({ data: {} });
  window.confirm = jest.fn(() => true);
  await renderPage(<MyReservationsPage />);
  await screen.findByText(/Ada Bistro/);
  expect(screen.getByText(/Ada Bistro/)).toBeInTheDocument();

  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Past" })));
  expect(screen.getByText(/Past Cafe/)).toBeInTheDocument();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Cancelled" })));
  expect(screen.getByText(/Cancelled Bar/)).toBeInTheDocument();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Upcoming" })));
  await act(async () => fireEvent.click(document.querySelector(".reservation-card .cancel-btn")));

  expect(window.confirm).toHaveBeenCalledWith("Are you sure you want to cancel this reservation?");
  expect(postWithAuth).toHaveBeenCalledWith("/api/v1/reservations/21/cancel/", {}, {}, expect.any(Object));
  expect(getWithAuth).toHaveBeenCalledTimes(2);
});

test("reservation form creates a booking with selected slot and submitted guest details", async () => {
  getWithAuth.mockImplementation((url) => {
    if (url === "/api/v1/venues/7/") {
      return Promise.resolve({ data: { id: 7, name: "Ada Bistro" } });
    }
    if (url.endsWith("/slots/")) {
      return Promise.resolve({
        data: { slots: [{
          slot_date: "2099-05-01",
          time: "18:30:00",
          starts_at: "2099-05-01T18:30:00Z",
          is_available: true,
        }] },
      });
    }
    return Promise.resolve({ data: {} });
  });
  postWithAuth.mockResolvedValue({ data: { id: 42 } });
  await renderPage(<ReservationFormPage />);
  expect(getWithAuth).toHaveBeenCalled();
  await screen.findByRole("heading", { name: /Reserve at/ });
  await waitFor(() => expect(screen.getByRole("heading").textContent).toContain("Ada Bistro"));

  const fields = {
    "First name": "Ada",
    "Last name": "Lovelace",
    Email: "ada@example.com",
    Phone: "+306912345678",
  };
  await act(async () => {
    for (const [label, value] of Object.entries(fields)) {
      fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value } });
    }
    fireEvent.change(screen.getByLabelText("Date"), { target: { name: "date", value: "2099-05-01" } });
  });
  await waitFor(() => expect(document.querySelector(".time-slot")).toBeInTheDocument());
  await act(async () => fireEvent.click(document.querySelector(".time-slot")));
  await act(async () => fireEvent.submit(document.querySelector("form")));

  expect(postWithAuth).toHaveBeenCalledWith(
    "/api/v1/reservations/",
    expect.objectContaining({
      firstname: "Ada",
      lastname: "Lovelace",
      email: "ada@example.com",
      phone: "+306912345678",
      date: "2099-05-01",
      time: "18:30",
      guests: 2,
      venue_id: 7,
    }),
    {},
    expect.any(Object),
  );
  expect(mockNavigate).toHaveBeenCalledWith("/venues/reservation-pending");
});
