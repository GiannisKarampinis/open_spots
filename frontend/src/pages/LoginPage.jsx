import { rememberVerification } from "../utils/verification";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { postWithCsrf } from "../utils/csrf";
import googleIcon from "../assets/google-icon.svg";
import { storeAuthResponse } from "../utils/auth";
import { getBackendBase } from "../utils/backendUrl";
import "../styles/login1.css";
import "../styles/feedback.css";

function getErrorMessage(value) {
  const message = Array.isArray(value) ? value[0] : value;
  return typeof message === "string" && message.trim() ? message : "";
}

function getSafeRedirectPath(path) {
  if (typeof path !== "string" || !path) return "";

  // Prevent external redirects like https://example.com
  if (
    path.startsWith("http://") ||
    path.startsWith("https://") ||
    path.startsWith("//")
  ) {
    return "";
  }

  return path.startsWith("/") ? path : "";
}

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({
    username: "",
    password: "",
  });

  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const nextFromQuery   = new URLSearchParams(location.search).get("next");
  const nextFromState   = location.state?.from;
  const next            = getSafeRedirectPath(nextFromQuery || nextFromState || "");
  const backendBase     = getBackendBase();
  const googleLoginUrl  = `${backendBase}/accounts/google/login/?process=login`;

  /* OK - REVIEWED */
  const updateField = (event) => {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));

    setMessage("");
  };

  /* OK - REVIEWED */
  const submitLoginForm = async (event) => {
    event.preventDefault();

    setSubmitting(true);
    setMessage("");

    try {
      const res = await postWithCsrf("/api/v1/accounts/login/", {
        username: form.username,
        password: form.password,
      });
      storeAuthResponse(res.data);

      sessionStorage.removeItem("redirectAfterLogin");

      const defaultRedirect = getSafeRedirectPath(res.data.redirect_to);
      navigate(next || defaultRedirect || "/", { replace: true });
    } catch (err) {

      const data = err.response?.data;
      const detail = getErrorMessage(data?.detail);
      const nonFieldError = getErrorMessage(data?.non_field_errors);
      const usernameError = getErrorMessage(data?.username);
      const passwordError = getErrorMessage(data?.password);

      if (data?.requires_verification) {
        rememberVerification(data);
        setMessage(
          detail || t("Please verify your email before continuing.")
        );

        setTimeout(() => {
          navigate("/accounts/verify-email");
        }, 600);

      } else if (detail) {
        setMessage(detail);
      } else if (nonFieldError) {
        setMessage(nonFieldError);
      } else if (usernameError) {
        setMessage(t("Username error", { error: usernameError }));
      } else if (passwordError) {
        setMessage(t("Password error", { error: passwordError }));
      } else if (err.request && !err.response) {
        setMessage(t("Unable to connect. Please check your connection and try again."));
      } else {
        setMessage(
          t("Unable to log in. Please try again.")
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  /* OK - REVIEWED */
  const clearFeedback = () => {
    setMessage("");
  };

  return (
    <div className="login-container">
      <h2>{t("Welcome Back")}</h2>

      {message && (
        <div className="messages-container floating-messages" aria-live="polite" aria-atomic="true">
          <div className="alert alert-error fade-message">
            {message}

            <button className="close-btn" type="button" onClick={clearFeedback} aria-label={t("Dismiss message")}>
              &times;
            </button>
          </div>
        </div>
      )}

      <div className="google-login-container">
        <a
          className="google-login-link"
          href={googleLoginUrl} /* calls the backend */
          aria-label={t("Login with Google")}
        >
          <img
            src={googleIcon}
            alt={t("Google logo")}
            className="google-icon"
          />
          {t("Login with Google")}
        </a>
      </div>

      <div className="divider">
        <span>{t("or")}</span>
      </div>

      <form className="login-form" onSubmit={submitLoginForm}>
        <div>
          <label htmlFor="login-username">{t("Username")}</label>

          <input
            id="login-username"
            name="username"
            type="text"
            value={form.username}
            onChange={updateField}
            autoComplete="username"
            required
          />
        </div>

        <div>
          <label htmlFor="login-password">{t("Password")}</label>

          <input
            id="login-password"
            name="password"
            type="password"
            value={form.password}
            onChange={updateField}
            autoComplete="current-password"
            required
          />
        </div>

        <button className="btn primary-btn" type="submit" disabled={submitting}>
          {submitting ? t("Logging in...") : t("Login")}
        </button>
      </form>

      <p className="auth-secondary-link">
        <Link to="/accounts/password-recover">
          {t("Forgot your password?")}
        </Link>
      </p>

      <p className="signup-prompt">
        <Trans
          i18nKey="Don't have an account? Sign up"
          components={{
            signupLink: <Link to="/accounts/signup" />,
          }}
        />
      </p>
    </div>
  );
}
