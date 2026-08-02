import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/password_recover.css";
import { postWithCsrf } from "../utils/auth";

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
      const res = await postWithCsrf("/api/v1/accounts/password/recover/", {
        email,
      });

      setMessage(
        res.data.detail ||
          "If the email exists, a verification code has been sent."
      );

      setTimeout(() => {
        navigate("/accounts/verify-email");
      }, 700);
    } catch (err) {
      const data = err.response?.data;

      if (data?.detail) {
        setMessage(data.detail);
      } else if (data?.email?.length) {
        setMessage(data.email[0]);
      } else {
        setMessage("Could not start password recovery.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="form-container">
      <h2>Password Recovery</h2>

      {message && <p className="auth-message success">{message}</p>}

      <form onSubmit={submit}>
        <p>
          <label>
            Email
            <br />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
        </p>

        <button type="submit" disabled={submitting}>
          {submitting ? "Sending..." : "Send Verification Code"}
        </button>
      </form>
    </div>
  );
}