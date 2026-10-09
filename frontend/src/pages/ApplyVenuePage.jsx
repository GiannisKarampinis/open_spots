import FormSelect from "../components/FormSelect";
import { VerificationType } from "../constants";
import { getRequiredFieldErrors, passwordsMatch } from "../utils/formValidation";
import { useCallback, useEffect, useRef, useState }   from "react";
import { Link }               from "react-router-dom";
import { useTranslation }     from "react-i18next";
import { postWithCsrf }       from "../utils/csrf";
import { verificationConfig } from "../utils/verification";
import EmailVerificationModal from "../components/EmailVerificationModal";
import { useToastMessage }    from "../components/ToastProvider";
import "../styles/openspots-forms-style.css";
import "../styles/apply_venue.css";
import "../styles/feedback.css";
import "../styles/auth.css";

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

const requiredFields = [
  "admin_firstname",
  "admin_lastname",
  "admin_username",
  "admin_email",
  "admin_phone",
  "password",
  "password2",
  "venue_name",
  "venue_type",
  "phone",
  "location",
];

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

  const verificationRef = useRef({ email: "", challengeId: "" });
  const verifyButtonRef = useRef(null);

  useEffect(() => () => {
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
  const [applicationSubmitted, setApplicationSubmitted] = useState(false);

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

  /* OK - REVIEWED - FIXME: Learn more about useCallback */
  const resetEmailVerification = useCallback(() => {
    verificationRef.current = { email: "", challengeId: "" };
    setEmailVerified(false);
    setVerificationToken("");
    setVenueChallengeId("");
    setShowEmailVerification(false);
  }, []);

  /* OK - REVIEWED by Codex - tsevre make a test in here */
  const handleExpiredVerification = useCallback(() => {
    resetEmailVerification();
    setErrors(
      (current) => ({ 
        ...current, 
        admin_email: [t("Email verification expired. Please try again.")] 
      })
    );
  }, [resetEmailVerification, t]);

  /* OK - REVIEWED */
  const finishEmailVerification = (data) => {
    const current = verificationRef.current;
    
    if (current.email !== form.admin_email || current.challengeId !== venueChallengeId) return; /* It ignores
    an outdated verification result if the user has changed the email or started a new verification challenge. */

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

  
  const submit = async (event) => {
    event.preventDefault();

    /* OK - REVIEWED */
    const requiredErrors = getRequiredFieldErrors(
      form,
      requiredFields,
      t("This field is required.")
    );
    
    /* OK - REVIEWED */
    if (Object.keys(requiredErrors).length) {
      setErrors(requiredErrors);
      return;
    }

    /* OK - REVIEWED */
    if (!passwordsMatch(form.password, form.password2)) {
      setErrors({password2: [t("Password fields did not match.")],});
      return;
    }

    /* ΟK - REVIEWED */
    if (!emailVerified) {
      setFieldError("admin_email", t("You must verify this email before submitting the application."));
      return;
    }

    setSubmitting(true);
    
    setErrors({});
    setSubmissionError("");

    try {
      /* OK - REVIEWED */
      const payload = {
        ...form,
        verification_token: verificationToken, // this comes from the finishEmailVerification which is called earlier.
      };
      delete payload.password2; // backend requires only one password field

      /* Stopped in here - we must review the verification flow first */
      await postWithCsrf("/api/v1/venues/apply/", payload, verificationConfig(venueChallengeId));
      
      setVerificationToken("");
      setVenueChallengeId("");

      setApplicationSubmitted(true);
    
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
    ["admin_firstname", "First name",       "text"],
    ["admin_lastname",  "Last name",        "text"],
    ["admin_username",  "Username",         "text"],
    ["admin_phone",     "Owner phone",      "text"],
    ["password",        "Password",         "password"],
    ["password2",       "Confirm password", "password"],
    ["venue_name",      "Venue name",       "text"],
    ["phone",           "Venue phone",      "text"],
  ];

  if (applicationSubmitted) {
    return (
      <div className="auth-container" role="status">
        <h2>{t("Thank you!")}</h2>
        <p>
          {t("Your application has been submitted. We will review it and contact you shortly.")}
        </p>
        <Link className="auth-submit" to="/">
          {t("Back to Venues")}
        </Link>
      </div>
    );
  }

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
      
        <fieldset className="apply-form-group">
          <legend>{t("Owner")}</legend>
          <div className="openspots-form-fields">
          {fields.slice(0, 3).map(([name, label, type]) => (
            <div className="openspots-form-field" key={name}>
              <label htmlFor={name}>
                {t(label)}
                {requiredFields.includes(name) && <span className="text-danger">*</span>}
              </label>

              <input
                id={name}
                name={name}
                type={type}
                autoComplete={type === "password" ? "new-password" : "off"}
                value={form[name]}
                onChange={updateField}
                required={requiredFields.includes(name)}
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
                ref={verifyButtonRef} /* attaches a reference to the button so that we can return focus to it after the modal closes */
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

          {fields.slice(3, 6).map(([name, label, type]) => (
            <div className={`openspots-form-field${name === "password2" ? " apply-confirm-password-field" : ""}`} key={name}>
              <label htmlFor={name}>
                {t(label)}
                {requiredFields.includes(name) && <span className="text-danger">*</span>}
              </label>

              <input
                id={name}
                name={name}
                type={type}
                autoComplete={type === "password" ? "new-password" : "off"}
                value={form[name]}
                onChange={updateField}
                required={requiredFields.includes(name)}
                aria-invalid={fieldErrors(errors, name).length > 0}
              />

              <ul className="errorlist">{renderErrors(name)}</ul>
            </div>
          ))}
          </div>
        </fieldset>

        <fieldset className="apply-form-group">
          <legend>{t("Venue information")}</legend>
          <div className="openspots-form-fields">
          {fields.slice(6).map(([name, label, type]) => (
            <div className="openspots-form-field" key={name}>
              <label htmlFor={name}>
                {t(label)}
                {requiredFields.includes(name) && <span className="text-danger">*</span>}
              </label>

              <input
                id={name}
                name={name}
                type={type}
                autoComplete={type === "password" ? "new-password" : "off"}
                value={form[name]}
                onChange={updateField}
                required={requiredFields.includes(name)}
                aria-invalid={fieldErrors(errors, name).length > 0}
              />

              <ul className="errorlist">{renderErrors(name)}</ul>
            </div>
          ))}

        <div className="openspots-form-field">
          <label htmlFor="venue_type">
            {t("Venue type")}
            <span className="text-danger">*</span>
          </label>

          <FormSelect
            id="venue_type"
            name="venue_type"
            value={form.venue_type}
            onChange={updateField}
            disabled={submitting}
            invalid={fieldErrors(errors, "venue_type").length > 0}
            describedBy="venue-type-errors"
            options={[
              { value: "restaurant", label: t("Restaurant") },
              { value: "cafe", label: t("Cafe") },
              { value: "bar", label: t("Bar") },
              { value: "beach_bar", label: t("Beach Bar") },
              { value: "other", label: t("Other") },
            ]}
          />

          <ul id="venue-type-errors" className="errorlist">{renderErrors("venue_type")}</ul>
        </div>

        <div className="openspots-form-field">
          <label htmlFor="location">
            {t("Location")}
            <span className="text-danger">*</span>
          </label>

          <input
            id="location"
            name="location"
            value={form.location}
            onChange={updateField}
            required
          />

          <ul className="errorlist">{renderErrors("location")}</ul>
        </div>

        <div className="openspots-form-field apply-notes-field">
          <label htmlFor="application-notes">{t("Application notes")}</label>
          <p id="application-notes-help" className="apply-field-help">
            {t("Tell our reviewers anything that may help us assess your venue application.")}
          </p>

          <textarea
            id="application-notes"
            aria-describedby="application-notes-help"
            name="description"
            rows="5"
            value={form.description}
            onChange={updateField}
          />

          <ul className="errorlist">{renderErrors("description")}</ul>
        </div>

          </div>
        </fieldset>

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
      
      {/* FIXME: How the backend handles email verification */}
      {showEmailVerification && venueChallengeId && (
        <EmailVerificationModal
          returnFocusRef    = {verifyButtonRef} /* It tells the modal where to return 
          keyboard focus when it closes. Passing it to the modal lets the modal 
          call .focus() on that button when it closes. */
          verificationType  = {VerificationType.VENUE}
          venueEmail        = {form.admin_email}
          challengeId       = {venueChallengeId}
          onVerified        = {finishEmailVerification}
          onClose           = {() => setShowEmailVerification(false)}
          onCancelled       = {resetEmailVerification}
          onExpired         = {handleExpiredVerification}
        />
      )}

    </section>
  );
}
