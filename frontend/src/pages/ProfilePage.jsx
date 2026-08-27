import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  getWithAuth,
  patchWithAuth,
  postWithAuth,
  storeAuthResponse,
} from "../utils/auth";
import "../styles/ProfilePage.css";

const editableFields = [
  ["username", "Username", "text"],
  ["firstname", "First name", "text"],
  ["lastname", "Last name", "text"],
  ["phone_number", "Phone number", "text"],
];

export default function ProfilePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    firstname: "",
    lastname: "",
    username: "",
    phone_number: "",
  });

  const [userInfo, setUserInfo] = useState({
    email: "",
    unverified_email: "",
    display_email: "",
    email_verified: true,
  });

  const [emailForm, setEmailForm] = useState({ email: "" });

  const [passwordForm, setPasswordForm] = useState({
    old_password: "",
    new_password1: "",
    new_password2: "",
  });

  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [emailWarningDismissed, setEmailWarningDismissed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [twoFactor, setTwoFactor] = useState({ enabled: false, loading: true });
  const [twoFactorSetup, setTwoFactorSetup] = useState(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");

  useEffect(() => {
    if (!message) return undefined;

    const timeoutId = window.setTimeout(() => setMessage(""), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [message]);

  useEffect(() => {
    let cancelled = false;

    getWithAuth(
      "/api/v1/accounts/profile/",
      {},
      { onUnauthenticated: () => navigate("/accounts/login") }
    )
      .then((res) => {
        if (cancelled || !res) return;

        const profile = res.data;

        setForm({
          firstname: profile.firstname || "",
          lastname: profile.lastname || "",
          username: profile.username || "",
          phone_number: profile.phone_number || "",
        });

        setUserInfo({
          email: profile.email || "",
          unverified_email: profile.unverified_email || "",
          display_email: profile.display_email || profile.email || "",
          email_verified: profile.email_verified,
        });

        setEmailForm({ email: profile.display_email || profile.email || "" });
        storeAuthResponse({ user: profile });
      })
      .catch(() => {
        if (!cancelled) navigate("/accounts/login");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;

    getWithAuth(
      "/api/v1/accounts/2fa/status/",
      {},
      { onUnauthenticated: () => navigate("/accounts/login") }
    )
      .then((res) => {
        if (!cancelled && res) setTwoFactor({ ...res.data, loading: false });
      })
      .catch(() => {
        if (!cancelled) {
          setTwoFactor((current) => ({ ...current, loading: false }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const showSuccess = (text) => {
    setMessageType("success");
    setMessage(text);
  };

  const showError = (text) => {
    setMessageType("error");
    setMessage(text);
  };

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setMessage("");
  };

  const updateEmailField = (event) => {
    setEmailForm({ email: event.target.value });
    setMessage("");
  };

  const updatePasswordField = (event) => {
    const { name, value } = event.target;
    setPasswordForm((current) => ({ ...current, [name]: value }));
    setMessage("");
  };

  const cancelEdit = () => {
    setEditing(null);
    setEmailForm({ email: userInfo.display_email || userInfo.email || "" });
    setPasswordForm({
      old_password: "",
      new_password1: "",
      new_password2: "",
    });
    setMessage("");
  };

  const submitProfile = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const res = await patchWithAuth(
        "/api/v1/accounts/profile/",
        form,
        {},
        { onUnauthenticated: () => navigate("/accounts/login") }
      );

      if (!res) return;

      storeAuthResponse({ user: res.data });
      showSuccess(t("Profile updated successfully."));
      setEditing(null);
    } catch (err) {
      showError(
        err.response?.data?.detail || t("Could not update your profile.")
      );
    } finally {
      setSaving(false);
    }
  };

  const submitEmail = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const res = await postWithAuth(
        "/api/v1/accounts/email/update/",
        emailForm,
        {},
        { onUnauthenticated: () => navigate("/accounts/login") }
      );

      if (!res) return;

      const pendingEmail = emailForm.email.trim().toLowerCase();
      setUserInfo((current) => ({
        ...current,
        unverified_email: pendingEmail,
        display_email: pendingEmail,
        email_verified: false,
      }));
      setEmailForm({ email: pendingEmail });
      setEmailWarningDismissed(false);
      setEditing(null);

      if (res.data.requires_verification) {
        showSuccess(
          res.data.detail || t("Verification code sent to your new email.")
        );
        navigate("/accounts/verify-email");
        return;
      }

      showSuccess(res.data.detail || t("Email updated."));
    } catch (err) {
      const data = err.response?.data;
      showError(
        data?.email?.[0] || data?.detail || t("Could not update your email.")
      );
    } finally {
      setSaving(false);
    }
  };

  const submitPassword = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    if (passwordForm.new_password1 !== passwordForm.new_password2) {
      showError(t("The new passwords do not match."));
      setSaving(false);
      return;
    }

    try {
      const res = await postWithAuth(
        "/api/v1/accounts/password/change/",
        passwordForm,
        {},
        { onUnauthenticated: () => navigate("/accounts/login") }
      );

      if (!res) return;

      showSuccess(
        res.data.detail ||
          t("Verification code sent. Confirm the code to complete the password change.")
      );

      navigate("/accounts/verify-email");
    } catch (err) {
      const data = err.response?.data;

      showError(
        data?.old_password?.[0] ||
          data?.new_password1?.[0] ||
          data?.new_password2?.[0] ||
          data?.detail ||
          t("Could not change your password.")
      );
    } finally {
      setSaving(false);
    }
  };

  const startTwoFactorSetup = async () => {
    setMessage("");

    try {
      const res = await postWithAuth(
        "/api/v1/accounts/2fa/setup/",
        {},
        {},
        { onUnauthenticated: () => navigate("/accounts/login") }
      );

      if (!res) return;

      setTwoFactorSetup(res.data);
      setTwoFactorCode("");
      showSuccess(
        t("Add this key to your authenticator app, then enter the generated code.")
      );
    } catch (err) {
      showError(
        err.response?.data?.detail || t("Could not start two-factor setup.")
      );
    }
  };

  const confirmTwoFactor = async () => {
    setMessage("");

    try {
      const res = await postWithAuth(
        "/api/v1/accounts/2fa/confirm/",
        { code: twoFactorCode },
        {},
        { onUnauthenticated: () => navigate("/accounts/login") }
      );

      if (!res) return;

      setTwoFactor({ enabled: true, loading: false });
      setTwoFactorSetup(null);
      setTwoFactorCode("");
      showSuccess(res.data.detail || t("Two-factor authentication enabled."));
    } catch (err) {
      showError(
        err.response?.data?.detail ||
          t("Could not confirm two-factor authentication.")
      );
    }
  };

  const disableTwoFactor = async () => {
    setMessage("");

    try {
      const res = await postWithAuth(
        "/api/v1/accounts/2fa/disable/",
        { code: twoFactorCode },
        {},
        { onUnauthenticated: () => navigate("/accounts/login") }
      );

      if (!res) return;

      setTwoFactor({ enabled: false, loading: false });
      setTwoFactorSetup(null);
      setTwoFactorCode("");
      showSuccess(res.data.detail || t("Two-factor authentication disabled."));
    } catch (err) {
      showError(
        err.response?.data?.detail ||
          t("Could not disable two-factor authentication.")
      );
    }
  };

  if (loading) {
    return (
      <div className="profile-page">
        <p>{t("Loading profile...")}</p>
      </div>
    );
  }

  return (
    <div >
      <section className="profile-page auth-form profile-section">
        <h3>{t("Profile")}</h3>

        <div className="profile-message-area" aria-live="polite">
          {!userInfo.email_verified && !emailWarningDismissed && (
            <div className="auth-message warning">
              <span>
                {t("Your email")} <strong>{userInfo.display_email}</strong>{" "}
                {t("is not yet verified.")}{" "}
                <button
                  type="button"
                  className="auth-inline-button"
                  onClick={() => navigate("/accounts/verify-email")}
                >
                  {t("Verify Now")}
                </button>
              </span>
              <button
                type="button"
                className="profile-message-close"
                aria-label={t("Dismiss message")}
                onClick={() => setEmailWarningDismissed(true)}
              >
                ×
              </button>
            </div>
          )}

          {message && (
            <div className={`auth-message ${messageType}`}>
              <span>{message}</span>
              <button
                type="button"
                className="profile-message-close"
                aria-label={t("Dismiss message")}
                onClick={() => setMessage("")}
              >
                ×
              </button>
            </div>
          )}
        </div>

        <div className="auth-field profile-field">
          <label>{t("Email")}</label>

          {editing === "email" ? (
            <form className="profile-edit-form" onSubmit={submitEmail}>
              <input
                type="email"
                name="email"
                value={emailForm.email}
                onChange={updateEmailField}
                required
              />

              <div className="profile-form-actions">
                <button
                  className="profile-action-btn profile-save-btn"
                  type="submit"
                  disabled={saving}
                >
                  {saving ? t("Saving...") : t("Save")}
                </button>

                <button
                  className="profile-action-btn profile-cancel-btn"
                  type="button"
                  onClick={cancelEdit}
                >
                  {t("Cancel")}
                </button>
              </div>
            </form>
          ) : (
            <div className="profile-display-row">
              <div className="profile-value-frame">
                <span>{userInfo.display_email || "—"}</span>
              </div>

              <button
                type="button"
                className="profile-edit-btn"
                onClick={() => setEditing("email")}
              >
                {t("Edit")}
              </button>
            </div>
          )}
        </div>

        <form className="profile-fields-form" onSubmit={submitProfile}>
          {editableFields.map(([name, label, type]) => (
            <div className="auth-field profile-field" key={name}>
              <label htmlFor={`profile-${name}`}>{t(label)}</label>

              <input
                id={`profile-${name}`}
                name={name}
                type={type}
                value={form[name]}
                onChange={updateField}
                readOnly={name === "username"}
                className={name === "username" ? "profile-readonly-input" : undefined}
              />
            </div>
          ))}

          <button
            className="profile-update-btn"
            type="submit"
            disabled={saving}
          >
            {saving ? t("Updating...") : t("Update Profile")}
          </button>
        </form>

        {editing === "password" ? (
          <div className="auth-field profile-field">
            <form className="profile-password-form" onSubmit={submitPassword}>
              <div className="profile-password-inputs">
                <input
                  type="password"
                  name="old_password"
                  placeholder={t("Old password")}
                  value={passwordForm.old_password}
                  onChange={updatePasswordField}
                  required
                />

                <input
                  type="password"
                  name="new_password1"
                  placeholder={t("New password")}
                  value={passwordForm.new_password1}
                  onChange={updatePasswordField}
                  required
                />

                <input
                  type="password"
                  name="new_password2"
                  placeholder={t("Confirm new password")}
                  value={passwordForm.new_password2}
                  onChange={updatePasswordField}
                  required
                />
              </div>

              <div className="profile-form-actions profile-password-actions">
                <button
                  className="profile-action-btn profile-save-btn"
                  type="submit"
                  disabled={saving}
                >
                  {saving ? t("Saving...") : t("Save")}
                </button>

                <button
                  className="profile-action-btn profile-cancel-btn"
                  type="button"
                  onClick={cancelEdit}
                >
                  {t("Cancel")}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <button
            type="button"
            className="profile-password-link"
            onClick={() => setEditing("password")}
          >
            {t("Change Password")}
          </button>
        )}
      </section>

      <section className="profile-page auth-form" aria-labelledby="two-factor-heading">
        <h3 id="two-factor-heading">{t("Two-Factor Authentication")}</h3>

        <p>{twoFactor.enabled ? t("Enabled") : t("Disabled")}</p>

        {twoFactorSetup && (
          <div className="auth-field">
            <label htmlFor="two-factor-key">{t("Manual setup key")}</label>
            <input
              id="two-factor-key"
              type="text"
              value={twoFactorSetup.manual_key || ""}
              readOnly
            />
          </div>
        )}

        {(twoFactorSetup || twoFactor.enabled) && (
          <div className="auth-field">
            <label htmlFor="two-factor-code">{t("Authenticator code")}</label>
            <input
              id="two-factor-code"
              type="text"
              inputMode="numeric"
              value={twoFactorCode}
              onChange={(event) => setTwoFactorCode(event.target.value)}
              autoComplete="one-time-code"
            />
          </div>
        )}

        {!twoFactor.enabled && !twoFactorSetup && (
          <button
            className="auth-submit"
            type="button"
            onClick={startTwoFactorSetup}
            disabled={twoFactor.loading}
          >
            {t("Enable 2FA")}
          </button>
        )}

        {twoFactorSetup && (
          <button
            className="auth-submit"
            type="button"
            onClick={confirmTwoFactor}
          >
            {t("Confirm 2FA")}
          </button>
        )}

        {twoFactor.enabled && (
          <button
            className="auth-submit"
            type="button"
            onClick={disableTwoFactor}
          >
            {t("Disable 2FA")}
          </button>
        )}
      </section>
    </div>
  );
}
