import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import googleIcon from "../assets/google-icon.svg";
import { storeAuthResponse } from "../utils/auth";
import "../styles/login1.css";
import "../styles/feedback.css";

function fieldErrors(errors, name) {
  const value = errors?.[name];
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function getSafeRedirectPath(path) {
  if (!path) return "";

  // Prevent external redirects like https://example.com
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("//")) {
    return "";
  }

  return path.startsWith("/") ? path : "";
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ username: "", password: "", code: "" });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);

  const nextFromQuery = new URLSearchParams(location.search).get("next");
  const nextFromState = location.state?.from;
  const nextFromStorage = sessionStorage.getItem("redirectAfterLogin");

  const next = getSafeRedirectPath(
    nextFromQuery || nextFromState || nextFromStorage || ""
  );

  const backendBase =
    import.meta.env.VITE_BACKEND_URL ||
    (window.location.port === "5173" ? "http://localhost:8000" : "");

  const googleLoginUrl = `${backendBase}/accounts/google/login/?process=login`;

  const updateField = (event) => {
    const { name, value } = event.target;

    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({
      ...current,
      [name]: undefined,
      non_field_errors: undefined,
    }));
    setMessage("");
  };

  const submit = async (event) => {
    event.preventDefault();

    setSubmitting(true);
    setErrors({});
    setMessage("");

    try {
      const res = requiresTwoFactor
        ? await axios.post(
            "/api/v1/accounts/login/2fa/",
            { code: form.code },
            { withCredentials: true },
          )
        : await axios.post(
            "/api/v1/accounts/login/",
            { username: form.username, password: form.password },
            { withCredentials: true },
          );

      if (res.data.requires_2fa) {
        setRequiresTwoFactor(true);
        setMessage(res.data.detail || "Enter the code from your authenticator app.");
        return;
      }

      storeAuthResponse(res.data);

      sessionStorage.removeItem("redirectAfterLogin");

      navigate(next || res.data.redirect_to || "/");
    } catch (err) {
      console.log("Login error status:", err.response?.status);
      console.log("Login error data:", err.response?.data);

      const data = err.response?.data;

      if (data?.requires_verification) {
        setMessage(data.detail || "Please verify your email before continuing.");
        setTimeout(() => navigate("/accounts/verify-email"), 600);
      } else if (data?.detail) {
        setMessage(data.detail);
      } else if (data?.non_field_errors?.length) {
        setMessage(data.non_field_errors[0]);
      } else if (data?.username?.length) {
        setMessage(`Username: ${data.username[0]}`);
      } else if (data?.password?.length) {
        setMessage(`Password: ${data.password[0]}`);
      } else if (typeof data === "string") {
        setMessage(data);
      } else {
        setMessage("Login failed. Please check the browser console and Django logs.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const usernameErrors = fieldErrors(errors, "username");
  const passwordErrors = fieldErrors(errors, "password");
  const codeErrors = fieldErrors(errors, "code");
  const nonFieldErrors = fieldErrors(errors, "non_field_errors");
  const detailErrors = fieldErrors(errors, "detail");

  const feedbackMessages = [
    ...(message ? [message] : []),
    ...detailErrors,
    ...nonFieldErrors,
    ...usernameErrors,
    ...passwordErrors,
    ...codeErrors,
  ];

  const clearFeedback = () => {
    setMessage("");
    setErrors({});
  };

  return (
    <div className="login-container">
      <h2>{requiresTwoFactor ? "Two-Factor Authentication" : "Welcome Back"}</h2>

      {feedbackMessages.length > 0 && (
        <div
          className="messages-container floating-messages"
          aria-live="polite"
          aria-atomic="true"
        >
          {feedbackMessages.map((feedbackMessage) => (
            <div className="alert alert-error fade-message" key={feedbackMessage}>
              {feedbackMessage}

              <button
                className="close-btn"
                type="button"
                onClick={clearFeedback}
                aria-label="Dismiss message"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      {!requiresTwoFactor && (
        <>
          <div className="google-login-container">
            <a
              className="google-login-link"
              href={googleLoginUrl}
              aria-label="Login with Google"
            >
              <img src={googleIcon} alt="Google logo" className="google-icon" />
              Login with Google
            </a>
          </div>

          <div className="divider">
            <span>or</span>
          </div>
        </>
      )}

      <form className="login-form" onSubmit={submit}>
        {requiresTwoFactor ? (
          <div>
            <label htmlFor="login-code">Authenticator code</label>
            <input
              id="login-code"
              name="code"
              type="text"
              inputMode="numeric"
              value={form.code}
              onChange={updateField}
              aria-invalid={codeErrors.length > 0}
              autoComplete="one-time-code"
              required
            />
          </div>
        ) : (
          <>
            <div>
              <label htmlFor="login-username">Username</label>
              <input
                id="login-username"
                name="username"
                type="text"
                value={form.username}
                onChange={updateField}
                aria-invalid={usernameErrors.length > 0}
                autoComplete="username"
                required
              />
            </div>

            <div>
              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
                name="password"
                type="password"
                value={form.password}
                onChange={updateField}
                aria-invalid={passwordErrors.length > 0}
                autoComplete="current-password"
                required
              />
            </div>
          </>
        )}

        <button className="btn primary-btn" type="submit" disabled={submitting}>
          {submitting ? "Logging in..." : requiresTwoFactor ? "Verify" : "Login"}
        </button>

        {requiresTwoFactor && (
          <button
            className="btn secondary-btn"
            type="button"
            onClick={() => {
              setRequiresTwoFactor(false);
              setForm((current) => ({ ...current, code: "" }));
              clearFeedback();
            }}
            disabled={submitting}
          >
            Back
          </button>
        )}
      </form>

      {!requiresTwoFactor && (
        <p className="auth-secondary-link">
          <Link to="/accounts/password-recover">Forgot your password?</Link>
        </p>
      )}

      {!requiresTwoFactor && (
        <p className="signup-prompt">
          Don&apos;t have an account? <Link to="/accounts/signup">Sign up</Link>
        </p>
      )}
    </div>
  );
}
