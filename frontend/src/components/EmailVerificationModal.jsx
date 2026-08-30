import { useEffect, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import axios from "axios";
import { postWithCsrf } from "../utils/csrf";
import { storeAuthResponse } from "../utils/auth";
import { useToastMessage } from "./ToastProvider";

const CODE_LENGTH = 6;

function formatSeconds(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export default function EmailVerificationModal({ onClose, onVerified }) {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [remaining, setRemaining] = useState(0);
  const [resendAfter, setResendAfter] = useState(0);
  const [total, setTotal] = useState(1);
  const [message, setMessage, messageType, setMessageType] = useToastMessage("error");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    axios.get("/api/v1/accounts/verification/status/", { withCredentials: true })
      .then((res) => {
        if (cancelled) return;
        const seconds = Number(res.data.remaining_seconds || 0);
        setEmail(res.data.email || "");
        setRemaining(seconds);
        setResendAfter(Number(res.data.resend_after_seconds || 0));
        setTotal(Math.max(seconds, 1));
      })
      .catch((err) => {
        if (!cancelled) setMessage(err.response?.data?.detail || t("Could not load email verification."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [t]);

  useEffect(() => {
    if (remaining <= 0) return undefined;
    const timer = window.setInterval(
      () => setRemaining((value) => Math.max(0, value - 1)),
      1000
    );
    return () => window.clearInterval(timer);
  }, [remaining]);

  useEffect(() => {
    if (resendAfter <= 0) return undefined;
    const timer = window.setInterval(
      () => setResendAfter((value) => Math.max(0, value - 1)),
      1000
    );
    return () => window.clearInterval(timer);
  }, [resendAfter]);

  const percent = useMemo(
    () => Math.max(0, Math.min(100, (remaining / total) * 100)),
    [remaining, total]
  );

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
      const res = await postWithCsrf("/api/v1/accounts/verification/confirm/", { code });
      storeAuthResponse(res.data);
      onVerified(res.data.user, res.data.detail);
    } catch (err) {
      setMessageType("error");
      setMessage(err.response?.data?.detail || t("Verification failed. Please check the code."));
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setMessage("");
    try {
      const res = await postWithCsrf("/api/v1/accounts/verification/resend/", {});
      const seconds = Number(res.data.remaining_seconds || 600);
      setRemaining(seconds);
      setResendAfter(Number(res.data.resend_after_seconds || 0));
      setTotal(Math.max(seconds, 1));
      setCode("");
      setMessageType("success");
      setMessage(res.data.detail || t("Verification code resent."));
    } catch (err) {
      setResendAfter(Number(err.response?.data?.retry_after || 0));
      setMessageType("error");
      setMessage(err.response?.data?.detail || t("Could not resend the verification code."));
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="email-verification-backdrop" role="presentation">
      <section className="email-verification-modal" role="dialog" aria-modal="true" aria-labelledby="email-verification-title">
        <button type="button" className="email-verification-close" onClick={onClose} aria-label={t("Close")}>×</button>
        <h2 id="email-verification-title">{t("Verify Your New Email")}</h2>
        <p>
          <Trans
            i18nKey="Verify the new email before applying profile changes."
            values={{ email }}
            components={{ strong: <strong /> }}
          />
        </p>
        {message && <div className={`auth-message ${messageType}`}>{message}</div>}
        <form className="email-verification-form" onSubmit={submit}>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={CODE_LENGTH}
            pattern="\d{6}"
            value={code}
            onChange={(event) => {
              setCode(event.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH));
              setMessage("");
            }}
            placeholder={t("Enter 6-digit code")}
            aria-label={t("Enter 6-digit code")}
            autoFocus
            disabled={loading}
            required
          />
          <button type="submit" disabled={loading || submitting || remaining <= 0}>
            {submitting ? t("Verifying...") : t("Verify and Update Profile")}
          </button>
        </form>
        <button className="email-verification-resend" type="button" onClick={resend} disabled={loading || resending || resendAfter > 0}>
          {resending
            ? t("Sending...")
            : resendAfter > 0
              ? t("Resend available in {{time}}", { time: formatSeconds(resendAfter) })
              : t("Resend Code")}
        </button>
        {!loading && (
          <div className="email-verification-countdown">
            {remaining > 0 ? (
              <>
                <span>{t("Code expires in {{time}}", { time: formatSeconds(remaining) })}</span>
                <div className="email-verification-bar"><span style={{ width: `${percent}%` }} /></div>
              </>
            ) : t("Verification code has expired. Please resend the code.")}
          </div>
        )}
      </section>
    </div>
  );
}
