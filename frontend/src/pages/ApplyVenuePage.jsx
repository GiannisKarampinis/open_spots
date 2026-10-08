import { useCallback, useEffect, useRef, useState }   from "react";
import { useNavigate }        from "react-router-dom";
import { useTranslation }     from "react-i18next";
import { postWithCsrf }       from "../utils/csrf";
import { verificationConfig } from "../utils/verification";
import EmailVerificationModal from "../components/EmailVerificationModal";
import { useToastMessage }    from "../components/ToastProvider";
import "../styles/openspots-forms-style.css";
import "../styles/apply_venue.css";
import "../styles/feedback.css";

const initialForm = {
  admin_firstname: "",
  admin_lastname:  "",
  admin_username:  "",
  admin_email:     "",
  admin_phone:     "",
  password:        "",
  password2:       "",
  venue_name:      "",
  venue_type:      "restaurant",
  location:        "",
  description:     "",
  phone:           "",
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
  const locationRequestRef = useRef(0);
  const verificationRef = useRef({ email: "", challengeId: "" });
  const verifyButtonRef = useRef(null);

  useEffect(() => () => {
    window.clearTimeout(timerRef.current);
    abortRef.current?.abort();
    locationRequestRef.current += 1;
    verificationRef.current = { email: "", challengeId: "" };
  }, []);

  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [, setMessage] = useToastMessage("success");
  const [submissionError, setSubmissionError] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);
  const [venueChallengeId, setVenueChallengeId] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  const [showEmailVerification, setShowEmailVerification] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
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

    setSubmissionError("");

    if (name === "admin_email") {
      verificationRef.current = { email: "", challengeId: "" };
      setEmailVerified(false);
      setVenueChallengeId("");
      setVerificationToken("");
      setShowEmailVerification(false);
    }
  };

  const setFieldError = (name, message) => {
    setErrors((current) => ({ ...current, [name]: message ? [message] : undefined }));
  };

  const sendCode = async () => {
    setFieldError("admin_email", "");
    if (!form.admin_email) {
      setFieldError("admin_email", t("Enter admin email first."));
      return;
    }

    if (venueChallengeId) {
      setShowEmailVerification(true);
      return;
    }

    setSendingCode(true);
    setSubmissionError("");

    try {
      const res = await postWithCsrf("/api/v1/venues/verification/send/", {
        email: form.admin_email,
      }, verificationConfig(venueChallengeId));
      verificationRef.current = { email: form.admin_email, challengeId: res.data.challenge_id };
      setVenueChallengeId(res.data.challenge_id);
      setVerificationToken("");

      setShowEmailVerification(true);
    } catch (err) {
      setFieldError("admin_email", err.response?.data?.detail || fieldErrors(err.response?.data, "email")[0] || t("Failed to send code."));
      if (err.response?.status === 400) setVenueChallengeId("");
    } finally {
      setSendingCode(false);
    }
  };

  const resetEmailVerification = useCallback(() => {
    verificationRef.current = { email: "", challengeId: "" };
    setEmailVerified(false);
    setVerificationToken("");
    setVenueChallengeId("");
    setShowEmailVerification(false);
  }, []);

  const handleExpiredVerification = useCallback(() => {
    resetEmailVerification();
    setErrors((current) => ({ ...current, admin_email: [t("Email verification expired. Please try again.")] }));
  }, [resetEmailVerification, t]);

  const finishEmailVerification = (data) => {
    const current = verificationRef.current;
    if (current.email !== form.admin_email || current.challengeId !== venueChallengeId) return;
    if (!data.verification_token || data.email?.trim().toLowerCase() !== current.email.trim().toLowerCase()) {
      resetEmailVerification();
      setFieldError("admin_email", t("You must verify this email before submitting the application."));
      return;
    }
    setVerificationToken(data.verification_token);
    setEmailVerified(true);
    setShowEmailVerification(false);
    setFieldError("admin_email", "");
    setMessage(data.detail || t("Email verified"));
  };

  const searchLocation = (value) => {
    updateField({
      target: {
        name: "location",
        value,
      },
    });

    window.clearTimeout(timerRef.current);
    abortRef.current?.abort();
    const requestId = ++locationRequestRef.current;
    setSuggestions([]);

    if (value.trim().length < 3) {
      setSuggestions([]);
      return;
    }

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

        const results = res.ok ? await res.json() : [];
        if (requestId === locationRequestRef.current) setSuggestions(results);
      } catch {
        // Request was probably aborted.
      }
    }, 250);
  };

  

  
  const submit = async (event) => {
    event.preventDefault();

    const requiredErrors = {};
    const requiredFields = [
      ...fields.filter(([, , , required]) => required).map(([name]) => name),
      "admin_email",
      "location",
    ];
    for (const name of requiredFields) {
      const value = form[name];
      const empty = !value.trim();
      if (empty) requiredErrors[name] = [t("This field is required.")];
    }
    if (Object.keys(requiredErrors).length) {
      setErrors(requiredErrors);
      return;
    }

    if (form.password.trim() !== form.password2.trim()) {
      setErrors({
        password2: [t("Password fields did not match.")],
      });
      return;
    }

    if (!emailVerified) {
      setFieldError("admin_email", t("You must verify this email before submitting the application."));
      return;
    }

    setSubmitting(true);
    setErrors({});
    setSubmissionError("");

    try {
      const payload = {
        ...form,
        verification_token: verificationToken,
      };

      delete payload.password2;

      await postWithCsrf("/api/v1/venues/apply/", payload, verificationConfig(venueChallengeId));
      setVerificationToken("");
      setVenueChallengeId("");

      navigate("/venues/application-submitted");
    } catch (err) {
      const data = err.response?.data || {};

      if (data.verification_required) {
        verificationRef.current = { email: "", challengeId: "" };
        setEmailVerified(false);
        setVenueChallengeId("");
        setVerificationToken("");
        setShowEmailVerification(false);
      }

      if (typeof data === "object") {
        setErrors(data);
      }

      setSubmissionError(firstApiError(data, t));
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
    ["admin_firstname", "First name",       "text",       true],
    ["admin_lastname",  "Last name",        "text",       true],
    ["admin_username",  "Username",         "text",       true],
    ["admin_phone",     "Owner phone",      "text",       true],
    ["password",        "Password",         "password",   true],
    ["password2",       "Confirm password", "password",   true],
    ["venue_name",      "Venue name",       "text",       true],
    ["phone",           "Venue phone",      "text",       true],
  ];

  return (
    <section className="openspots-form-panel openspots-form-section apply-container" aria-labelledby="apply-venue-heading">
      {/* OK - REVIEWED */}
      <div className="form-header">  
        <h3 id="apply-venue-heading">{t("Apply to Register Your Venue")}</h3>
        
        <p className="form-intro">
          {t("Fields marked with")}{" "}
          <span className="text-danger">*</span>{" "}
          {t("are required. You must also verify your admin email before submitting the application.")}
        </p>
      
      </div>

      <form id="apply-venue-form" className="openspots-form-fields" onSubmit={submit} autoComplete="off" noValidate>
      
        <div className="section-body openspots-form-fields">
          {fields.slice(0, 3).map(([name, label, type, required]) => (
            <div className="openspots-form-field" key={name}>
              <label htmlFor={name}>
                {t(label)}
                {required && <span className="text-danger">*</span>}
              </label>

              <input
                id={name}
                name={name}
                type={type}
                autoComplete={type === "password" ? "new-password" : "off"}
                value={form[name]}
                onChange={updateField}
                required={required}
                aria-invalid={fieldErrors(errors, name).length > 0}
              />

              <ul className="errorlist">{renderErrors(name)}</ul>
            </div>
          ))}

          <div className="openspots-form-field email-verify-wrapper">
            <label htmlFor="admin_email">
              {t("Admin email")}
              <span className="text-danger">*</span>
            </label>

            <div className="email-verify-row">
              <input
                aria-invalid={fieldErrors(errors, "admin_email").length > 0}
                aria-describedby="admin-email-errors"
                id="admin_email"
                name="admin_email"
                type="email"
                value={form.admin_email}
                onChange={updateField}
                disabled={sendingCode || submitting || showEmailVerification}
                required
              />

              <button
                type="button"
                className="openspots-form-button openspots-form-button-primary"
                ref={verifyButtonRef}
                onClick={sendCode}
                disabled={sendingCode || submitting || showEmailVerification || emailVerified}
              >
                {emailVerified
                  ? t("Verified")
                  : sendingCode
                    ? t("Sending...")
                    : t("Verify Email")}
              </button>
            </div>

            <ul id="admin-email-errors" className="errorlist" aria-live="polite">{renderErrors("admin_email")}</ul>

          </div>

          {fields.slice(3).map(([name, label, type, required]) => (
            <div className="openspots-form-field" key={name}>
              <label htmlFor={name}>
                {t(label)}
                {required && <span className="text-danger">*</span>}
              </label>

              <input
                id={name}
                name={name}
                type={type}
                autoComplete={type === "password" ? "new-password" : "off"}
                value={form[name]}
                onChange={updateField}
                required={required}
                aria-invalid={fieldErrors(errors, name).length > 0}
              />

              <ul className="errorlist">{renderErrors(name)}</ul>
            </div>
          ))}
        </div>

        <div className="openspots-form-field">
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

        <div className="openspots-form-field apply-location-field">
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
                    window.clearTimeout(timerRef.current);
                    abortRef.current?.abort();
                    locationRequestRef.current += 1;
                    updateField({ target: { name: "location", value: item.display_name } });
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

        <div className="openspots-form-field apply-description-field">
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

        {submissionError && (
          <div className="alert alert-error apply-submission-error" role="alert">
            {submissionError}
          </div>
        )}

        <button
          id="submitApplicationBtn"
          type="submit"
          className="openspots-form-button openspots-form-button-primary openspots-form-submit"
          disabled={submitting || !emailVerified}
        >
          {submitting ? t("Submitting...") : t("Submit Application")}
        </button>
      </form>
      {showEmailVerification && (
        <EmailVerificationModal
          returnFocusRef={verifyButtonRef}
          verificationType="venue"
          venueEmail={form.admin_email}
          challengeId={venueChallengeId}
          onVerified={finishEmailVerification}
          onClose={() => setShowEmailVerification(false)}
          onCancelled={resetEmailVerification}
          onExpired={handleExpiredVerification}
        />
      )}
    </section>
  );
}
