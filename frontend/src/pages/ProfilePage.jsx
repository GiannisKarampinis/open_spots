import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getWithAuth,
  patchWithAuth,
  postWithAuth,
  storeAuthResponse,
} from "../utils/auth";
import "../styles/auth.css";

const editableFields = [
  ["firstname", "First name", "text"],
  ["lastname", "Last name", "text"],
  ["username", "Username", "text"],
  ["phone_number", "Phone number", "text"],
];

export default function ProfilePage() {
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [twoFactor, setTwoFactor] = useState({ enabled: false, loading: true });
  const [twoFactorSetup, setTwoFactorSetup] = useState(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");

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
        if (!cancelled) setTwoFactor((current) => ({ ...current, loading: false }));
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
    setPasswordForm({ old_password: "", new_password1: "", new_password2: "" });
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
      showSuccess("Profile updated successfully.");
      setEditing(null);
    } catch (err) {
      showError(err.response?.data?.detail || "Could not update your profile.");
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

      if (res.data.requires_verification) {
        showSuccess(res.data.detail || "Verification code sent to your new email.");
        navigate("/accounts/verify-email");
        return;
      }

      showSuccess(res.data.detail || "Email updated.");
      setEditing(null);
    } catch (err) {
      const data = err.response?.data;
      showError(data?.email?.[0] || data?.detail || "Could not update your email.");
    } finally {
      setSaving(false);
    }
  };

  const submitPassword = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    if (passwordForm.new_password1 !== passwordForm.new_password2) {
      showError("The new passwords do not match.");
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
          "Verification code sent. Confirm the code to complete the password change."
      );

      navigate("/accounts/verify-email");
    } catch (err) {
      const data = err.response?.data;

      showError(
        data?.old_password?.[0] ||
          data?.new_password1?.[0] ||
          data?.new_password2?.[0] ||
          data?.detail ||
          "Could not change your password."
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
      showSuccess("Add this key to your authenticator app, then enter the generated code.");
    } catch (err) {
      showError(err.response?.data?.detail || "Could not start two-factor setup.");
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
      showSuccess(res.data.detail || "Two-factor authentication enabled.");
    } catch (err) {
      showError(err.response?.data?.detail || "Could not confirm two-factor authentication.");
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
      showSuccess(res.data.detail || "Two-factor authentication disabled.");
    } catch (err) {
      showError(err.response?.data?.detail || "Could not disable two-factor authentication.");
    }
  };

  if (loading) {
    return (
      <div className="auth-container">
        <p>Loading profile...</p>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <h2>Profile</h2>

      {!userInfo.email_verified && (
        <div className="auth-message warning">
          Your email <strong>{userInfo.display_email}</strong> is not yet verified.{" "}
          <button
            type="button"
            className="auth-inline-button"
            onClick={() => navigate("/accounts/verify-email")}
          >
            Verify Now
          </button>
        </div>
      )}

      {message && <div className={`auth-message ${messageType}`}>{message}</div>}

      <section className="auth-form profile-section">
        <h3>User Information</h3>

        <div className="auth-field profile-field">
          <label>Email</label>

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
                <button className="profile-action-btn profile-save-btn" type="submit" disabled={saving}>
                  {saving ? "Saving..." : "Save"}
                </button>

                <button
                  className="profile-action-btn profile-cancel-btn"
                  type="button"
                  onClick={cancelEdit}
                >
                  Cancel
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
                Edit
              </button>
            </div>
          )}
        </div>

        <form className="profile-fields-form" onSubmit={submitProfile}>
          {editableFields.map(([name, label, type]) => (
            <div className="auth-field profile-field" key={name}>
              <label htmlFor={`profile-${name}`}>{label}</label>

              {editing === name ? (
                <div className="profile-edit-row">
                  <input
                    id={`profile-${name}`}
                    name={name}
                    type={type}
                    value={form[name]}
                    onChange={updateField}
                  />

                  <div className="profile-form-actions">
                    <button className="profile-action-btn profile-save-btn" type="submit" disabled={saving}>
                      {saving ? "Saving..." : "Save"}
                    </button>

                    <button
                      className="profile-action-btn profile-cancel-btn"
                      type="button"
                      onClick={cancelEdit}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="profile-display-row">
                  <div className="profile-value-frame">
                    <span>{form[name] || "—"}</span>
                  </div>

                  <button
                    type="button"
                    className="profile-edit-btn"
                    onClick={() => setEditing(name)}
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>
          ))}
        </form>

        <div className="auth-field profile-field">
          <label>Password</label>

          {editing === "password" ? (
            <form className="profile-password-form" onSubmit={submitPassword}>
              <div className="profile-password-inputs">
                <input
                  type="password"
                  name="old_password"
                  placeholder="Old password"
                  value={passwordForm.old_password}
                  onChange={updatePasswordField}
                  required
                />

                <input
                  type="password"
                  name="new_password1"
                  placeholder="New password"
                  value={passwordForm.new_password1}
                  onChange={updatePasswordField}
                  required
                />

                <input
                  type="password"
                  name="new_password2"
                  placeholder="Confirm new password"
                  value={passwordForm.new_password2}
                  onChange={updatePasswordField}
                  required
                />
              </div>

              <div className="profile-form-actions profile-password-actions">
                <button className="profile-action-btn profile-save-btn" type="submit" disabled={saving}>
                  {saving ? "Saving..." : "Save"}
                </button>

                <button
                  className="profile-action-btn profile-cancel-btn"
                  type="button"
                  onClick={cancelEdit}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="profile-display-row">
              <div className="profile-value-frame">
                <span>********</span>
              </div>

              <button
                type="button"
                className="profile-edit-btn"
                onClick={() => setEditing("password")}
              >
                Change
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="auth-form" aria-labelledby="two-factor-heading">
        <h3 id="two-factor-heading">Two-Factor Authentication</h3>

        <p>{twoFactor.enabled ? "Enabled" : "Disabled"}</p>

        {twoFactorSetup && (
          <div className="auth-field">
            <label htmlFor="two-factor-key">Manual setup key</label>
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
            <label htmlFor="two-factor-code">Authenticator code</label>
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
            Enable 2FA
          </button>
        )}

        {twoFactorSetup && (
          <button className="auth-submit" type="button" onClick={confirmTwoFactor}>
            Confirm 2FA
          </button>
        )}

        {twoFactor.enabled && (
          <button className="auth-submit" type="button" onClick={disableTwoFactor}>
            Disable 2FA
          </button>
        )}
      </section>
    </div>
  );
}
