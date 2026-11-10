import { rememberVerification } from "../utils/verification";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useToastMessage } from "../components/ToastProvider";
import "../styles/password_recover.css";
import { postWithCsrf } from "../utils/csrf";

export default function PasswordRecoverPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const redirectTimeoutRef = useRef(null);

  const [email, setEmail] = useState("");
  const [message, setMessage] = useToastMessage("auto");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    return () => {
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
      }
    };
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setMessage("");

    try {
      const res = await postWithCsrf("/api/v1/accounts/password/recover/", {
        email,
      });

      const data = res?.data ?? {};
      if (!data.challenge_id) {
        setMessage(t("Could not start password recovery."));
        return;
      }

      rememberVerification(data);
      setMessage(
        data.detail ||
          t("If the email exists, a verification code has been sent.")
      );

      redirectTimeoutRef.current = setTimeout(() => {
        navigate("/accounts/verify-email");
      }, 700);
    } catch (err) {
      const data = err.response?.data;

      if (data?.detail) {
        setMessage(data.detail);
      } else if (data?.email?.length) {
        setMessage(data.email[0]);
      } else {
        setMessage(t("Could not start password recovery."));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="form-container">
      <h2>{t("Password Recovery")}</h2>

      {message && <p className="auth-message success">{message}</p>}

      <form onSubmit={submit}>
        <p>
          <label>
            {t("Email")}
            <br />
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
        </p>

        <button type="submit" disabled={submitting}>
          {submitting ? t("Sending...") : t("Send Verification Code")}
        </button>
      </form>
    </div>
  );
}
