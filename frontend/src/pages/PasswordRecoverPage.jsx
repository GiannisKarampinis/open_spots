import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import "../styles/password_recover.css";

export default function PasswordRecoverPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    try {
      const res = await axios.post("/api/v1/accounts/password/recover/", { email }, { withCredentials: true });
      setMessage(res.data.detail || "If the email exists, a verification code has been sent.");
      setTimeout(() => navigate("/accounts/verify-email"), 700);
    } catch (err) {
      setMessage(err.response?.data?.detail || "Could not start password recovery.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="form-container">
      <h2>Password Recovery</h2>
      {message && <p className="auth-message success">{message}</p>}
      <form onSubmit={submit}>
        <p><label>Email<br /><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label></p>
        <button type="submit" disabled={submitting}>{submitting ? "Sending..." : "Send Verification Code"}</button>
      </form>
    </div>
  );
}
