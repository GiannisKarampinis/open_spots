import { VerificationReason } from "../utils/verificationReasons";
import { rememberVerification, verificationConfig } from "../utils/verification";
import { useCallback, useEffect, useState } from "react";
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
import "../styles/openspots-forms-style.css";
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
  const [userEmailInfoFromServer, setUserEmailInfoFromServer] = useState({
    email:            "",
    unverified_email: "",
    email_verified:   true,
  });

  /* OK - REVIEWED */
  const [passwordForm, setPasswordForm] = useState({
    old_password:   "",
    new_password1:  "",
    new_password2:  "",
  });
  const [profileErrors, setProfileErrors]   = useState({});
  const [passwordErrors, setPasswordErrors] = useState({});

  const [isEditingPassword, setIsEditingPassword] = useState(false);
  const [message, setMessage, messageType, setMessageType] = useToastMessage("success");
  const [loading, setLoading] = useState(true);
  const [isSavingAccountChanges, setIsSavingAccountChanges]   = useState(false);
  const [showEmailVerification, setShowEmailVerification] = useState(false);
  const [pendingEmailVerification, setPendingEmailVerification] = useState(null);
  const [checkingEmailVerification, setCheckingEmailVerification] = useState(true);


  /* OK - REVIEWED */
  const emailDiffersFromVerified = form.email.trim().toLowerCase() !== (userEmailInfoFromServer.email || "").trim().toLowerCase();

  /* OK - REVIEWED */
  const hasProfileChanges =
    form.firstname.trim() !== savedForm.firstname.trim() ||
    form.lastname.trim() !== savedForm.lastname.trim() ||
    form.phone_number.trim() !== savedForm.phone_number.trim() ||
    form.email.trim().toLowerCase() !== savedForm.email.trim().toLowerCase();

  /* OK - REVIEWED */
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
          phone_number: profile.phone_number  || ""
        };
        setForm(loadedForm);
        setSavedForm(loadedForm);

        setUserEmailInfoFromServer({
          email:            profile.email || "",
          unverified_email: profile.unverified_email || "",
          email_verified:   profile.email_verified,
        });
        // Refresh the navigation's full name and username from the loaded profile.
        storeAuthResponse({ user: profile });
      }).catch(() => {
        if (!cancelled) navigate("/accounts/login");
      }).finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      // cleanup function to prevent state updates:
      // The user leaves ProfilePage before the profile data is loaded.
      cancelled = true;
    };
  }, [navigate]);
  // navigate: It's function reference could theoretically change
  // if the router context or router instance changes.
  // During ordinary OpenSpots usage, it normally remains stable.

  /* OK - REVIEWED */
  useEffect(() => {
    /*
      Exactly. Each execution of the effect function has its own scope and its own cancelled variable.
      Its cleanup and request callbacks share that run’s variable. The next run creates a separate one.
    */
    if (loading) return undefined;

    let cancelled = false;
    getWithAuth(
      "/api/v1/accounts/verification/current/",
      { timeout: 15000 }, // 15 seconds timeout for the server to respond, because the verification status check may take a while if the server is under load.
      { onUnauthenticated: () => {
        if (!cancelled) navigate("/accounts/login");
      } }
    ).then((res) => {
      if (cancelled || !res?.data?.pending || res.data.reason !== VerificationReason.EMAIL_UPDATE) return;

      const pendingEmail = (res.data.email || "").trim().toLowerCase();
      if (!pendingEmail) return;

      setPendingEmailVerification({ ...res.data, email: pendingEmail });
      setForm((current) => ({ ...current, email: pendingEmail }));
      setShowEmailVerification(true);
    }).catch((err) => {
      if (!cancelled && err.response?.status === 401) navigate("/accounts/login");
      // Restoring pending verification is optional; other failures leave the profile usable.
    }).finally(() => {
      if (!cancelled) setCheckingEmailVerification(false);
    });

    return () => { /* CLEANUP FUNCTION */
      /* Called when:
        1. we leave the component (unmounts)
        2. Before the effect runs again (dependencies change)
      */
      cancelled = true;
    };
  }, [loading, navigate]);

  /* OK - REVIEWED */
  const showSuccess = (text) => {
    setMessageType("success");
    setMessage(text);
  };

  /* OK - REVIEWED */
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
    setPasswordErrors({});
    setPasswordForm({
      old_password:   "",
      new_password1:  "",
      new_password2:  "",
    });
  };

  /* OK - REVIEWED */
  const submitProfile = async (event) => {
    event.preventDefault(); /* stops the browser normal form submission,
    which would usually navigate to another page or reload the current one. */

    if (!hasProfileChanges || isSavingAccountChanges) return;

    const normalizedCurrentFormEmail = form.email.trim().toLowerCase();
    const emailError                 = validateEmail(normalizedCurrentFormEmail);
    const firstnameError             = validateName(form.firstname);
    const lastnameError              = validateName(form.lastname);
    const phoneError                 = validatePhone(form.phone_number);

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

    setIsSavingAccountChanges(true);
    let profileSaved = false;

    try {
      const currentVerifiedEmailFromServer  = (userEmailInfoFromServer.email || "").trim().toLowerCase();
      const emailChanged                    = normalizedCurrentFormEmail !== currentVerifiedEmailFromServer;

/* 1st block */
      const profileNamesAndPhoneFields = {
        firstname:    form.firstname.trim(),
        lastname:     form.lastname.trim(),
        phone_number: form.phone_number,
      };

      const profileNamesAndPhoneChanged =
        profileNamesAndPhoneFields.firstname           !==   savedForm.firstname.trim()      ||
        profileNamesAndPhoneFields.lastname            !==   savedForm.lastname.trim()       ||
        profileNamesAndPhoneFields.phone_number.trim() !==   savedForm.phone_number.trim();

      if (profileNamesAndPhoneChanged) {
        const profileRes = await patchWithAuth(
          "/api/v1/accounts/profile/",
          profileNamesAndPhoneFields,
          {},
          { onUnauthenticated: () => navigate("/accounts/login") }
        );

        if (!profileRes) return;

        profileSaved = true;
        storeAuthResponse({ user: profileRes.data });
        setSavedForm((current) => ({
          ...current,
          firstname:    profileRes.data.firstname || "",
          lastname:     profileRes.data.lastname || "",
          phone_number: profileRes.data.phone_number || "",
        }));
      }

/* 2nd block */
      const emailVerificationPending = pendingEmailVerification?.email === normalizedCurrentFormEmail; // Is there a pending verification process for that email?

      if (emailVerificationPending) {
        if (profileNamesAndPhoneChanged) {
          showSuccess(t("Profile updated successfully."));
        }

        setShowEmailVerification(true); /* opens the email verification modal */

        return;
      }

/* 3rd block */
      if (emailChanged) {
        /* The next api call is ONLY a request for email change,
           not an actual change */
        const emailChallengeRes = await postWithAuth(
            "/api/v1/accounts/email/update/",
            { email: normalizedCurrentFormEmail },
            verificationConfig(pendingEmailVerification?.challenge_id || ""),
            { onUnauthenticated: () => navigate("/accounts/login") }
        );

        if (!emailChallengeRes) return;

        setForm((current) => ({
          ...current,
          email: normalizedCurrentFormEmail
        }));

        setPendingEmailVerification({
          challenge_id: emailChallengeRes.data.challenge_id,
          pending:      true,
          reason:       VerificationReason.EMAIL_UPDATE,
          email:        normalizedCurrentFormEmail,
        });

        showSuccess(
          emailChallengeRes.data.detail || t("Verification code sent to your new email.")
        );

        setShowEmailVerification(true);
        return;
      }

      if (profileNamesAndPhoneChanged) showSuccess(t("Profile updated successfully."));

    } catch (err) {

      const   data = err.response?.data || {};
      const   fieldErrors = {};
      for (const field of ["email", "firstname", "lastname", "phone_number"]) {
        if (data[field]) fieldErrors[field] = Array.isArray(data[field]) ? data[field][0] : data[field];
      }

      setProfileErrors(fieldErrors);

      if (profileSaved) {
        showError(t("Profile details saved, but the email change could not be started."));
      } else if (!Object.keys(fieldErrors).length) {
        showError(data.detail || data.non_field_errors?.[0] || t("Could not update your profile."));
      }

    } finally {
      setIsSavingAccountChanges(false);
    }
  };

  /* OK - REVIEWED */
  const finishEmailVerification = (profile, detail) => {

    if (!profile) return;

    setUserEmailInfoFromServer({
      email:            profile.email || "",
      unverified_email: profile.unverified_email || "",
      email_verified:   profile.email_verified,
    });

    setPasswordErrors({}); /* Clears any password errors that may have been set before the email verification modal was opened. */

    const updatedForm = {
      firstname:    profile.firstname || "",
      lastname:     profile.lastname || "",
      username:     profile.username || "",
      email:        profile.email || "",
      phone_number: profile.phone_number || "",
    };

    setForm(updatedForm);
    setSavedForm(updatedForm);
    setPendingEmailVerification(null);
    setShowEmailVerification(false);
    showSuccess(detail || t("Profile and email updated successfully."));
  };


  const handleExpiredEmailVerification = useCallback(() => {
    setPendingEmailVerification(null);
    setShowEmailVerification(false);
    setMessageType("error");
    setMessage(t("Email verification expired. Please update your profile again to request a new code."));
  }, [t, setMessage, setMessageType]);

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
    setIsSavingAccountChanges(true);

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

      rememberVerification(res.data);
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
      setIsSavingAccountChanges(false);
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
      <div className="openspots-form-panel">
        <p>{t("Loading profile...")}</p>
      </div>
    );
  }

  return (
    <div >
      {/* aria-labelledby is used for the accessibility (screen reader support) */}
      <section className="openspots-form-panel openspots-form-section" aria-labelledby="profile-heading">
        <h3 id="profile-heading">{t("Profile")}</h3>

        {/* noValidate means that will disable browser's automatic validation */}
        <form className="openspots-form-fields" onSubmit={submitProfile} noValidate>
          {editableFields.map(([name, label, type]) => (
            // key is not exposed in HTML, React uses key internally to identify mapped elements between renders.
            <div className="openspots-form-field" key={name}>

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
                disabled={name === "email" && checkingEmailVerification}
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
            className="openspots-form-button openspots-form-button-primary openspots-form-submit" type="submit" disabled={isSavingAccountChanges || !hasProfileChanges}
            aria-busy={isSavingAccountChanges}
          >
            {isSavingAccountChanges ? t("Updating...") : t("Update Profile")}
          </button>
        </form>

        {isEditingPassword ? (
            <form className="profile-password-form openspots-form-field" onSubmit={submitPassword} noValidate>
              <div className="openspots-form-inputs">
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
                  className="openspots-form-button openspots-form-button-primary profile-action-btn"
                  type="submit"
                  disabled={isSavingAccountChanges}
                  aria-busy={isSavingAccountChanges}
                >
                  {isSavingAccountChanges ? t("Saving...") : t("Save")}
                </button>

                <button
                  className="openspots-form-button profile-button-danger profile-action-btn"
                  type="button"
                  onClick={cancelEdit}
                  disabled={isSavingAccountChanges}
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
          challengeId={pendingEmailVerification?.challenge_id}
          onExpired={handleExpiredEmailVerification}
          onCancelled={() => {
            setPendingEmailVerification(null);
            setShowEmailVerification(false);
            setForm((current) => ({ ...current, email: userEmailInfoFromServer.email }));
          }}
          onClose={() => setShowEmailVerification(false)}
          onVerified={finishEmailVerification}
        />
      )}

    </div>
  );
}
