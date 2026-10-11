import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent, screen } from "@testing-library/dom";
import ApplyVenuePage from "../../src/pages/ApplyVenuePage";
import { postWithCsrf } from "../../src/utils/csrf";
import { isVenueErrorPreviewEnabled } from "../../src/utils/venueErrorPreview";

jest.mock("../../src/styles/openspots-forms-style.css", () => ({}));
jest.mock("../../src/styles/apply_venue.css", () => ({}));
jest.mock("../../src/styles/feedback.css", () => ({}));
jest.mock("../../src/styles/auth.css", () => ({}));
jest.mock("../../src/utils/csrf", () => ({ postWithCsrf: jest.fn() }));
jest.mock("../../src/utils/venueErrorPreview", () => ({ isVenueErrorPreviewEnabled: jest.fn(() => false) }));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key) => key }) }));
jest.mock("react-router-dom", () => ({ Link: ({ children }) => <a>{children}</a> }));
jest.mock("../../src/components/ToastProvider", () => ({ useToastMessage: () => ["", jest.fn()] }));
jest.mock("../../src/components/EmailVerificationModal", () => ({ onVerified, venueEmail }) => (
  <button onClick={() => onVerified({ email: venueEmail, verification_token: "proof" })}>Complete verification</button>
));

let root;
beforeEach(async () => {
  global.React = React;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  isVenueErrorPreviewEnabled.mockReturnValue(false);
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root"));
  await act(async () => root.render(<ApplyVenuePage />));
});
afterEach(async () => { await act(async () => root.unmount()); });

async function change(id, value) {
  await act(async () => fireEvent.change(document.getElementById(id), { target: { value } }));
}
async function verify() {
  await change("admin_email", "owner@example.com");
  postWithCsrf.mockResolvedValueOnce({ data: { challenge_id: "challenge" } });
  await act(async () => fireEvent.click(screen.getByText("Verify")));
  await act(async () => fireEvent.click(screen.getByText("Complete verification")));
}
async function fillForm() {
  for (const [id, value] of Object.entries({ admin_firstname: "Alex", admin_lastname: "Owner", admin_username: "owner", admin_phone: "+306991234567", password: "Strong-password-42", password2: "Strong-password-42", venue_name: "Cafe", phone: "+302101234567", location: "Athens", "application-notes": "Notes" })) {
    await change(id, value);
  }
}
async function submit() {
  await act(async () => fireEvent.submit(document.getElementById("apply-venue-form")));
}

test("focuses the first missing field and connects it to its error messages", async () => {
  await verify();
  await submit();
  const input = document.getElementById("admin_firstname");
  expect(input).toHaveFocus();
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(document.getElementById(input.getAttribute("aria-describedby"))).toHaveTextContent("This field is required.");
  expect(postWithCsrf).toHaveBeenCalledTimes(1);
});

test("allows submission before verification and highlights the email without sending the application", async () => {
  await fillForm();
  await change("admin_email", "owner@example.com");
  const button = screen.getByRole("button", { name: "Submit Application" });
  expect(button).not.toBeDisabled();
  await act(async () => fireEvent.click(button));
  expect(document.getElementById("admin_email")).toHaveAttribute("aria-invalid", "true");
  expect(document.getElementById("admin_email")).toHaveFocus();
  expect(document.getElementById("admin-email-errors")).toHaveTextContent("You must verify this email before submitting the application.");
  expect(postWithCsrf).not.toHaveBeenCalled();
});

test("replaces the technical throttle response with a friendly verification message", async () => {
  await change("admin_email", "owner@example.com");
  postWithCsrf.mockRejectedValueOnce({ response: { status: 429, data: { detail: "Request was throttled. Expected available in 2291 seconds." } } });
  await act(async () => fireEvent.click(screen.getByText("Verify")));
  expect(document.getElementById("admin-email-errors")).toHaveTextContent("Too many verification requests. Please try again in about an hour.");
  expect(document.getElementById("admin_email")).toHaveAttribute("aria-invalid", "true");
});

test("locks all form controls during submission and restores them after a network failure", async () => {
  await verify();
  await fillForm();
  let rejectRequest;
  postWithCsrf.mockImplementationOnce(() => new Promise((resolve, reject) => { rejectRequest = reject; }));
  await submit();
  for (const input of document.querySelectorAll("#apply-venue-form input, #apply-venue-form textarea, #apply-venue-form button")) {
    expect(input).toBeDisabled();
  }
  await act(async () => rejectRequest(new Error("Offline")));
  expect(document.getElementById("admin_firstname")).not.toBeDisabled();
  expect(screen.getByRole("alert")).toHaveTextContent("Could not submit the application.");
});

test("shows a general correction message and focuses the backend-invalid field", async () => {
  await verify();
  await fillForm();
  postWithCsrf.mockRejectedValueOnce({ response: { data: { location: ["Invalid location."] } } });
  await submit();
  expect(screen.getByRole("alert")).toHaveTextContent("Please correct the highlighted fields.");
  expect(screen.getByRole("alert")).not.toHaveTextContent("Invalid location.");
  expect(document.getElementById("location")).toHaveFocus();
  expect(document.getElementById("location-errors")).toHaveTextContent("Invalid location.");
});

test("shows one requirements message for multiple password validation failures", async () => {
  await verify();
  await fillForm();
  await change("password", "123");
  await change("password2", "123");
  postWithCsrf.mockRejectedValueOnce({ response: { data: { password: [
    "This password is too short. It must contain at least 8 characters.",
    "This password is too common.",
    "This password is entirely numeric.",
  ] } } });
  await submit();
  const errors = document.getElementById("password-errors");
  expect(errors.children).toHaveLength(1);
  expect(errors).toHaveTextContent("Use a password with at least 8 characters that is not commonly used or entirely numeric.");
  expect(document.getElementById("password")).toHaveFocus();
  expect(document.getElementById("password")).toHaveAttribute("aria-invalid", "true");
});

test("previews all error areas without sending verification or application requests", async () => {
  await act(async () => root.unmount());
  isVenueErrorPreviewEnabled.mockReturnValue(true);
  root = createRoot(document.getElementById("root"));
  await act(async () => root.render(<ApplyVenuePage />));
  for (const errors of document.querySelectorAll(".openspots-form-errorlist")) {
    expect(errors).not.toBeEmptyDOMElement();
  }
  expect(screen.getByRole("alert")).toHaveTextContent("Check your internet connection and try again.");
  await act(async () => fireEvent.click(screen.getByText("Verify")));
  expect(document.getElementById("admin-email-errors")).toHaveTextContent("Too many verification requests.");
  await submit();
  expect(postWithCsrf).not.toHaveBeenCalled();
});
