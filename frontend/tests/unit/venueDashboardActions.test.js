import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent, screen, waitFor } from "@testing-library/dom";
import VenueDashboardPage from "../../src/pages/VenueDashboardPage";
import { getWithAuth, postWithAuth } from "../../src/utils/auth";

const mockT = (key) => key;
const mockNavigate = jest.fn();
const mockParams = { venueId: "7" };

jest.mock("../../src/utils/auth", () => ({
  getWithAuth: jest.fn(),
  postWithAuth: jest.fn(),
}));
jest.mock("../../src/utils/media", () => ({ mediaUrl: (url) => url }));
jest.mock("../../src/utils/venueNotifications", () => ({
  subscribeToVenueNotifications: () => jest.fn(),
}));
jest.mock("../../src/styles/venue_dashboard_legacy.css", () => ({}));
jest.mock("../../src/styles/venue_dashboard.css", () => ({}));
jest.mock("../../src/components/DateRangePicker", () => () => null);
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: mockT, i18n: { language: "en" } }),
}));
jest.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useParams: () => mockParams,
}));
jest.mock("recharts", () => {
  const React = require("react");
  const Stub = ({ children }) => React.createElement("div", null, children);
  return {
    CartesianGrid: Stub,
    Legend: Stub,
    Line: Stub,
    LineChart: Stub,
    ResponsiveContainer: Stub,
    Tooltip: Stub,
    XAxis: Stub,
    YAxis: Stub,
  };
});

const pendingRequest = {
  id: 101,
  customer_name: "Alex Request",
  firstname: "Alex",
  lastname: "Guest",
  email: "alex@example.com",
  phone: "+306912345678",
  date: "2099-05-01",
  time: "18:30:00",
  guests: 2,
  status: "pending",
  seen: true,
  special_requests: false,
};
const arrivalRequest = {
  ...pendingRequest,
  id: 202,
  customer_name: "Casey Arrival",
  status: "accepted",
  arrival_status: "pending",
};
const venue = {
  id: 7,
  name: "Ada Bistro",
  kind: "restaurant",
  location: "Athens",
  email: "venue@example.com",
  phone: "+302101234567",
  description: "Seasonal dishes",
  is_full: false,
  updates_require_approval: false,
};
const workingDays = [
  {
    weekday: 0,
    weekday_display: "Monday",
    is_closed: false,
    open_time: "09:00",
    close_time: "17:00",
    closes_next_day: false,
  },
];

let root;
let container;

function configureDashboard({ requests = [pendingRequest], arrivals = [arrivalRequest], history = [] } = {}) {
  getWithAuth.mockImplementation((url, config = {}) => {
    if (url.endsWith("/dashboard/")) {
      return Promise.resolve({
        data: {
          venue,
          working_days: workingDays,
          analytics: { total_visits: 12, total_reservations: 4, daily: [] },
          reservation_counts: { unseen_requests: 1 },
        },
      });
    }

    if (url.endsWith("/dashboard-reservations/")) {
      const byBucket = { requests, arrivals, history };
      const rows = byBucket[config.params.bucket] || [];
      return Promise.resolve({
        data: {
          results: rows,
          count: rows.length,
          page: 1,
          page_size: 10,
          total_pages: 1,
        },
      });
    }

    if (url.endsWith("/dashboard-counts/")) {
      return Promise.resolve({ data: { unseen_requests: 0 } });
    }

    return Promise.reject(new Error(`Unexpected dashboard GET: ${url}`));
  });
}

async function renderDashboard(options) {
  global.React = React;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  configureDashboard(options);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<VenueDashboardPage />));
  await waitFor(() => expect(screen.getByRole("heading", { name: "Ada Bistro" })).toBeInTheDocument());
  await waitFor(() => expect(getWithAuth).toHaveBeenCalledWith(
    "/api/v1/venues/7/dashboard-reservations/",
    expect.objectContaining({ params: expect.objectContaining({ bucket: "requests" }) }),
    expect.any(Object),
  ));
  await waitFor(() => expect(screen.getByText("Alex Request")).toBeInTheDocument());
}

async function clickAction(label) {
  await act(async () => fireEvent.click(screen.getByRole("button", { name: label })));
}

async function expectActionFailure(message = "Could not update the reservation.") {
  expect(await screen.findByRole("alert")).toHaveTextContent(message);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNavigate.mockReset();
  localStorage.clear();
  root = null;
  container = null;
  postWithAuth.mockResolvedValue({ data: {} });
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

test("accepting a pending request sends the accepted status", async () => {
  await renderDashboard();
  await clickAction("Accept");

  expect(postWithAuth).toHaveBeenCalledWith(
    "/api/v1/reservations/101/status/",
    { status: "accepted" },
    {},
    expect.any(Object),
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("a rejected accept request shows an error and does not change the row status", async () => {
  await renderDashboard();
  postWithAuth.mockRejectedValueOnce({ response: { data: { detail: "Accept failed." } } });
  await clickAction("Accept");

  await expectActionFailure("Accept failed.");
  expect(document.querySelector("#reservation-row-101 .badge")).toHaveTextContent("Pending");
});

test("rejecting a pending request sends the rejected status", async () => {
  await renderDashboard();
  await clickAction("Reject");

  expect(postWithAuth).toHaveBeenCalledWith(
    "/api/v1/reservations/101/status/",
    { status: "rejected" },
    {},
    expect.any(Object),
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("a rejected reject request reports failure and preserves pending status", async () => {
  await renderDashboard();
  postWithAuth.mockRejectedValueOnce({ response: { data: { detail: "Reject failed." } } });
  await clickAction("Reject");

  await expectActionFailure("Reject failed.");
  expect(document.querySelector("#reservation-row-101 .badge")).toHaveTextContent("Pending");
});

test("marking a request as seen sends the seen transition", async () => {
  await renderDashboard({ requests: [{ ...pendingRequest, seen: false }] });
  await clickAction("Mark reservation as seen");

  expect(postWithAuth).toHaveBeenCalledWith(
    "/api/v1/reservations/101/seen/",
    { state: "seen" },
    {},
    expect.any(Object),
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("a rejected seen transition displays an error and keeps the request unseen", async () => {
  await renderDashboard({ requests: [{ ...pendingRequest, seen: false }] });
  postWithAuth.mockRejectedValueOnce({ response: { data: { detail: "Seen update failed." } } });
  await clickAction("Mark reservation as seen");

  await expectActionFailure("Seen update failed.");
  expect(document.querySelector("#reservation-row-101")).toHaveAttribute("data-seen", "false");
});

test("checking in an accepted arrival sends the checked-in state", async () => {
  await renderDashboard();
  await clickAction("Checked in");

  expect(postWithAuth).toHaveBeenCalledWith(
    "/api/v1/reservations/202/arrival/",
    { arrival_status: "checked_in" },
    {},
    expect.any(Object),
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("a failed check-in reports the error and preserves the pending arrival", async () => {
  await renderDashboard();
  postWithAuth.mockRejectedValueOnce({ response: { data: { detail: "Check-in failed." } } });
  await clickAction("Checked in");

  await expectActionFailure("Check-in failed.");
  expect(document.querySelector("#reservation-row-202")).toHaveTextContent("Pending");
});

test("marking an accepted arrival as a no-show sends the no-show state", async () => {
  await renderDashboard();
  await clickAction("No show");

  expect(postWithAuth).toHaveBeenCalledWith(
    "/api/v1/reservations/202/arrival/",
    { arrival_status: "no_show" },
    {},
    expect.any(Object),
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("a failed no-show update reports failure and preserves the pending arrival", async () => {
  await renderDashboard();
  postWithAuth.mockRejectedValueOnce({ response: { data: { detail: "No-show update failed." } } });
  await clickAction("No show");

  await expectActionFailure("No-show update failed.");
  expect(document.querySelector("#reservation-row-202")).toHaveTextContent("Pending");
});

test("moving an arrival back to requests calls the move action", async () => {
  await renderDashboard();
  await clickAction("Move Back");

  expect(postWithAuth).toHaveBeenCalledWith(
    "/api/v1/reservations/202/move-to-requests/",
    {},
    {},
    expect.any(Object),
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("a failed move-back action reports the error without changing the arrival", async () => {
  await renderDashboard();
  postWithAuth.mockRejectedValueOnce({ response: { data: { detail: "Move failed." } } });
  await clickAction("Move Back");

  await expectActionFailure("Move failed.");
  expect(document.querySelector("#reservation-row-202")).toHaveTextContent("Casey Arrival");
});

test("marking the venue full calls the availability endpoint and updates the badge", async () => {
  postWithAuth.mockResolvedValueOnce({ data: { is_full: true } });
  await renderDashboard();
  await clickAction("Mark as Full");

  expect(postWithAuth).toHaveBeenCalledWith(
    "/api/v1/venues/7/toggle-full/",
    {},
    {},
    expect.any(Object),
  );
  expect(await screen.findByText("Full")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Mark as Available" })).toBeInTheDocument();
});

test("a failed availability update reports the error and keeps the venue available", async () => {
  await renderDashboard();
  postWithAuth.mockRejectedValueOnce({ response: { data: { detail: "Availability update failed." } } });
  await clickAction("Mark as Full");

  await expectActionFailure("Availability update failed.");
  expect(screen.getByText("Available")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Mark as Full" })).toBeInTheDocument();
});

test("analytics grouping reloads data using the selected group", async () => {
  await renderDashboard();
  await clickAction("Analytics");
  await act(async () => fireEvent.change(screen.getByLabelText("Group by:"), {
    target: { value: "weekly" },
  }));

  await waitFor(() => expect(getWithAuth).toHaveBeenCalledWith(
    "/api/v1/venues/7/dashboard/",
    { params: { group: "weekly" } },
    expect.any(Object),
  ));
  expect(screen.getByText("12")).toBeInTheDocument();
});

test("a failed analytics reload displays an error rather than accepting the new grouping", async () => {
  await renderDashboard();
  await clickAction("Analytics");
  getWithAuth.mockRejectedValueOnce({ response: { data: { detail: "Analytics unavailable." } } });
  await act(async () => fireEvent.change(screen.getByLabelText("Group by:"), {
    target: { value: "weekly" },
  }));

  await expectActionFailure("Analytics unavailable.");
});

test("venue details and working hours save through both dashboard endpoints", async () => {
  await renderDashboard();
  await clickAction("Manage Venue");
  await act(async () => fireEvent.change(screen.getByLabelText("Venue Name"), {
    target: { value: "Ada Bistro Updated" },
  }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));

  await waitFor(() => expect(postWithAuth).toHaveBeenCalledWith(
    "/api/v1/venues/7/submit-update/",
    expect.any(FormData),
    {},
    expect.any(Object),
  ));
  expect(postWithAuth).toHaveBeenCalledWith(
    "/api/v1/venues/7/working-hours/",
    { working_days: [{ weekday: 0, is_closed: false, open_time: "09:00", close_time: "17:00", closes_next_day: false }] },
    {},
    expect.any(Object),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Venue details saved.");
});

test("a rejected venue details save reports failure and skips saving working hours", async () => {
  await renderDashboard();
  await clickAction("Manage Venue");
  await act(async () => fireEvent.change(screen.getByLabelText("Venue Name"), {
    target: { value: "Rejected Change" },
  }));
  postWithAuth.mockRejectedValueOnce({ response: { data: { detail: "Venue update rejected." } } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));

  await expectActionFailure("Venue update rejected.");
  expect(postWithAuth).toHaveBeenCalledTimes(1);
  expect(postWithAuth).toHaveBeenCalledWith(
    "/api/v1/venues/7/submit-update/",
    expect.any(FormData),
    {},
    expect.any(Object),
  );
});

test("an unsuccessful working-hours save reports failure after venue details save", async () => {
  await renderDashboard();
  await clickAction("Manage Venue");
  await act(async () => fireEvent.change(screen.getByLabelText("Venue Name"), {
    target: { value: "Hours Update" },
  }));
  postWithAuth
    .mockResolvedValueOnce({ data: { venue: { ...venue, name: "Hours Update" } } })
    .mockRejectedValueOnce({ response: { data: { detail: "Hours update rejected." } } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));

  await expectActionFailure("Hours update rejected.");
  expect(postWithAuth).toHaveBeenCalledTimes(2);
  expect(postWithAuth).toHaveBeenNthCalledWith(
    2,
    "/api/v1/venues/7/working-hours/",
    expect.objectContaining({ working_days: expect.any(Array) }),
    {},
    expect.any(Object),
  );
});
