import { VerificationReason } from "../utils/verificationReasons";
import { getVerificationChallenge, getResetToken, clearVerification, verificationConfig, rememberResetToken } from "../utils/verification";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import axios from "axios";
import { postWithCsrf } from "../utils/csrf";
import { clearStoredAuth, storeAuthResponse } from "../utils/auth";
import { useToastMessage } from "../components/ToastProvider";
import "../styles/auth.css";

const CODE_LENGTH = 6;

function formatSeconds(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export default function VerifyEmailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [challengeId] = useState(getVerificationChallenge);
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [remaining, setRemaining] = useState(0);
  const [resendAfter, setResendAfter] = useState(0);
  const [total, setTotal] = useState(600);
  const [message, setMessage, messageType, setMessageType] = useToastMessage("success");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchStatus() {
      try {
        const res = await axios.get("/api/v1/accounts/verification/status/", {
          ...verificationConfig(challengeId),
        });

        if (cancelled) return;
        if (res.data.verified && res.data.reason === VerificationReason.PASSWORD_RECOVERY && getResetToken()) {
          navigate("/accounts/reset-password");
          return;
        }

        const seconds = Number(res.data.remaining_seconds || 0);

        setEmail(res.data.email || "");
        setReason(res.data.reason || "");
        setRemaining(seconds);
        setResendAfter(Number(res.data.resend_after_seconds || 0));
        setTotal(Math.max(seconds, 1));
      } catch (err) {
        if (!cancelled) {
          setMessageType("error");
          setMessage(
            t("No pending verification was found. Please sign up or log in again.")
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchStatus();

    return () => {
      cancelled = true;
    };
  }, [t, challengeId, navigate]);

  useEffect(() => {
    if (remaining <= 0) return undefined;

    const interval = window.setInterval(() => {
      setRemaining((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [remaining]);

  useEffect(() => {
    if (resendAfter <= 0) return undefined;

    const interval = window.setInterval(() => {
      setResendAfter((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [resendAfter]);

  const percent = useMemo(() => {
    if (!total) return 0;
    return Math.max(0, Math.min(100, (remaining / total) * 100));
  }, [remaining, total]);

  const updateCode = (event) => {
    const digitsOnly = event.target.value
      .replace(/\D/g, "")
      .slice(0, CODE_LENGTH);

    setCode(digitsOnly);
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
      const res = await postWithCsrf(
        "/api/v1/accounts/verification/confirm/",
        { code },
        verificationConfig(challengeId)
      );

      if (res.data.reset_token) rememberResetToken(res.data.reset_token, challengeId);
      else clearVerification(challengeId);

      if (res.data.access || res.data.user) {
        storeAuthResponse(res.data);
      } else if (res.data.session_invalidated) {
        clearStoredAuth();
      }

      setMessageType("success");
      setMessage(res.data.detail || t("Email verified successfully."));

      setTimeout(() => {
        navigate(
          res.data.redirect_to ||
            (reason === VerificationReason.PASSWORD_RECOVERY ? "/accounts/reset-password" : "/")
        );
      }, 700);
    } catch (err) {
      setMessageType("error");
      setMessage(
        err.response?.data?.detail ||
          t("Verification failed. Please check the code.")
      );
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setMessage("");

    try {
      const res = await postWithCsrf(
        "/api/v1/accounts/verification/resend/",
        {},
        verificationConfig(challengeId)
      );

      const seconds = Number(res.data.remaining_seconds || 600);

      setRemaining(seconds);
      setResendAfter(Number(res.data.resend_after_seconds || 0));
      setTotal(seconds);
      setCode("");
      setMessageType("success");
      setMessage(res.data.detail || t("Verification code resent."));
    } catch (err) {
      setResendAfter(Number(err.response?.data?.retry_after || 0));
      setMessageType("error");
      setMessage(
        err.response?.data?.detail ||
          t("Could not resend the verification code.")
      );
    } finally {
      setResending(false);
    }
  };

  const cancelVerification = async () => {
    setSubmitting(true);
    try {
      await postWithCsrf("/api/v1/accounts/verification/cancel/", {}, verificationConfig(challengeId));
      clearVerification(challengeId);
      navigate("/accounts/login");
    } catch (err) {
      setMessageType("error");
      setMessage(err.response?.data?.detail || t("Could not cancel verification."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="verification-page">
      <div className="verification-container">
        <h2>{t("Verify Your Email")}</h2>

        <p>
          {email ? (
            <Trans
              i18nKey="Please enter the 6-digit code we sent to email."
              values={{ email }}
              components={{ strong: <strong /> }}
            />
          ) : (
            t("Please enter the 6-digit code we sent to your email address.")
          )}
        </p>

        {message && (
          <div className={`auth-message ${messageType}`}>
            {message}
          </div>
        )}

        <form className="verification-form" onSubmit={submit}>
          <input
            type="text"
            inputMode="numeric"
            maxLength={CODE_LENGTH}
            pattern="\d{6}"
            value={code}
            onChange={updateCode}
            placeholder={t("Enter 6-digit code")}
            autoFocus
            disabled={loading}
            required
          />

          <button type="submit" disabled={submitting || resending || loading || remaining <= 0}>
            {submitting ? t("Verifying...") : t("Verify")}
          </button>
        </form>

        <button
          className="resend-button"
          type="button"
          onClick={resend}
          disabled={submitting || resending || loading || resendAfter > 0}
        >
          {resending
            ? t("Sending...")
            : resendAfter > 0
              ? t("Resend available in {{time}}", { time: formatSeconds(resendAfter) })
              : t("Resend Code")}
        </button>

        <button type="button" onClick={cancelVerification} disabled={loading || submitting || resending}>
          {t("Cancel verification")}
        </button>
        <p className="auth-prompt">
          <Trans
            i18nKey="Need a different account? Sign up again"
            components={{
              signupLink: <Link to="/accounts/signup" />,
            }}
          />
        </p>
      </div>

      {!loading && (
        <div className="verification-countdown">
          {remaining > 0 ? (
            <>
              <Trans
                i18nKey="Verification code expires in time."
                values={{ time: formatSeconds(remaining) }}
                components={{ span: <span /> }}
              />

              <div className="verification-bar-bg">
                <div
                  className="verification-bar-fill"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </>
          ) : (
            <div className="auth-message error">
              {t("Verification code has expired. Please resend the code.")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
