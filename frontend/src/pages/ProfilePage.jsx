import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getWithAuth, patchWithAuth, postWithAuth, storeAuthResponse } from "../utils/auth";
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
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [twoFactor, setTwoFactor] = useState({ enabled: false, loading: true });
  const [twoFactorSetup, setTwoFactorSetup] = useState(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");

  useEffect(() => {
    let cancelled = false;
    getWithAuth("/api/v1/accounts/profile/", {}, { onUnauthenticated: () => navigate("/accounts/login") })
      .then((res) => {
        if (cancelled || !res) return;
        setForm({
          firstname: res.data.firstname || "",
          lastname: res.data.lastname || "",
          username: res.data.username || "",
          phone_number: res.data.phone_number || "",
        });
        setEmail(res.data.email || "");
        storeAuthResponse({ user: res.data });
      })
      .catch(() => {
        if (cancelled) return;
        navigate("/accounts/login");
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
    getWithAuth("/api/v1/accounts/2fa/status/", {}, { onUnauthenticated: () => navigate("/accounts/login") })
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

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setMessage("");
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const res = await patchWithAuth(
        "/api/v1/accounts/profile/",
        form,
        {},
        { onUnauthenticated: () => navigate("/accounts/login") },
      );
      if (!res) return;
      storeAuthResponse({ user: res.data });
      setMessageType("success");
      setMessage("Profile updated.");
    } catch (err) {
      setMessageType("error");
      setMessage(err.response?.data?.detail || "Could not update your profile.");
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
        { onUnauthenticated: () => navigate("/accounts/login") },
      );
      if (!res) return;
      setTwoFactorSetup(res.data);
      setTwoFactorCode("");
      setMessageType("success");
      setMessage("Add this key to your authenticator app, then enter the generated code.");
    } catch (err) {
      setMessageType("error");
      setMessage(err.response?.data?.detail || "Could not start two-factor setup.");
    }
  };

  const confirmTwoFactor = async () => {
    setMessage("");
    try {
      const res = await postWithAuth(
        "/api/v1/accounts/2fa/confirm/",
        { code: twoFactorCode },
        {},
        { onUnauthenticated: () => navigate("/accounts/login") },
      );
      if (!res) return;
      setTwoFactor({ enabled: true, loading: false });
      setTwoFactorSetup(null);
      setTwoFactorCode("");
      setMessageType("success");
      setMessage(res.data.detail || "Two-factor authentication enabled.");
    } catch (err) {
      setMessageType("error");
      setMessage(err.response?.data?.detail || "Could not confirm two-factor authentication.");
    }
  };

  const disableTwoFactor = async () => {
    setMessage("");
    try {
      const res = await postWithAuth(
        "/api/v1/accounts/2fa/disable/",
        { code: twoFactorCode },
        {},
        { onUnauthenticated: () => navigate("/accounts/login") },
      );
      if (!res) return;
      setTwoFactor({ enabled: false, loading: false });
      setTwoFactorSetup(null);
      setTwoFactorCode("");
      setMessageType("success");
      setMessage(res.data.detail || "Two-factor authentication disabled.");
    } catch (err) {
      setMessageType("error");
      setMessage(err.response?.data?.detail || "Could not disable two-factor authentication.");
    }
  };

  return (
    <div className="auth-container">
      <h2>Profile</h2>

      {message && <div className={`auth-message ${messageType}`}>{message}</div>}

      <form className="auth-form" onSubmit={submit}>
        <div className="auth-field">
          <label htmlFor="profile-email">Email</label>
          <input id="profile-email" type="email" value={email} disabled />
        </div>

        {editableFields.map(([name, label, type]) => (
          <div className="auth-field" key={name}>
            <label htmlFor={`profile-${name}`}>{label}</label>
            <input
              id={`profile-${name}`}
              name={name}
              type={type}
              value={form[name]}
              onChange={updateField}
              disabled={loading}
            />
          </div>
        ))}

        <button className="auth-submit" type="submit" disabled={loading || saving}>
          {saving ? "Saving..." : "Save Profile"}
        </button>
      </form>

      <section className="auth-form" aria-labelledby="two-factor-heading">
        <h3 id="two-factor-heading">Two-Factor Authentication</h3>

        <p>{twoFactor.enabled ? "Enabled" : "Disabled"}</p>

        {twoFactorSetup && (
          <div className="auth-field">
            <label htmlFor="two-factor-key">Manual setup key</label>
            <input id="two-factor-key" type="text" value={twoFactorSetup.manual_key || ""} readOnly />
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
          <button className="auth-submit" type="button" onClick={startTwoFactorSetup} disabled={twoFactor.loading}>
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
