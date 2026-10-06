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
  useToastMessage: () => ["", jest.fn(), "error", jest.fn()],
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
