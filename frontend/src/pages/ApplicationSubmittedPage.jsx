import { Link } from "react-router-dom";
import "../styles/auth.css";

export default function ApplicationSubmittedPage() {
  return (
    <div className="auth-container">
      <h2>Thank you!</h2>
      <p>Your application has been submitted. We will review it and contact you shortly.</p>
      <Link className="auth-submit" to="/">Back to Venues</Link>
    </div>
  );
}
