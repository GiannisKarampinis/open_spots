import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
  const [code, setCode]             = useState("");
  const [email, setEmail]           = useState("");
  const [remaining, setRemaining]   = useState(0);
  const [total, setTotal]           = useState(600);
  const [message, setMessage]       = useState("");
  const [messageType, setMessageType] = useState("success");
  const [loading, setLoading]       = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending]   = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchStatus() {
      try {
        const res = await axios.get("/api/v1/accounts/verification/status/", { withCredentials: true });
        if (cancelled) return;
        const seconds = Number(res.data.remaining_seconds || 0);
        setEmail(res.data.email || "");
        setRemaining(seconds);
        setTotal(Math.max(seconds, 1));
      } catch (err) {
        if (!cancelled) {
          setMessageType("error");
          setMessage("No pending verification was found. Please sign up or log in again.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchStatus();
    return () => {
      cancelled = true;
    };
  }, []);

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
    const digitsOnly = event.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH);
    setCode(digitsOnly);
    setMessage("");
  };

  const submit = async (event) => {
    event.preventDefault();
    if (code.length !== CODE_LENGTH) {
      setMessageType("error");
      setMessage("Enter the 6-digit verification code.");
      return;
    }

    setSubmitting(true);
    setMessage("");
    try {
      const res = await axios.post("/api/v1/accounts/verification/confirm/", { code }, { withCredentials: true });
      storeAuthResponse(res.data);
      setMessageType("success");
      setMessage(res.data.detail || "Email verified successfully.");
      setTimeout(() => navigate(res.data.redirect_to || "/"), 700);
    } catch (err) {
      setMessageType("error");
      setMessage(err.response?.data?.detail || "Verification failed. Please check the code.");
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setMessage("");
    try {
      const res = await axios.post("/api/v1/accounts/verification/resend/", {}, { withCredentials: true });
      const seconds = Number(res.data.remaining_seconds || 600);
      setRemaining(seconds);
      setTotal(seconds);
      setCode("");
      setMessageType("success");
      setMessage(res.data.detail || "Verification code resent.");
    } catch (err) {
      setMessageType("error");
      setMessage(err.response?.data?.detail || "Could not resend the verification code.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="verification-page">
      <div className="verification-container">
        <h2>Verify Your Email</h2>
        <p>
          Please enter the 6-digit code we sent
          {email ? <> to <strong>{email}</strong></> : " to your email address"}.
        </p>

        {message && <div className={`auth-message ${messageType}`}>{message}</div>}

        <form className="verification-form" onSubmit={submit}>
          <input
            type="text"
            inputMode="numeric"
            maxLength={CODE_LENGTH}
            pattern="\d{6}"
            value={code}
            onChange={updateCode}
            placeholder="Enter 6-digit code"
            autoFocus
            disabled={loading}
            required
          />
          <button type="submit" disabled={submitting || loading || remaining <= 0}>
            {submitting ? "Verifying..." : "Verify"}
          </button>
        </form>

        <button className="resend-button" type="button" onClick={resend} disabled={resending || loading}>
          {resending ? "Sending..." : "Resend Code"}
        </button>

        <p className="auth-prompt">
          Need a different account? <Link to="/accounts/signup">Sign up again</Link>
        </p>
      </div>

      {!loading && (
        <div className="verification-countdown">
          {remaining > 0 ? (
            <>
              Verification code expires in <span>{formatSeconds(remaining)}</span>.
              <div className="verification-bar-bg">
                <div className="verification-bar-fill" style={{ width: `${percent}%` }} />
              </div>
            </>
          ) : (
            <div className="auth-message error">Verification code has expired. Please resend the code.</div>
          )}
        </div>
      )}
    </div>
  );
}
