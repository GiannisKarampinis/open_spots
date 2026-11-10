import { getRequiredFieldErrors, passwordsMatch } from "../utils/formValidation";
import { getVerificationChallenge, getResetToken, clearVerification, verificationConfig } from "../utils/verification";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "../styles/password_reset.css";
import { postWithCsrf } from "../utils/csrf";
import { useToastMessage } from "../components/ToastProvider";

export default function PasswordResetPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const redirectTimeoutRef = useRef(null);

  const [challengeId] = useState(getVerificationChallenge);
  const [resetToken] = useState(getResetToken);
  const [form, setForm] = useState({
    new_password1: "",
    new_password2: "",
  });

  const [message, setMessage, type, setType] = useToastMessage("success");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    return () => {
      // Prevent stale redirects if the user leaves this page before the success timer fires.
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
      }
    };
  }, []);

  const updateField = (event) => {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  };

  const submit = async (event) => {
    event.preventDefault();

    // Ignore duplicate clicks and reject missing verification state before hitting the API.
    if (submitting) return;
    if (!challengeId || !resetToken) {
      setType("error");
      setMessage(t("Invalid or expired password recovery authorization."));
      return;
    }

    const requiredErrors = getRequiredFieldErrors(
      form,
      ["new_password1", "new_password2"],
      t("This field is required.")
    );
    if (Object.keys(requiredErrors).length) {
      setType("error");
      setMessage(t("This field is required."));
      return;
    }

    if (!passwordsMatch(form.new_password1, form.new_password2)) {
      setType("error");
      setMessage(t("Passwords do not match."));
      return;
    }

    setSubmitting(true);
    setMessage("");

    try {
      const res = await postWithCsrf(
        "/api/v1/accounts/password/reset/",
        { ...form, reset_token: resetToken },
        verificationConfig(challengeId)
      );

      // Only clear verification after the server confirms the reset succeeded.
      clearVerification(challengeId);
      setType("success");
      setMessage(res.data.detail || t("Password reset successful."));

      redirectTimeoutRef.current = setTimeout(() => {
        navigate("/accounts/login");
      }, 900);
    } catch (err) {
      const data = err.response?.data || {};
      const firstError =
        data.detail ||
        data.new_password1?.[0] ||
        data.new_password2?.[0] ||
        data.non_field_errors?.[0] ||
        t("Could not reset your password.");

      setType("error");
      setMessage(firstError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="form-container">
      <h2>{t("Reset Your Password")}</h2>

      {message && <p className={`auth-message ${type}`}>{message}</p>}

      <form onSubmit={submit}>
        <p>
          <label>
            {t("New password")}
            <br />
            <input
              name="new_password1"
              type="password"
              value={form.new_password1}
              onChange={updateField}
              required
            />
          </label>
        </p>

        <p>
          <label>
            {t("Confirm new password")}
            <br />
            <input
              name="new_password2"
              type="password"
              value={form.new_password2}
              onChange={updateField}
              required
            />
          </label>
        </p>

        <button type="submit" disabled={submitting}>
          {submitting ? t("Changing...") : t("Change Password")}
        </button>
      </form>

      <p>
        <Link to="/accounts/login">{t("Back to login")}</Link>
      </p>
    </div>
  );
}
