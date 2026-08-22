import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import axios from "axios";
import "../styles/auth.css";
import "../styles/feedback.css";

const initialForm = {
  firstname: "",
  lastname: "",
  username: "",
  email: "",
  phone_number: "",
  password: "",
  password2: "",
};

const REQUIRED_FIELDS_MESSAGE =
  "Please complete all required fields before creating your account.";

const PHONE_NUMBER_PATTERN = /^\+?\d{7,15}$/;

const PHONE_NUMBER_MESSAGE =
  "Please enter a valid phone number with 7 to 15 digits, optionally starting with +.";

function fieldErrors(errors, name) {
  const value = errors?.[name];

  if (!value) return [];

  return Array.isArray(value) ? value : [value];
}

export default function SignupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [feedbackKey, setFeedbackKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);

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

    setErrors({});
    setMessage("");

    const hasMissingRequiredField = Object.values(form).some(
      (value) => String(value).trim() === ""
    );

    if (hasMissingRequiredField) {
      setMessageType("error");
      setMessage(t(REQUIRED_FIELDS_MESSAGE));
      setFeedbackKey((current) => current + 1);
      return;
    }

    if (!PHONE_NUMBER_PATTERN.test(form.phone_number.trim())) {
      setMessageType("error");
      setErrors({
        phone_number: t(PHONE_NUMBER_MESSAGE),
      });
      setFeedbackKey((current) => current + 1);
      return;
    }

    setSubmitting(true);

    try {
      const res = await axios.post("/api/v1/accounts/register/", form, {
        withCredentials: true,
      });

      setMessageType("success");
      setMessage(res.data.detail || t("Account created. Please check your email."));
      setFeedbackKey((current) => current + 1);
      setForm(initialForm);

      setTimeout(() => {
        navigate("/accounts/verify-email");
      }, 600);
    } catch (err) {
      const data = err.response?.data || {};

      if (typeof data === "object") {
        setErrors(data);
        setFeedbackKey((current) => current + 1);
      } else {
        setMessageType("error");
        setMessage(t("Could not create the account. Please try again."));
        setFeedbackKey((current) => current + 1);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const fields = [
    ["firstname", t("First name"), "text", "given-name"],
    ["lastname", t("Last name"), "text", "family-name"],
    ["username", t("Username"), "text", "username"],
    ["email", t("Email"), "email", "email"],
    ["phone_number", t("Phone number"), "text", "tel"],
    ["password", t("Password"), "password", "new-password"],
    ["password2", t("Confirm password"), "password", "new-password"],
  ];

  const nonFieldErrors = fieldErrors(errors, "non_field_errors");
  const detailErrors = fieldErrors(errors, "detail");

  const firstFieldError = fields
    .map(([name]) => fieldErrors(errors, name)[0])
    .find(Boolean);

  const firstError = detailErrors[0] || nonFieldErrors[0] || firstFieldError;

  const feedbackMessages = [
    ...(message ? [message] : []),
    ...(firstError ? [firstError] : []),
  ];

  const clearFeedback = () => {
    setMessage("");
    setErrors({});
  };

  return (
    <div className="auth-container">
      <h2>{t("Sign Up")}</h2>

      {feedbackMessages.length > 0 && (
        <div
          className="messages-container floating-messages"
          key={feedbackKey}
          aria-live="polite"
          aria-atomic="true"
        >
          {feedbackMessages.map((feedbackMessage) => (
            <div
              className={`alert alert-${
                message && feedbackMessage === message ? messageType : "error"
              } fade-message`}
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

      <form className="auth-form" onSubmit={submit} noValidate>
        {fields.map(([name, label, type, autoComplete]) => {
          const errorsForField = fieldErrors(errors, name);

          return (
            <div className="auth-field" key={name}>
              <label htmlFor={`signup-${name}`}>
                {label}
                <span className="required-indicator" aria-hidden="true">
                  *
                </span>
              </label>

              <input
                id={`signup-${name}`}
                name={name}
                type={type}
                value={form[name]}
                onChange={updateField}
                aria-invalid={errorsForField.length > 0}
                autoComplete={autoComplete}
                required
              />
            </div>
          );
        })}

        <button className="auth-submit" type="submit" disabled={submitting}>
          {submitting ? t("Creating account...") : t("Create Account")}
        </button>
      </form>

      <p className="auth-prompt">
        <Trans
          i18nKey="Already have an account? Login"
          components={{
            loginLink: <Link to="/accounts/login" />,
          }}
        />
      </p>
    </div>
  );
}