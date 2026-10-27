import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent, screen } from "@testing-library/dom";
import axios from "axios";
import { postWithCsrf } from "../../src/utils/csrf";
import { rememberVerification, getVerificationChallenge } from "../../src/utils/verification";
import ProfilePage from "../../src/pages/ProfilePage";
import SignupPage from "../../src/pages/SignupPage";
import LoginPage from "../../src/pages/LoginPage";
import PasswordRecoverPage from "../../src/pages/PasswordRecoverPage";
import PasswordResetPage from "../../src/pages/PasswordResetPage";
import AboutPage from "../../src/pages/AboutPage";
import ReservationPendingPage from "../../src/pages/ReservationPendingPage";
import ConfirmCancelPage from "../../src/pages/ConfirmCancelPage";
import { getWithAuth, patchWithAuth, postWithAuth, storeAuthResponse } from "../../src/utils/auth";

jest.mock("axios", () => ({ get: jest.fn() }));
jest.mock("../../src/utils/csrf", () => ({ postWithCsrf: jest.fn() }));
jest.mock("../../src/utils/auth", () => ({
  getWithAuth: jest.fn(),
  patchWithAuth: jest.fn(),
  postWithAuth: jest.fn(),
  storeAuthResponse: jest.fn(),
}));
jest.mock("../../src/utils/backendUrl", () => ({
  getBackendBase: () => "",
}));
jest.mock("../../src/styles/auth.css", () => ({}));
jest.mock("../../src/styles/feedback.css", () => ({}));
jest.mock("../../src/styles/login1.css", () => ({}));
jest.mock("../../src/styles/password_recover.css", () => ({}));
jest.mock("../../src/styles/password_reset.css", () => ({}));
jest.mock("../../src/styles/about.css", () => ({}));
jest.mock("../../src/styles/reservation_pending.css", () => ({}));
jest.mock("../../src/styles/confirm_cancel.css", () => ({}));
jest.mock("../../src/styles/openspots-forms-style.css", () => ({}));
jest.mock("../../src/styles/ProfilePage.css", () => ({}));
jest.mock("../../src/assets/google-icon.svg", () => "google-icon");
jest.mock("../../src/components/EmailVerificationModal", () => () => null);
jest.mock("../../src/components/ToastProvider", () => ({
  useToastMessage: () => {
    const [message, setMessage] = require("react").useState("");
    const [type, setType] = require("react").useState("success");
    return [message, setMessage, type, setType];
  },
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key) => key }),
  Trans: ({ children }) => children || null,
}));
const mockNavigate = jest.fn();
let mockLocation = { search: "", state: null, pathname: "/accounts/login" };
jest.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => mockLocation,
  useParams: () => ({ reservationId: "12" }),
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
  sessionStorage.clear();
  mockNavigate.mockReset();
  mockLocation = { search: "", state: null, pathname: "/accounts/login" };
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

test("signup rejects invalid phone input before calling the API", async () => {
  await renderPage(<SignupPage />);
  const values = {
    "First name": "Ada",
    "Last name": "Lovelace",
    Username: "ada",
    Email: "ada@example.com",
    "Phone number": "invalid",
    Password: "Strong-password-42",
    "Confirm password": "Strong-password-42",
  };

  await act(async () => {
    for (const [label, value] of Object.entries(values)) {
      fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value } });
    }
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
  });

  expect(screen.getByRole("alert")).toHaveTextContent("Please enter a valid phone number");
  expect(postWithCsrf).not.toHaveBeenCalled();
});

test("signup submits valid details, stores the verification challenge, and navigates to verification", async () => {
  jest.useFakeTimers();
  postWithCsrf.mockResolvedValue({ data: { challenge_id: "signup-challenge", detail: "Account created." } });
  await renderPage(<SignupPage />);
  const values = {
    "First name": "Ada",
    "Last name": "Lovelace",
    Username: "ada-lovelace",
    Email: "ada@example.com",
    "Phone number": "+306912345678",
    Password: "Strong-password-42",
    "Confirm password": "Strong-password-42",
  };

  await act(async () => {
    for (const [label, value] of Object.entries(values)) {
      fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value } });
    }
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
  });

  expect(postWithCsrf).toHaveBeenCalledWith("/api/v1/accounts/register/", {
    firstname: "Ada",
    lastname: "Lovelace",
    username: "ada-lovelace",
    email: "ada@example.com",
    phone_number: "+306912345678",
    password: "Strong-password-42",
    password2: "Strong-password-42",
  });
  expect(getVerificationChallenge()).toBe("signup-challenge");
  await act(async () => jest.advanceTimersByTime(600));
  expect(mockNavigate).toHaveBeenCalledWith("/accounts/verify-email");
});

test("login reports rejected credentials without storing a session", async () => {
  postWithCsrf.mockRejectedValue({ response: { data: { detail: "Invalid username or password." } } });
  await renderPage(<LoginPage />);

  await act(async () => {
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "ada" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong" } });
    fireEvent.submit(document.querySelector("form"));
  });

  expect(screen.getByText("Invalid username or password.")).toBeInTheDocument();
  expect(storeAuthResponse).not.toHaveBeenCalled();
});

test("password recovery submits the email and continues to verification", async () => {
  jest.useFakeTimers();
  postWithCsrf.mockResolvedValue({ data: { challenge_id: "recovery-challenge" } });
  await renderPage(<PasswordRecoverPage />);

  await act(async () => {
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: "ada@example.com" } });
    fireEvent.submit(document.querySelector("form"));
  });

  expect(postWithCsrf).toHaveBeenCalledWith("/api/v1/accounts/password/recover/", {
    email: "ada@example.com",
  });
  expect(getVerificationChallenge()).toBe("recovery-challenge");
  await act(async () => jest.advanceTimersByTime(700));
  expect(mockNavigate).toHaveBeenCalledWith("/accounts/verify-email");
});

test("password reset blocks mismatched passwords and submits matching passwords with proof", async () => {
  jest.useFakeTimers();
  rememberVerification({ challenge_id: "reset-challenge" });
  const { rememberResetToken } = require("../../src/utils/verification");
  rememberResetToken("reset-proof", "reset-challenge");
  postWithCsrf.mockResolvedValue({ data: { detail: "Password reset successful." } });
  await renderPage(<PasswordResetPage />);

  await act(async () => {
    fireEvent.change(screen.getByLabelText("New password"), { target: { name: "new_password1", value: "new-password-123" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { name: "new_password2", value: "different-password" } });
    fireEvent.submit(document.querySelector("form"));
  });
  expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
  expect(postWithCsrf).not.toHaveBeenCalled();

  await act(async () => {
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { name: "new_password2", value: "new-password-123" } });
    fireEvent.submit(document.querySelector("form"));
  });
  expect(postWithCsrf).toHaveBeenCalledWith(
    "/api/v1/accounts/password/reset/",
    { new_password1: "new-password-123", new_password2: "new-password-123", reset_token: "reset-proof" },
    expect.objectContaining({ headers: { "X-Verification-Challenge": "reset-challenge" } }),
  );
  await act(async () => jest.advanceTimersByTime(900));
  expect(mockNavigate).toHaveBeenCalledWith("/accounts/login");
});

test("about and reservation-pending pages render their primary content and return link", async () => {
  await renderPage(<AboutPage />);
  expect(screen.getByRole("heading", { name: "About Us" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Our Core Principles" })).toBeInTheDocument();
  await act(async () => root.render(<ReservationPendingPage />));
  expect(screen.getByRole("heading", { name: "Reservation Pending" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Back to Venue List" })).toHaveAttribute("href", "/");
});

test("cancel confirmation can return to reservations or cancel the loaded reservation", async () => {
  getWithAuth.mockResolvedValue({ data: { venue_name: "Cafe Ada", date: "2030-01-02", time: "18:30" } });
  postWithAuth.mockResolvedValue({ data: {} });
  await renderPage(<ConfirmCancelPage />);
  expect(await screen.findByText(/Cafe Ada/)).toBeInTheDocument();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Cancel" })));
  expect(postWithAuth).toHaveBeenCalledWith("/api/v1/reservations/12/cancel/", {}, {}, expect.any(Object));
  expect(mockNavigate).toHaveBeenCalledWith("/venues/my-reservations");
});

test("profile saves edited details and validates password confirmation before starting verification", async () => {
  const profile = {
    username: "ada",
    email: "ada@example.com",
    firstname: "Ada",
    lastname: "Lovelace",
    phone_number: "+306912345678",
    email_verified: true,
  };
  getWithAuth.mockImplementation((url) => Promise.resolve({
    data: url.endsWith("/profile/") ? profile : { pending: false },
  }));
  patchWithAuth.mockResolvedValue({ data: { ...profile, firstname: "Grace" } });
  postWithAuth.mockResolvedValue({ data: { challenge_id: "password-challenge" } });
  await renderPage(<ProfilePage />);
  await screen.findByDisplayValue("Ada");

  await act(async () => fireEvent.change(screen.getByLabelText("First name"), {
    target: { value: "Grace" },
  }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Update Profile" })));
  expect(patchWithAuth).toHaveBeenCalledWith(
    "/api/v1/accounts/profile/",
    { firstname: "Grace", lastname: "Lovelace", phone_number: "+306912345678" },
    {},
    expect.any(Object),
  );
  expect(screen.getByLabelText("First name")).toHaveValue("Grace");
  expect(screen.getByRole("button", { name: "Update Profile" })).toBeDisabled();

  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Change Password" })));
  await act(async () => {
    fireEvent.change(screen.getByPlaceholderText("Old password"), { target: { name: "old_password", value: "old-password" } });
    fireEvent.change(screen.getByPlaceholderText("New password"), { target: { name: "new_password1", value: "new-password" } });
    fireEvent.change(screen.getByPlaceholderText("Confirm new password"), { target: { name: "new_password2", value: "different" } });
    fireEvent.submit(document.querySelector(".profile-password-form"));
  });
  expect(screen.getByText("The new passwords do not match.")).toBeInTheDocument();
  expect(postWithAuth).not.toHaveBeenCalled();

  await act(async () => {
    fireEvent.change(screen.getByPlaceholderText("Confirm new password"), { target: { name: "new_password2", value: "new-password" } });
    fireEvent.submit(document.querySelector(".profile-password-form"));
  });
  expect(postWithAuth).toHaveBeenCalledWith(
    "/api/v1/accounts/password/change/",
    { old_password: "old-password", new_password1: "new-password", new_password2: "new-password" },
    {},
    expect.any(Object),
  );
  expect(mockNavigate).toHaveBeenCalledWith("/accounts/verify-email");
});
