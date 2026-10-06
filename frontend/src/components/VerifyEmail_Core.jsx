import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import axios from "axios";
import { postWithCsrf } from "../utils/csrf";
import { clearVerification, verificationConfig } from "../utils/verification";
import { useToastMessage } from "./ToastProvider";

export const CODE_LENGTH = 6;

export function formatSeconds(totalSeconds) {
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

export function VerificationCodeForm({ code, updateCode, submit, loading, submitting,
  resending, remaining, className, verifyLabel }) {
  const { t } = useTranslation();
  return <form className={className} onSubmit={submit}>
    <input type="text" inputMode="numeric" autoComplete="one-time-code"
      maxLength={CODE_LENGTH} pattern="\d{6}" value={code} onChange={updateCode}
      placeholder={t("Enter 6-digit code")} aria-label={t("Enter 6-digit code")}
      autoFocus disabled={loading} required />
    <button type="submit" disabled={loading || submitting || resending || remaining <= 0}>
      {submitting ? t("Verifying...") : t(verifyLabel)}
    </button>
  </form>;
}

// Wrappers own layout and what happens after verification; this component owns
// the challenge requests and the state shared by both verification interfaces.
export default function VerifyEmail_Core({ challengeId, onVerified, onCancelled,
  onExpired, onStatus, statusError, initialMessageType = "success", children }) {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [remaining, setRemaining] = useState(0);
  const [resendAfter, setResendAfter] = useState(0);
  const [total, setTotal] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage, messageType, setMessageType] = useToastMessage(initialMessageType);

  useEffect(() => {
    let cancelled = false;
    axios.get("/api/v1/accounts/verification/status/", verificationConfig(challengeId))
      .then((res) => {
        if (cancelled || onStatus?.(res.data)) return;
        const seconds = Number(res.data.remaining_seconds || 0);
        setEmail(res.data.email || "");
        setReason(res.data.reason || "");
        setRemaining(seconds);
        setResendAfter(Number(res.data.resend_after_seconds || 0));
        setTotal(Math.max(seconds, 1));
      })
      .catch((err) => {
        if (cancelled) return;
        if (onExpired && err.response?.data?.code === "verification_challenge_expired") {
          clearVerification(challengeId);
          onExpired();
          return;
        }
        setMessageType("error");
        setMessage(statusError ? t(statusError) : err.response?.data?.detail || t("Could not load email verification."));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [t, challengeId, onStatus, onExpired, statusError, setMessage, setMessageType]);

  useEffect(() => {
    if (loading) return undefined;
    const timer = window.setInterval(() => {
      setRemaining((value) => Math.max(0, value - 1));
      setResendAfter((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [loading]);

  const handleError = (err, fallback) => {
    if (onExpired && err.response?.data?.code === "verification_challenge_expired") {
      clearVerification(challengeId);
      onExpired();
      return;
    }
    setMessageType("error");
    setMessage(err.response?.data?.detail || t(fallback));
  };

  const updateCode = (event) => {
    setCode(event.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH));
    setMessage("");
  };
  const submit = async (event) => {
    event.preventDefault();
    if (code.length !== CODE_LENGTH) {
      setMessageType("error");
      setMessage(t("Enter the 6-digit verification code."));
      return;
    }
    setSubmitting(true);
    setMessage("");
    try {
      const res = await postWithCsrf("/api/v1/accounts/verification/confirm/", { code }, verificationConfig(challengeId));
      onVerified(res.data, reason);
    } catch (err) {
      handleError(err, "Verification failed. Please check the code.");
    } finally { setSubmitting(false); }
  };
  const resend = async () => {
    setResending(true);
    setMessage("");
    try {
      const res = await postWithCsrf("/api/v1/accounts/verification/resend/", {}, verificationConfig(challengeId));
      const seconds = Number(res.data.remaining_seconds || 600);
      setRemaining(seconds);
      setResendAfter(Number(res.data.resend_after_seconds || 0));
      setTotal(Math.max(seconds, 1));
      setCode("");
      setMessageType("success");
      setMessage(res.data.detail || t("Verification code resent."));
    } catch (err) {
      setResendAfter(Number(err.response?.data?.retry_after || 0));
      handleError(err, "Could not resend the verification code.");
    } finally { setResending(false); }
  };
  const cancelVerification = async () => {
    setSubmitting(true);
    try {
      await postWithCsrf("/api/v1/accounts/verification/cancel/", {}, verificationConfig(challengeId));
      clearVerification(challengeId);
      onCancelled();
    } catch (err) {
      handleError(err, "Could not cancel verification.");
    } finally { setSubmitting(false); }
  };
  const state = { code, email, reason, remaining, resendAfter, loading, submitting,
    resending, message, messageType, updateCode, submit, resend, cancelVerification,
    percent: Math.max(0, Math.min(100, (remaining / total) * 100)) };
  return children(state);
}
