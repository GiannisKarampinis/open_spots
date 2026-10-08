import { VerificationReason } from "../utils/verificationReasons";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent, screen } from "@testing-library/dom";
import axios from "axios";
import { postWithCsrf } from "../utils/csrf";
import { getWithAuth, postWithAuth, clearStoredAuth, storeAuthResponse } from "../utils/auth";
import { getVerificationChallenge, rememberVerification, getResetToken } from "../utils/verification";
import ProfilePage from "../pages/ProfilePage";
import VerifyEmailPage from "../pages/VerifyEmailPage";
import ApplyVenuePage from "../pages/ApplyVenuePage";
import SocialLoginCompletePage from "../pages/SocialLoginCompletePage";
import LoginPage from "../pages/LoginPage";

jest.mock("axios", () => ({ get: jest.fn() }));
jest.mock("../utils/csrf", () => ({ postWithCsrf: jest.fn() }));
jest.mock("../utils/backendUrl", () => ({ getBackendBase: () => "" }));
jest.mock("../utils/auth", () => ({ getWithAuth: jest.fn(), patchWithAuth: jest.fn(), postWithAuth: jest.fn(), storeAuthResponse: jest.fn(), clearStoredAuth: jest.fn() }));
jest.mock("../styles/openspots-forms-style.css", () => ({}));
jest.mock("../styles/ProfilePage.css", () => ({}));
jest.mock("../styles/auth.css", () => ({}));
jest.mock("../styles/apply_venue.css", () => ({}));
jest.mock("../styles/partial_signup.css", () => ({}));
jest.mock("../styles/verify_code.css", () => ({}));
jest.mock("../styles/feedback.css", () => ({}));
jest.mock("../styles/login1.css", () => ({}));
jest.mock("../assets/google-icon.svg", () => "google-icon");
const mockNavigate = jest.fn();
let mockLocation = { search: "", state: null };
jest.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate, useLocation: () => mockLocation, Link: ({ children }) => children }));
jest.mock("react-i18next", () => {
  const t = (key) => key;
  return { useTranslation: () => ({ t }), Trans: () => null };
});
jest.mock("../components/ToastProvider", () => ({
  useToastMessage: () => {
    const [message, setMessage] = require("react").useState("");
    const [type, setType] = require("react").useState("success");
    return [message, setMessage, type, setType];
  },
}));
jest.mock("../components/EmailVerificationModal", () => ({ challengeId }) => <div data-testid="email-modal">{challengeId}</div>);

let root;
beforeEach(() => {
  global.React = React;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  sessionStorage.clear();
  jest.clearAllMocks();
  mockLocation = { search: "", state: null };
  jest.useFakeTimers();
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root"));
});
afterEach(async () => {
  await act(async () => root.unmount());
  jest.clearAllTimers();
  jest.useRealTimers();
});

test("profile waits for status and passes the restored challenge ID to the modal", async () => {
  let finishStatus;
  const pending = new Promise((resolve) => { finishStatus = resolve; });
  getWithAuth.mockImplementation((url) => {
    if (url.endsWith("profile/")) return Promise.resolve({ data: { email: "old@example.com", firstname: "First", lastname: "Last" } });
    return pending;
  });
  await act(async () => root.render(<ProfilePage />));
  expect(screen.getByLabelText("Email")).toBeDisabled();
  await act(async () => finishStatus({ data: { pending: true, reason: VerificationReason.EMAIL_UPDATE, email: "new@example.com", challenge_id: "email-challenge" } }));
  expect(screen.getByLabelText("Email")).not.toBeDisabled();
  expect(screen.getByLabelText("Email")).toHaveValue("new@example.com");
  expect(screen.getByTestId("email-modal")).toHaveTextContent("email-challenge");
  expect(getVerificationChallenge()).toBe("");
});

function mockProfileCheck(check) {
  getWithAuth.mockImplementation((url, config, options) => {
    if (url.endsWith("profile/")) return Promise.resolve({ data: { email: "old@example.com", firstname: "First", lastname: "Last" } });
    return check(config, options);
  });
}

test("password login authenticates with username and password", async () => {
  const result = { access: "login-token", redirect_to: "/" };
  postWithCsrf.mockResolvedValue({ data: result });
  await act(async () => root.render(<LoginPage />));
  await act(async () => fireEvent.change(screen.getByLabelText("Username"), { target: { value: "member" } }));
  await act(async () => fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password-123" } }));
  await act(async () => fireEvent.submit(document.querySelector("form")));
  expect(postWithCsrf).toHaveBeenCalledWith("/api/v1/accounts/login/", {
    username: "member", password: "password-123",
  });
  expect(storeAuthResponse).toHaveBeenCalledWith(result);
});

test("Google login completes directly after the authenticated handoff", async () => {
  const result = { access: "google-token", redirect_to: "/" };
  axios.get.mockResolvedValue({ data: result });
  await act(async () => root.render(<SocialLoginCompletePage />));
  expect(storeAuthResponse).toHaveBeenCalledWith(result);
  expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true });
});

test("password verification clears authentication and redirects after success", async () => {
  rememberVerification({ challenge_id: "password-challenge" });
  axios.get.mockResolvedValue({ data: { reason: VerificationReason.PASSWORD_CHANGE, remaining_seconds: 600 } });
  postWithCsrf.mockResolvedValue({ data: { session_invalidated: true, redirect_to: "/accounts/login" } });
  await act(async () => root.render(<VerifyEmailPage />));
  await act(async () => fireEvent.change(screen.getByPlaceholderText("Enter 6-digit code"), { target: { value: "123456" } }));
  await act(async () => fireEvent.submit(screen.getByText("Verify").closest("form")));
  expect(clearStoredAuth).toHaveBeenCalledTimes(1);
  expect(getVerificationChallenge()).toBe("");
  await act(async () => jest.advanceTimersByTime(700));
  expect(mockNavigate).toHaveBeenCalledWith("/accounts/login");
});

test("signup verification stores authentication and follows the server redirect", async () => {
  rememberVerification({ challenge_id: "signup-challenge" });
  axios.get.mockResolvedValue({ data: { reason: VerificationReason.SIGNUP, remaining_seconds: 600 } });
  const result = { access: "access-token", user: { username: "member" }, redirect_to: "/venues/my-reservations" };
  postWithCsrf.mockResolvedValue({ data: result });
  await act(async () => root.render(<VerifyEmailPage />));
  await act(async () => fireEvent.change(screen.getByPlaceholderText("Enter 6-digit code"), { target: { value: "123456" } }));
  await act(async () => fireEvent.submit(screen.getByText("Verify").closest("form")));
  expect(storeAuthResponse).toHaveBeenCalledWith(result);
  await act(async () => jest.advanceTimersByTime(700));
  expect(mockNavigate).toHaveBeenCalledWith(result.redirect_to);
});

test("completed recovery resumes the password reset page with its stored proof", async () => {
  const { rememberResetToken } = require("../utils/verification");
  rememberResetToken("existing-proof", "recovery-challenge");
  axios.get.mockResolvedValue({ data: { verified: true, reason: VerificationReason.PASSWORD_RECOVERY } });
  await act(async () => root.render(<VerifyEmailPage />));
  expect(mockNavigate).toHaveBeenCalledWith("/accounts/reset-password");
  expect(getResetToken()).toBe("existing-proof");
  expect(postWithCsrf).not.toHaveBeenCalled();
});

test("profile verification redirects when authentication refresh fails", async () => {
  mockProfileCheck((_config, options) => {
    options.onUnauthenticated();
    return Promise.resolve(null);
  });
  await act(async () => root.render(<ProfilePage />));
  expect(mockNavigate).toHaveBeenCalledWith("/accounts/login");
});

test("profile verification redirects on a final unauthorized response", async () => {
  mockProfileCheck(() => Promise.reject({ response: { status: 401 } }));
  await act(async () => root.render(<ProfilePage />));
  expect(mockNavigate).toHaveBeenCalledWith("/accounts/login");
});

test("verification keeps its captured challenge when storage changes and saves the reset proof", async () => {
  rememberVerification({ challenge_id: "challenge-A" });
  axios.get.mockResolvedValue({ data: { reason: VerificationReason.PASSWORD_RECOVERY, remaining_seconds: 600, resend_after_seconds: 60 } });
  postWithCsrf.mockResolvedValue({ data: { reset_token: "reset-proof" } });
  await act(async () => root.render(<VerifyEmailPage />));
  expect(axios.get).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ headers: { "X-Verification-Challenge": "challenge-A" } }));
  rememberVerification({ challenge_id: "challenge-B" });
  await act(async () => {
    fireEvent.change(screen.getByPlaceholderText("Enter 6-digit code"), { target: { value: "123456" } });
  });
  await act(async () => fireEvent.submit(screen.getByRole("button", { name: "Verify" }).closest("form")));
  expect(postWithCsrf).toHaveBeenCalledWith("/api/v1/accounts/verification/confirm/", { code: "123456" }, expect.objectContaining({ headers: { "X-Verification-Challenge": "challenge-A" } }));
  expect(getResetToken()).toBe("reset-proof");
  expect(getVerificationChallenge()).toBe("challenge-A");
});

test("cancelling verification sends its ID and clears tab credentials", async () => {
  rememberVerification({ challenge_id: "challenge-A" });
  axios.get.mockResolvedValue({ data: { reason: VerificationReason.SIGNUP, remaining_seconds: 600 } });
  postWithCsrf.mockResolvedValue({ data: {} });
  await act(async () => root.render(<VerifyEmailPage />));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Cancel verification" })));
  expect(postWithCsrf).toHaveBeenCalledWith("/api/v1/accounts/verification/cancel/", {}, expect.objectContaining({ headers: { "X-Verification-Challenge": "challenge-A" } }));
  expect(getVerificationChallenge()).toBe("");
  expect(mockNavigate).toHaveBeenCalledWith("/accounts/login");
});

test("venue submission uses its own challenge and proof, not the account challenge", async () => {
  rememberVerification({ challenge_id: "unrelated-account-challenge" });
  postWithCsrf.mockImplementation((url) => Promise.resolve({ data:
    url.endsWith("send/") ? { challenge_id: "venue-challenge" }
      : url.endsWith("confirm/") ? { verification_token: "venue-proof" } : {}
  }));
  await act(async () => root.render(<ApplyVenuePage />));
  expect(screen.getByRole("button", { name: "Verify", exact: true })).toBeDisabled();
  await act(async () => fireEvent.change(document.getElementById("admin_email"), { target: { value: "owner@example.com" } }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Verify Email" })));
  await act(async () => fireEvent.change(screen.getByPlaceholderText("Enter 6-digit code"), { target: { value: "123456" } }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Verify", exact: true })));
  expect(postWithCsrf).toHaveBeenCalledWith("/api/v1/venues/verification/confirm/", { code: "123456" }, expect.objectContaining({ headers: { "X-Verification-Challenge": "venue-challenge" } }));
  await act(async () => fireEvent.submit(document.getElementById("apply-venue-form")));
  expect(postWithCsrf).toHaveBeenCalledWith("/api/v1/venues/apply/", expect.objectContaining({ admin_email: "owner@example.com", verification_token: "venue-proof" }), expect.objectContaining({ headers: { "X-Verification-Challenge": "venue-challenge" } }));
  expect(getVerificationChallenge()).toBe("unrelated-account-challenge");
});

test("expired venue proof allows reverification without losing application fields", async () => {
  postWithCsrf.mockImplementation((url) => {
    if (url.endsWith("apply/")) return Promise.reject({ response: { status: 400, data: {
      verification_required: true, admin_email: "Verify this email before submitting the application.",
    } } });
    return Promise.resolve({ data: url.endsWith("send/") ? { challenge_id: "venue-challenge" } : { verification_token: "venue-proof" } });
  });
  await act(async () => root.render(<ApplyVenuePage />));
  await act(async () => fireEvent.change(document.getElementById("admin_email"), { target: { value: "owner@example.com" } }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Verify Email" })));
  await act(async () => fireEvent.change(screen.getByPlaceholderText("Enter 6-digit code"), { target: { value: "123456" } }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Verify", exact: true })));
  await act(async () => fireEvent.submit(document.getElementById("apply-venue-form")));
  expect(document.getElementById("admin_email")).toHaveValue("owner@example.com");
  expect(screen.getByRole("button", { name: "Submit Application" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Verify Email" })).not.toBeDisabled();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Verify Email" })));
  expect(postWithCsrf).toHaveBeenLastCalledWith("/api/v1/venues/verification/send/", { email: "owner@example.com" }, expect.objectContaining({ headers: { "X-Verification-Challenge": "" } }));
});

test("editing the venue email discards verification and requires a new challenge", async () => {
  postWithCsrf.mockImplementation((url) => Promise.resolve({ data: url.endsWith("send/") ? { challenge_id: "venue-challenge" } : { verification_token: "venue-proof" } }));
  await act(async () => root.render(<ApplyVenuePage />));
  await act(async () => fireEvent.change(document.getElementById("admin_email"), { target: { value: "owner@example.com" } }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Verify Email" })));
  await act(async () => fireEvent.change(screen.getByPlaceholderText("Enter 6-digit code"), { target: { value: "123456" } }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Verify", exact: true })));
  expect(screen.getByRole("button", { name: "Submit Application" })).not.toBeDisabled();
  await act(async () => fireEvent.change(document.getElementById("admin_email"), { target: { value: "different@example.com" } }));
  expect(screen.getByRole("button", { name: "Submit Application" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Verify", exact: true })).toBeDisabled();
});
