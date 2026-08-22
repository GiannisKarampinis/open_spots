import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import axios from "axios";
import { storeAuthResponse } from "../utils/auth";
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

  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [remaining, setRemaining] = useState(0);
  const [total, setTotal] = useState(600);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchStatus() {
      try {
        const res = await axios.get("/api/v1/accounts/verification/status/", {
          withCredentials: true,
        });

        if (cancelled) return;

        const seconds = Number(res.data.remaining_seconds || 0);

        setEmail(res.data.email || "");
        setReason(res.data.reason || "");
        setRemaining(seconds);
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
  }, [t]);

  useEffect(() => {
    if (remaining <= 0) return undefined;

    const interval = window.setInterval(() => {
      setRemaining((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [remaining]);

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
      const res = await axios.post(
        "/api/v1/accounts/verification/confirm/",
        { code },
        { withCredentials: true }
      );

      storeAuthResponse(res.data);

      setMessageType("success");
      setMessage(res.data.detail || t("Email verified successfully."));

      setTimeout(() => {
        navigate(
          res.data.redirect_to ||
            (reason === "password_recovery" ? "/accounts/reset-password" : "/")
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
      const res = await axios.post(
        "/api/v1/accounts/verification/resend/",
        {},
        { withCredentials: true }
      );

      const seconds = Number(res.data.remaining_seconds || 600);

      setRemaining(seconds);
      setTotal(seconds);
      setCode("");
      setMessageType("success");
      setMessage(res.data.detail || t("Verification code resent."));
    } catch (err) {
      setMessageType("error");
      setMessage(
        err.response?.data?.detail ||
          t("Could not resend the verification code.")
      );
    } finally {
      setResending(false);
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

          <button type="submit" disabled={submitting || loading || remaining <= 0}>
            {submitting ? t("Verifying...") : t("Verify")}
          </button>
        </form>

        <button
          className="resend-button"
          type="button"
          onClick={resend}
          disabled={resending || loading}
        >
          {resending ? t("Sending...") : t("Resend Code")}
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