import    { useState } 				from "react";
import    { Link, useLocation, useNavigate } 	from "react-router-dom";
import    axios 				from "axios";
import    googleIcon 				from "../assets/google-icon.svg";
import    { storeAuthResponse } 		from "../utils/auth";
import    "../styles/login1.css";
import    "../styles/feedback.css";


function fieldErrors(errors, name) {
  const value = errors?.[name];
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}


export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] 	    = useState({ username: "", password: "", code: "" });
  const [errors, setErrors] 	    = useState({});
  const [message, setMessage] 	    = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);

  const next = new URLSearchParams(location.search).get("next");

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current)   => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined, non_field_errors: undefined }));
    setMessage("");
  };

  const submit = async (event) => {
    event.preventDefault();
    
    setSubmitting(true);
    setErrors({});
    setMessage("");

    try {
      const res = requiresTwoFactor
        ? await axios.post("/api/v1/accounts/login/2fa/", { code: form.code }, { withCredentials: true })
        : await axios.post(
            "/api/v1/accounts/login/",
            { username: form.username, password: form.password },
            { withCredentials: true },
          );

      if (res.data.requires_2fa) {
        setRequiresTwoFactor(true);
        setMessage(res.data.detail || "Enter the code from your authenticator app.");
        return;
      }
      
      storeAuthResponse(res.data);
      navigate(next || res.data.redirect_to || "/");
    } catch (err) {
      const data = err.response?.data || {};
      if (data.requires_verification) {
	setMessage(data.detail || "Please verify your email before continuing.");
	setTimeout(() => navigate("/accounts/verify-email"), 600);
      } else if (typeof data === "object") {
	setErrors(data);
      } else {
	setMessage("Login failed. Please check your credentials.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const usernameErrors = fieldErrors(errors, "username");
  const passwordErrors = fieldErrors(errors, "password");
  const codeErrors = fieldErrors(errors, "code");
  const nonFieldErrors = fieldErrors(errors, "non_field_errors");
  const detailErrors = fieldErrors(errors, "detail");
  const feedbackMessages = [
    ...(message ? [message] : []),
    ...detailErrors,
    ...nonFieldErrors,
    ...usernameErrors,
    ...passwordErrors,
    ...codeErrors,
  ];
  const clearFeedback = () => {
    setMessage("");
    setErrors({});
  };

  return (
    <div className="login-container">
      <h2>{requiresTwoFactor ? "Two-Factor Authentication" : "Welcome Back"}</h2>

      {feedbackMessages.length > 0 && (
	<div className="messages-container floating-messages" aria-live="polite" aria-atomic="true">
	  {feedbackMessages.map((feedbackMessage) => (
	    <div className="alert alert-error fade-message" key={feedbackMessage}>
	      {feedbackMessage}
	      <button className="close-btn" type="button" onClick={clearFeedback} aria-label="Dismiss message">
		&times;
	      </button>
	    </div>
	  ))}
	</div>
      )}

      {!requiresTwoFactor && (
        <>
          <div className="google-login-container">
	    <a className="google-login-link" href="/accounts/google/login/?process=login" aria-label="Login with Google">
	      <img src={googleIcon} alt="Google logo" className="google-icon" />
	      Login with Google
	    </a>
          </div>

          <div className="divider"><span>or</span></div>
        </>
      )}

      <form className="login-form" onSubmit={submit}>
        {requiresTwoFactor ? (
          <div>
	    <label htmlFor="login-code">Authenticator code</label>
	    <input
	      id="login-code"
	      name="code"
	      type="text"
	      inputMode="numeric"
	      value={form.code}
	      onChange={updateField}
	      aria-invalid={codeErrors.length > 0}
	      autoComplete="one-time-code"
	      required
	    />
	  </div>
        ) : (
          <>
	    <div>
	      <label htmlFor="login-username">Username</label>
	      <input
	        id="login-username"
	        name="username"
	        type="text"
	        value={form.username}
	        onChange={updateField}
	        aria-invalid={usernameErrors.length > 0}
	        autoComplete="username"
	        required
	      />
	    </div>

	    <div>
	      <label htmlFor="login-password">Password</label>
	      <input
	        id="login-password"
	        name="password"
	        type="password"
	        value={form.password}
	        onChange={updateField}
	        aria-invalid={passwordErrors.length > 0}
	        autoComplete="current-password"
	        required
	      />
	    </div>
          </>
        )}

	<button className="btn primary-btn" type="submit" disabled={submitting}>
	  {submitting ? "Logging in..." : requiresTwoFactor ? "Verify" : "Login"}
	</button>

        {requiresTwoFactor && (
          <button
            className="btn secondary-btn"
            type="button"
            onClick={() => {
              setRequiresTwoFactor(false);
              setForm((current) => ({ ...current, code: "" }));
              clearFeedback();
            }}
            disabled={submitting}
          >
            Back
          </button>
        )}
      </form>

      {!requiresTwoFactor && (
        <p className="auth-secondary-link">
	  <a href="/accounts/password-recover/">Forgot your password?</a>
        </p>
      )}

      {!requiresTwoFactor && (
        <p className="signup-prompt">
	  Don&apos;t have an account? <Link to="/accounts/signup">Sign up</Link>
        </p>
      )}
    </div>
  );
}
