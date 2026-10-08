jest.mock("../styles/email-verification-modal.css", () => ({}));
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent, screen } from "@testing-library/dom";
import axios from "axios";
import { postWithCsrf } from "../utils/csrf";
import { rememberVerification, getVerificationChallenge } from "../utils/verification";
import EmailVerificationModal from "../components/EmailVerificationModal";

jest.mock("axios", () => ({ get: jest.fn() }));
jest.mock("../utils/csrf", () => ({ postWithCsrf: jest.fn() }));
jest.mock("../utils/auth", () => ({ storeAuthResponse: jest.fn() }));
jest.mock("react-i18next", () => {
  const t = (key) => key;
  return { useTranslation: () => ({ t }), Trans: () => null };
});
jest.mock("../components/ToastProvider", () => ({
  useToastMessage: () => {
    const [message, setMessage] = require("react").useState("");
    const [type, setType] = require("react").useState("error");
    return [message, setMessage, type, setType];
  },
}));

const expiredError = { response: { data: { code: "verification_challenge_expired" } } };
let root;
let onExpired;
beforeEach(() => {
  global.React = React;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  sessionStorage.clear();
  rememberVerification({ challenge_id: "expired-id" });
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root"));
  onExpired = jest.fn();
});
afterEach(async () => { await act(async () => root.unmount()); });

async function renderModal() {
  await act(async () => root.render(<EmailVerificationModal
    challengeId="expired-id" onExpired={onExpired}
    onClose={jest.fn()} onCancelled={jest.fn()} onVerified={jest.fn()}
  />));
}

test("clears an expired challenge when reopening the modal", async () => {
  axios.get.mockRejectedValue(expiredError);
  await renderModal();
  expect(onExpired).toHaveBeenCalledTimes(1);
  expect(getVerificationChallenge()).toBe("");
});

test.each(["Verify Email", "Resend Code", "Cancel verification"])(
  "clears a challenge that expires before %s", async (button) => {
    axios.get.mockResolvedValue({ data: { remaining_seconds: 60, resend_after_seconds: 0 } });
    postWithCsrf.mockRejectedValue(expiredError);
    await renderModal();
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Enter 6-digit code"), { target: { value: "123456" } });
    });
    await act(async () => { fireEvent.click(screen.getByText(button)); });
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(getVerificationChallenge()).toBe("");
  }
);

test("keeps a code-expired challenge available for resending", async () => {
  axios.get.mockResolvedValue({ data: { remaining_seconds: 0, resend_after_seconds: 0 } });
  await renderModal();
  expect(onExpired).not.toHaveBeenCalled();
  expect(getVerificationChallenge()).toBe("expired-id");
  expect(screen.getByText("Resend Code")).not.toBeDisabled();
});

test("successful modal verification returns the profile to its parent", async () => {
  axios.get.mockResolvedValue({ data: { remaining_seconds: 60 } });
  const profile = { email: "new@example.com" };
  postWithCsrf.mockResolvedValue({ data: { profile, detail: "Verified" } });
  const onVerified = jest.fn();
  await act(async () => root.render(<EmailVerificationModal challengeId="expired-id"
    onExpired={onExpired} onVerified={onVerified} onClose={jest.fn()} onCancelled={jest.fn()} />));
  await act(async () => fireEvent.change(screen.getByLabelText("Enter 6-digit code"), { target: { value: "123456" } }));
  await act(async () => fireEvent.submit(screen.getByText("Verify Email").closest("form")));
  expect(onVerified).toHaveBeenCalledWith(profile, "Verified");
  expect(getVerificationChallenge()).toBe("");
});

test("resending clears the entered code and enforces the new cooldown", async () => {
  axios.get.mockResolvedValue({ data: { remaining_seconds: 0, resend_after_seconds: 0 } });
  postWithCsrf.mockResolvedValue({ data: { remaining_seconds: 600, resend_after_seconds: 60 } });
  await renderModal();
  await act(async () => fireEvent.change(screen.getByLabelText("Enter 6-digit code"), { target: { value: "a1234567" } }));
  expect(screen.getByLabelText("Enter 6-digit code")).toHaveValue("123456");
  await act(async () => fireEvent.click(screen.getByText("Resend Code")));
  expect(screen.getByLabelText("Enter 6-digit code")).toHaveValue("");
  expect(screen.getByText("Resend available in {{time}}")).toBeDisabled();
  expect(screen.getByText("Verify Email")).not.toBeDisabled();
});

test("invalid codes preserve the challenge and allow another attempt", async () => {
  axios.get.mockResolvedValue({ data: { remaining_seconds: 60 } });
  postWithCsrf.mockRejectedValue({ response: { data: { detail: "Invalid verification code." } } });
  await renderModal();
  await act(async () => fireEvent.change(screen.getByLabelText("Enter 6-digit code"), { target: { value: "123456" } }));
  await act(async () => fireEvent.submit(screen.getByText("Verify Email").closest("form")));
  expect(onExpired).not.toHaveBeenCalled();
  expect(getVerificationChallenge()).toBe("expired-id");
  expect(screen.getByText("Verify Email")).not.toBeDisabled();
});
