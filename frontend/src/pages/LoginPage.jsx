import    { useState } 				from "react";
import    { Link, useLocation, useNavigate } 	from "react-router-dom";
import    axios 				from "axios";
import    googleIcon 				from "../assets/google-icon.svg";
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
  const [form, setForm] 	    = useState({ username: "", password: "" });
  const [errors, setErrors] 	    = useState({});
  const [message, setMessage] 	    = useState("");
  const [submitting, setSubmitting] = useState(false);

  const next = new URLSearchParams(location.search).get("next");
  const backendBase = import.meta.env.VITE_BACKEND_URL || (window.location.port === "5173" ? "http://localhost:8000" : "");
  const googleLoginUrl = `${backendBase}/accounts/google/login/?process=login`;

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
      const res = await axios.post("/api/v1/accounts/login/", form, { withCredentials: true });
      
      localStorage.setItem("access", res.data.access);
      localStorage.setItem("refresh", res.data.refresh);
      localStorage.setItem("user", JSON.stringify(res.data.user));
 
      window.dispatchEvent(new Event("auth:changed"));
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
  const nonFieldErrors = fieldErrors(errors, "non_field_errors");
  const detailErrors = fieldErrors(errors, "detail");
  const feedbackMessages = [
    ...(message ? [message] : []),
    ...detailErrors,
    ...nonFieldErrors,
    ...usernameErrors,
    ...passwordErrors,
  ];
  const clearFeedback = () => {
    setMessage("");
    setErrors({});
  };

  return (
    <div className="login-container">
      <h2>Welcome Back</h2>

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

      <div className="google-login-container">
	<a className="google-login-link" href={googleLoginUrl} aria-label="Login with Google">
	  <img src={googleIcon} alt="Google logo" className="google-icon" />
	  Login with Google
	</a>
      </div>

      <div className="divider"><span>or</span></div>

      <form className="login-form" onSubmit={submit}>
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

	<button className="btn primary-btn" type="submit" disabled={submitting}>
	  {submitting ? "Logging in..." : "Login"}
	</button>
      </form>

      <p className="auth-secondary-link">
	<a href="/accounts/password-recover">Forgot your password?</a>
      </p>

      <p className="signup-prompt">
	Don&apos;t have an account? <Link to="/accounts/signup">Sign up</Link>
      </p>
    </div>
  );
}
