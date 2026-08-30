import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  getWithAuth,
  patchWithAuth,
  postWithAuth,
  storeAuthResponse,
} from "../utils/auth";
import EmailVerificationModal from "../components/EmailVerificationModal";
import { useToastMessage } from "../components/ToastProvider";
import "../styles/ProfilePage.css";

/* OK - REVIEWED */
const editableFields = [
  ["username",      "Username",     "text"],
  ["email",         "Email",        "email"],
  ["firstname",     "First name",   "text"],
  ["lastname",      "Last name",    "text"],
  ["phone_number",  "Phone number", "tel"],
];

/* OK - REVIEWED */
const passwordFields = [
  ["old_password",    "Old password"],
  ["new_password1",   "New password"],
  ["new_password2",   "Confirm new password"]
];

const NAME_MAX_LENGTH = 30;

export default function ProfilePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  /* OK - REVIEWED */
  const [form, setForm] = useState({
    firstname:    "",
    lastname:     "",
    username:     "",
    email:        "",
    phone_number: "",
  });

  /* OK - REVIEWED */
  const [savedForm, setSavedForm] = useState({
    firstname:    "",
    lastname:     "",
    username:     "",
    email:        "",
    phone_number: "",
  });

  /* OK - REVIEWED */
  const [userInfo, setUserInfo] = useState({
    email:            "",
    unverified_email: "",
    email_verified:   true,
  });

  const [passwordForm, setPasswordForm] = useState({
    old_password:   "",
    new_password1:  "",
    new_password2:  "",
  });
  const [profileErrors, setProfileErrors] = useState({});
  const [passwordErrors, setPasswordErrors] = useState({});

  const [isEditingPassword, setIsEditingPassword] = useState(false);
  const [message, setMessage, messageType, setMessageType] = useToastMessage("success");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showEmailVerification, setShowEmailVerification] = useState(false);

  const [twoFactor, setTwoFactor] = useState({ enabled: false, loading: true });
  const [twoFactorSetup, setTwoFactorSetup] = useState(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");

  /* OK - REVIEWED */
  const emailDiffersFromVerified = form.email.trim().toLowerCase() !== (userInfo.email || "").trim().toLowerCase();

  /* OK - REVIEWED */
  const hasProfileChanges =
    form.firstname.trim() !== savedForm.firstname.trim() ||
    form.lastname.trim() !== savedForm.lastname.trim() ||
    form.phone_number.trim() !== savedForm.phone_number.trim() ||
    form.email.trim().toLowerCase() !== savedForm.email.trim().toLowerCase();

  useEffect(() => { /* PROFILE DATA LOADING */
    let cancelled = false;

    getWithAuth(
      "/api/v1/accounts/profile/",
      {},
      { onUnauthenticated: () => navigate("/accounts/login") }
    ).then((res) => {
        if (cancelled || !res) return;

        const profile = res.data;
        const loadedForm = {
          firstname:    profile.firstname     || "",
          lastname:     profile.lastname      || "",
          username:     profile.username      || "",
          email:        profile.email         || "",
          phone_number: profile.phone_number  || "",
        };
        setForm(loadedForm);
        setSavedForm(loadedForm);

        setUserInfo({
          email:            profile.email || "",
          unverified_email: profile.unverified_email || "",
          email_verified:   profile.email_verified,
        });
        // The following call is commented out because we only need in the
        // navigation bar, the username which is readonly and is already
        // stored in the auth response.
        // Storing the entire profile here is redundant.
        // We should enable it in the future if we need to access the profile in other parts of the app.
        // storeAuthResponse({ user: profile });
      }).catch(() => {
        if (!cancelled) navigate("/accounts/login");
      }).finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      // cleanup function to prevent state updates:
      // 1. The user leaves ProfilePage before the profile data is loaded.
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => { /* TWO-FACTOR STATUS LOADING */
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
  // navigate: It's function reference could theoretically change
  // if the router context or router instance changes.
  // During ordinary OpenSpots usage, it normally remains stable.

  const showSuccess = (text) => {
    setMessageType("success");
    setMessage(text);
  };

  const showError = (text) => {
    setMessageType("error");
    setMessage(text);
  };

  /* OK - REVIEWED */
  const validateEmail = (value) => { /* FIXME: IS THERE A MORE ROBUST VALIDATION? */
    const normalizedEmail = value.trim().toLowerCase();
    if (!normalizedEmail) return t("This field is required.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return t("Enter a valid email address.");
    }

    return "";
  };

  /* OK - REVIEWED */
  const validatePhone = (value) => {
    const normalizedPhone = value.trim();
    if (!normalizedPhone) return "";
    if (!/^(?:\+30)?(?:69\d{8}|2\d{9})$/.test(normalizedPhone)) {
      return t("Enter a valid Greek phone number.");
    }

    return "";
  };

  /* OK - REVIEWED */
  const validateName = (value) => {
    const normalizedName = value.trim();
    if (!normalizedName) return t("This field is required.");
    if (normalizedName.length > NAME_MAX_LENGTH) {
      return t("Names must be 30 characters or fewer.");
    }
    if (/\p{Nd}/u.test(normalizedName)) {
      return t("Names cannot contain digits.");
    }
    if (/\p{Cc}/u.test(normalizedName)) {
      return t("Names cannot contain control characters.");
    }

    return "";
  };

  /* OK - REVIEWED */
  const validateProfileFieldOnBlur = (event) => {
    const { name, value } = event.target;
    if (!["email", "firstname", "lastname", "phone_number"].includes(name)) return;

    const error = name === "email"
      ? validateEmail(value)
      : name === "phone_number"
        ? validatePhone(value)
        : validateName(value);
    setProfileErrors((current) => ({ ...current, [name]: error }));
  };

  /* OK - REVIEWED */
  const updateField = (event) => {
    // the destructuring extracts only the name and the value from the event.target object,
    // which is the input element that triggered the event.
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setProfileErrors((current) => {
      if (!current[name]) return current;
      return {
        ...current,
        [name]: name === "email"
          ? validateEmail(value)
          : name === "phone_number"
            ? validatePhone(value)
            : ["firstname", "lastname"].includes(name)
              ? validateName(value)
              : "",
      };
    });
  };

  /* OK - REVIEWED */
  const updatePasswordField = (event) => {
    const { name, value } = event.target;
    setPasswordForm((current) => ({ ...current, [name]: value }));
    setPasswordErrors((current) => ({ ...current, [name]: "" }));
  };

  /* OK - REVIEWED */
  const cancelEdit = () => {
    setIsEditingPassword(false);
    setPasswordForm({
      old_password:   "",
      new_password1:  "",
      new_password2:  "",
    });
  };

  const submitProfile = async (event) => {
    event.preventDefault();

    if (!hasProfileChanges || saving) return;

    const normalizedEmail = form.email.trim().toLowerCase();
    const emailError      = validateEmail(normalizedEmail);
    const firstnameError  = validateName(form.firstname);
    const lastnameError   = validateName(form.lastname);
    const phoneError      = validatePhone(form.phone_number);

    if (emailError || firstnameError || lastnameError || phoneError) {
      setProfileErrors({
        email:        emailError,
        firstname:    firstnameError,
        lastname:     lastnameError,
        phone_number: phoneError,
      });
      return;
    }

    setProfileErrors({});
    setSaving(true);

    try {
      const savedEmail = (userInfo.email || "").trim().toLowerCase();
      const emailChanged = normalizedEmail !== savedEmail;

      const emailVerificationPending = Boolean(
          userInfo.unverified_email &&
          !userInfo.email_verified &&
          userInfo.unverified_email.trim().toLowerCase() === normalizedEmail
      );
      const profileFields = {
        firstname:    form.firstname.trim(),
        lastname:     form.lastname.trim(),
        phone_number: form.phone_number,
      };

      if (emailChanged || emailVerificationPending) {
        const emailRes = await postWithAuth(
          "/api/v1/accounts/email/update/",
          { email: normalizedEmail, profile: profileFields },
          {},
          { onUnauthenticated: () => navigate("/accounts/login") }
        );

        if (!emailRes) return;

        setForm((current) => ({ ...current, email: normalizedEmail }));
        showSuccess(
          emailRes.data.detail || t("Verification code sent to your new email.")
        );
        setShowEmailVerification(true);
        return;
      }

      const res = await patchWithAuth(
        "/api/v1/accounts/profile/",
        profileFields,
        {},
        { onUnauthenticated: () => navigate("/accounts/login") }
      );

      if (!res) return;

      storeAuthResponse({ user: res.data });
      setSavedForm((current) => ({
        ...current,
        firstname: res.data.firstname || "",
        lastname: res.data.lastname || "",
        phone_number: res.data.phone_number || "",
      }));

      showSuccess(t("Profile updated successfully."));
    } catch (err) {
      const data = err.response?.data || {};
      const fieldErrors = {};
      for (const field of ["email", "firstname", "lastname", "phone_number"]) {
        if (data[field]) fieldErrors[field] = Array.isArray(data[field]) ? data[field][0] : data[field];
      }
      setProfileErrors(fieldErrors);
      if (!Object.keys(fieldErrors).length) {
        showError(data.detail || data.non_field_errors?.[0] || t("Could not update your profile."));
      }
    } finally {
      setSaving(false);
    }
  };

  const finishEmailVerification = (profile, detail) => {
    if (!profile) return;
    setUserInfo({
      email: profile.email || "",
      unverified_email: profile.unverified_email || "",
      email_verified: profile.email_verified,
    });
    setPasswordErrors({});
    const updatedForm = {
      firstname: profile.firstname || "",
      lastname: profile.lastname || "",
      username: profile.username || "",
      email: profile.email || "",
      phone_number: profile.phone_number || "",
    };
    setForm(updatedForm);
    setSavedForm(updatedForm);
    setShowEmailVerification(false);
    showSuccess(detail || t("Profile and email updated successfully."));
  };

  const submitPassword = async (event) => {
    event.preventDefault();

    const requiredErrors = {};
    for (const [field] of passwordFields) {
      if (!passwordForm[field]) requiredErrors[field] = t("This field is required.");
    }
    if (Object.keys(requiredErrors).length) {
      setPasswordErrors(requiredErrors);
      return;
    }

    if (passwordForm.new_password1 !== passwordForm.new_password2) {
      setPasswordErrors({ new_password2: t("The new passwords do not match.") });
      return;
    }

    setPasswordErrors({});
    setSaving(true);

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
      const data = err.response?.data || {};
      const fieldErrors = {};
      for (const field of ["old_password", "new_password1", "new_password2"]) {
        if (data[field]) fieldErrors[field] = Array.isArray(data[field]) ? data[field][0] : data[field];
      }
      setPasswordErrors(fieldErrors);
      if (!Object.keys(fieldErrors).length) {
        showError(data.detail || data.non_field_errors?.[0] || t("Could not change your password."));
      }
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

  // OK - REVIEWED
  const getProfileFieldClass = (name) => {
    if (name === "username") return "profile-readonly-input";

    const hasChanged = name === "email" ? emailDiffersFromVerified : form[name] !== savedForm[name];

    return hasChanged ? "profile-field-changed" : undefined;
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
      {/* aria-labelledby is used for the accessibility (screen reader support) */}
      <section className="profile-page profile-section" aria-labelledby="profile-heading">
        <h3 id="profile-heading">{t("Profile")}</h3>

        {/* noValidate means that will disable browser's automatic validation */}
        <form className="profile-fields-form" onSubmit={submitProfile} noValidate>
          {editableFields.map(([name, label, type]) => (
            // key is not exposed in HTML, React uses key internally to identify mapped elements between renders.
            <div className="profile-field" key={name}>

              {/*
                htmlFor is used to associate the label with the input field:
                  1. for accessibility (screen reader support),
                  2. for increasing the clickable area
              */}
              <label htmlFor={`profile-${name}`}>{t(label)}</label>

              <input
                id={`profile-${name}`}
                name={name}
                type={type}
                value={form[name]} // from the React state
                onChange={updateField}
                onBlur={validateProfileFieldOnBlur}
                readOnly={name === "username"}
                required={["email", "firstname", "lastname"].includes(name)}
                maxLength={["firstname", "lastname"].includes(name) ? NAME_MAX_LENGTH : undefined}
                aria-invalid={Boolean(profileErrors[name])}
                aria-describedby={profileErrors[name] ? `profile-${name}-error` : undefined}
                className={getProfileFieldClass(name)}
              />
              <span
                id={`profile-${name}-error`}
                className="profile-field-error"
                role={profileErrors[name] ? "alert" : undefined}
              >
                {profileErrors[name] || ""}
              </span>
            </div>
          ))}

          <button
            className="profile-button profile-button-primary profile-update-btn" type="submit" disabled={saving || !hasProfileChanges}
            aria-busy={saving}
          >
            {saving ? t("Updating...") : t("Update Profile")}
          </button>
        </form>

        {isEditingPassword ? (
            <form className="profile-password-form profile-field" onSubmit={submitPassword} noValidate>
              <div className="profile-password-inputs">
                {passwordFields.map(([name, placeholder]) => (
                  <div className="profile-password-field" key={name}>
                    <input
                      type="password"
                      name={name}
                      placeholder={t(placeholder)}
                      value={passwordForm[name]}
                      onChange={updatePasswordField}
                      aria-invalid={Boolean(passwordErrors[name])}
                      aria-describedby={passwordErrors[name] ? `profile-${name}-error` : undefined}
                      required
                    />
                    <span
                      id={`profile-${name}-error`}
                      className="profile-field-error"
                      role={passwordErrors[name] ? "alert" : undefined}
                    >
                      {passwordErrors[name] || ""}
                    </span>
                  </div>
                ))}
              </div>

              <div className="profile-form-actions profile-password-actions">
                <button
                  className="profile-button profile-button-primary profile-action-btn"
                  type="submit"
                  disabled={saving}
                  aria-busy={saving}
                >
                  {saving ? t("Saving...") : t("Save")}
                </button>

                <button
                  className="profile-button profile-button-danger profile-action-btn"
                  type="button"
                  onClick={cancelEdit}
                >
                  {t("Cancel")}
                </button>
              </div>
            </form>
        ) : (
          <button
            type="button"
            className="profile-password-link"
            onClick={() => setIsEditingPassword(true)}
          >
            {t("Change Password")}
          </button>
        )}
      </section>


{/* TILL THAT STEP THE CODE IS REVIEWED */}


      {showEmailVerification && (
        <EmailVerificationModal
          onClose={() => setShowEmailVerification(false)}
          onVerified={finishEmailVerification}
        />
      )}

      <section className="profile-page profile-two-factor-section" aria-labelledby="two-factor-heading">
        <h3 id="two-factor-heading">{t("Two-Factor Authentication")}</h3>

        <p>{twoFactor.enabled ? t("Enabled") : t("Disabled")}</p>

        {twoFactorSetup && (
          <div className="profile-field">
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
          <div className="profile-field">
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
            className="profile-button profile-button-primary profile-two-factor-btn"
            type="button"
            onClick={startTwoFactorSetup}
            disabled={twoFactor.loading}
            aria-busy={twoFactor.loading}
          >
            {t("Enable 2FA")}
          </button>
        )}

        {twoFactorSetup && (
          <button
            className="profile-button profile-button-primary profile-two-factor-btn"
            type="button"
            onClick={confirmTwoFactor}
          >
            {t("Confirm 2FA")}
          </button>
        )}

        {twoFactor.enabled && (
          <button
            className="profile-button profile-button-danger profile-two-factor-btn"
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
