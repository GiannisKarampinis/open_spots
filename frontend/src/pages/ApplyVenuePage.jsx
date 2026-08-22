import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { csrfPost } from "../api/csrf";
import "../styles/apply_venue.css";
import "../styles/partial_signup.css";
import "../styles/verify_code.css";
import "../styles/feedback.css";

const initialForm = {
  admin_firstname: "",
  admin_lastname: "",
  admin_username: "",
  admin_email: "",
  admin_phone: "",
  password: "",
  password2: "",
  venue_name: "",
  venue_type: "restaurant",
  location: "",
  description: "",
  phone: "",
};

function fieldErrors(errors, name) {
  const value = errors?.[name];

  if (!value) return [];

  return Array.isArray(value) ? value : [value];
}

function firstApiError(data, t) {
  if (!data) return t("Could not submit the application.");

  if (typeof data === "string") {
    return data || t("Could not submit the application.");
  }

  if (data.detail) return data.detail;

  if (Array.isArray(data.non_field_errors) && data.non_field_errors.length) {
    return data.non_field_errors[0];
  }

  for (const [field, value] of Object.entries(data)) {
    if (field === "non_field_errors") continue;

    const label = field.replaceAll("_", " ");

    if (Array.isArray(value) && value.length) {
      return `${label}: ${value[0]}`;
    }

    if (typeof value === "string" && value) {
      return `${label}: ${value}`;
    }
  }

  return t("Could not submit the application.");
}

export default function ApplyVenuePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const timerRef = useRef(null);
  const abortRef = useRef(null);

  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [emailVerified, setEmailVerified] = useState(false);
  const [code, setCode] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [suggestions, setSuggestions] = useState([]);

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

    if (name === "admin_email") {
      setEmailVerified(false);
    }
  };

  const sendCode = async () => {
    if (!form.admin_email) {
      setMessageType("error");
      setMessage(t("Enter admin email first."));
      return;
    }

    setSendingCode(true);
    setMessage("");

    try {
      const res = await csrfPost("/api/v1/venues/verification/send/", {
        email: form.admin_email,
      });

      setMessageType("success");
      setMessage(res.data.detail || t("Code sent. Check your inbox."));
    } catch (err) {
      setMessageType("error");
      setMessage(err.response?.data?.detail || t("Failed to send code."));
    } finally {
      setSendingCode(false);
    }
  };

  const verifyCode = async () => {
    if (!/^\d{6}$/.test(code)) {
      setMessageType("error");
      setMessage(t("Enter a valid 6-digit code."));
      return;
    }

    setVerifying(true);
    setMessage("");

    try {
      const res = await csrfPost("/api/v1/venues/verification/confirm/", {
        code,
      });

      setEmailVerified(true);
      setMessageType("success");
      setMessage(res.data.detail || t("Email verified"));
    } catch (err) {
      setEmailVerified(false);
      setMessageType("error");
      setMessage(err.response?.data?.detail || t("Verification failed."));
    } finally {
      setVerifying(false);
    }
  };

  const searchLocation = (value) => {
    updateField({
      target: {
        name: "location",
        value,
      },
    });

    if (value.trim().length < 3) {
      setSuggestions([]);
      return;
    }

    window.clearTimeout(timerRef.current);

    timerRef.current = window.setTimeout(async () => {
      try {
        if (abortRef.current) {
          abortRef.current.abort();
        }

        abortRef.current = new AbortController();

        const url = new URL("https://nominatim.openstreetmap.org/search");

        url.searchParams.set("format", "json");
        url.searchParams.set("addressdetails", "1");
        url.searchParams.set("limit", "6");
        url.searchParams.set("countrycodes", "gr");
        url.searchParams.set("q", value);

        const res = await fetch(url.toString(), {
          signal: abortRef.current.signal,
          headers: {
            Accept: "application/json",
          },
        });

        setSuggestions(res.ok ? await res.json() : []);
      } catch {
        // Request was probably aborted.
      }
    }, 250);
  };

  const submit = async (event) => {
    event.preventDefault();

    if (form.password !== form.password2) {
      setErrors({
        password2: [t("Password fields did not match.")],
      });
      return;
    }

    if (!emailVerified) {
      setMessageType("error");
      setMessage(t("You must verify this email before submitting the application."));
      return;
    }

    setSubmitting(true);
    setErrors({});
    setMessage("");

    try {
      const payload = {
        ...form,
      };

      delete payload.password2;

      await csrfPost("/api/v1/venues/apply/", payload);

      navigate("/venues/application-submitted");
    } catch (err) {
      const data = err.response?.data || {};

      if (typeof data === "object") {
        setErrors(data);
      }

      setMessageType("error");
      setMessage(firstApiError(data, t));
    } finally {
      setSubmitting(false);
    }
  };

  const renderErrors = (name) => {
    return fieldErrors(errors, name).map((error) => (
      <li key={error}>{error}</li>
    ));
  };

  const fields = [
    ["admin_firstname", "First name", "text", true],
    ["admin_lastname", "Last name", "text", true],
    ["admin_username", "Username", "text", true],
    ["admin_phone", "Owner phone", "text", true],
    ["password", "Password", "password", true],
    ["password2", "Confirm password", "password", true],
    ["venue_name", "Venue name", "text", true],
    ["phone", "Venue phone", "text", true],
  ];

  return (
    <div className="apply-container">
      <div className="form-header">
        <h2>{t("Apply to Register Your Venue")}</h2>

        <p className="form-intro">
          {t("Fields marked with")}{" "}
          <span className="text-danger">*</span>{" "}
          {t(
            "are required. You must also verify your admin email before submitting the application."
          )}
        </p>
      </div>

      {message && (
        <div
          className={`alert alert-${
            messageType === "success" ? "success" : "error"
          }`}
        >
          {message}
        </div>
      )}

      <form id="apply-venue-form" onSubmit={submit} noValidate>
        <div className="section-body">
          {fields.slice(0, 3).map(([name, label, type, required]) => (
            <div className="form-group" key={name}>
              <label htmlFor={name}>
                {t(label)}
                {required && <span className="text-danger">*</span>}
              </label>

              <input
                id={name}
                name={name}
                type={type}
                value={form[name]}
                onChange={updateField}
                required={required}
                aria-invalid={fieldErrors(errors, name).length > 0}
              />

              <ul className="errorlist">{renderErrors(name)}</ul>
            </div>
          ))}

          <div className="form-group email-verify-wrapper">
            <label htmlFor="admin_email">
              {t("Admin email")}
              <span className="text-danger">*</span>
            </label>

            <div className="email-verify-row">
              <input
                id="admin_email"
                name="admin_email"
                type="email"
                value={form.admin_email}
                onChange={updateField}
                required
              />

              <button
                type="button"
                onClick={sendCode}
                disabled={sendingCode || emailVerified}
              >
                {emailVerified
                  ? t("Verified")
                  : sendingCode
                    ? t("Sending...")
                    : t("Verify Email")}
              </button>
            </div>

            <div className="email-code-row">
              <input
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder={t("Enter 6-digit code")}
                disabled={emailVerified}
              />

              <button
                type="button"
                onClick={verifyCode}
                disabled={verifying || emailVerified}
              >
                {verifying ? t("Verifying...") : t("Verify")}
              </button>
            </div>

            <ul className="errorlist">{renderErrors("admin_email")}</ul>
          </div>

          {fields.slice(3).map(([name, label, type, required]) => (
            <div className="form-group" key={name}>
              <label htmlFor={name}>
                {t(label)}
                {required && <span className="text-danger">*</span>}
              </label>

              <input
                id={name}
                name={name}
                type={type}
                value={form[name]}
                onChange={updateField}
                required={required}
                aria-invalid={fieldErrors(errors, name).length > 0}
              />

              <ul className="errorlist">{renderErrors(name)}</ul>
            </div>
          ))}
        </div>

        <div className="form-group">
          <label htmlFor="venue_type">
            {t("Venue type")}
            <span className="text-danger">*</span>
          </label>

          <select
            id="venue_type"
            name="venue_type"
            value={form.venue_type}
            onChange={updateField}
          >
            <option value="restaurant">{t("Restaurant")}</option>
            <option value="cafe">{t("Cafe")}</option>
            <option value="bar">{t("Bar")}</option>
            <option value="beach_bar">{t("Beach Bar")}</option>
            <option value="other">{t("Other")}</option>
          </select>

          <ul className="errorlist">{renderErrors("venue_type")}</ul>
        </div>

        <div className="form-group" style={{ position: "relative" }}>
          <label htmlFor="location">
            {t("Location")}
            <span className="text-danger">*</span>
          </label>

          <input
            id="location"
            name="location"
            value={form.location}
            onChange={(event) => searchLocation(event.target.value)}
            required
          />

          {suggestions.length > 0 && (
            <div className="location-suggestions">
              {suggestions.map((item) => (
                <button
                  type="button"
                  key={item.place_id}
                  onClick={() => {
                    setForm((current) => ({
                      ...current,
                      location: item.display_name,
                    }));
                    setSuggestions([]);
                  }}
                >
                  {item.display_name}
                </button>
              ))}
            </div>
          )}

          <ul className="errorlist">{renderErrors("location")}</ul>
        </div>

        <div className="form-group">
          <label htmlFor="description">{t("Description")}</label>

          <textarea
            id="description"
            name="description"
            rows="5"
            value={form.description}
            onChange={updateField}
          />

          <ul className="errorlist">{renderErrors("description")}</ul>
        </div>

        <button
          id="submitApplicationBtn"
          type="submit"
          className="btn primary-btn mt-3"
          disabled={submitting || !emailVerified}
        >
          {submitting ? t("Submitting...") : t("Submit Application")}
        </button>
      </form>
    </div>
  );
}