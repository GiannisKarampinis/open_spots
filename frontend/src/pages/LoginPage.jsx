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

function fieldErrors(errors, name) {
  const value = errors?.[name];

  if (!value) return [];

  return Array.isArray(value) ? value : [value];
}

function getSafeRedirectPath(path) {
  if (!path) return "";

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

  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const nextFromQuery = new URLSearchParams(location.search).get("next");
  const nextFromState = location.state?.from;
  const nextFromStorage = sessionStorage.getItem("redirectAfterLogin");

  const next = getSafeRedirectPath(
    nextFromQuery || nextFromState || nextFromStorage || ""
  );

  const backendBase = getBackendBase();

  const googleLoginUrl = `${backendBase}/accounts/google/login/?process=login`;

  const updateField = (event) => {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));

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
      const res = await postWithCsrf("/api/v1/accounts/login/", {
        username: form.username,
        password: form.password,
      });
      storeAuthResponse(res.data);

      sessionStorage.removeItem("redirectAfterLogin");

      navigate(next || res.data.redirect_to || "/");
    } catch (err) {

      const data = err.response?.data;

      if (data?.requires_verification) {
        rememberVerification(data);
        setMessage(
          data.detail || t("Please verify your email before continuing.")
        );

        setTimeout(() => {
          navigate("/accounts/verify-email");
        }, 600);
      } else if (data?.detail) {
        setMessage(data.detail);
      } else if (data?.non_field_errors?.length) {
        setMessage(data.non_field_errors[0]);
      } else if (data?.username?.length) {
        setMessage(t("Username error", { error: data.username[0] }));
      } else if (data?.password?.length) {
        setMessage(t("Password error", { error: data.password[0] }));
      } else if (typeof data === "string") {
        setMessage(data);
      } else {
        setMessage(
          t("Login failed. Please check the browser console and Django logs.")
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const usernameErrors = fieldErrors(errors, "username");
  const passwordErrors = fieldErrors(errors, "password");
  const nonFieldErrors = fieldErrors(errors, "non_field_errors");
  const detailErrors = fieldErrors(errors, "detail");

  const feedbackMessages = [
    ...(message ? [message] : []),
    ...detailErrors,
    ...nonFieldErrors,
    ...usernameErrors,
    ...passwordErrors,
  ];

  const clearFeedback = () => {
    setMessage("");
    setErrors({});
  };

  return (
    <div className="login-container">
      <h2>{t("Welcome Back")}</h2>

      {feedbackMessages.length > 0 && (
        <div
          className="messages-container floating-messages"
          aria-live="polite"
          aria-atomic="true"
        >
          {feedbackMessages.map((feedbackMessage) => (
            <div
              className="alert alert-error fade-message"
              key={feedbackMessage}
            >
              {feedbackMessage}

              <button
                className="close-btn"
                type="button"
                onClick={clearFeedback}
                aria-label={t("Dismiss message")}
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="google-login-container">
        <a
          className="google-login-link"
          href={googleLoginUrl}
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

      <form className="login-form" onSubmit={submit}>
        <div>
          <label htmlFor="login-username">{t("Username")}</label>

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
          <label htmlFor="login-password">{t("Password")}</label>

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
