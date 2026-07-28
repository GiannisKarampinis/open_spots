import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

export default function SocialLoginCompletePage() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("Completing Google login...");

  useEffect(() => {
    let active = true;

    async function completeLogin() {
      try {
        const res = await axios.get("/api/v1/accounts/social/session/", { withCredentials: true });

        localStorage.setItem("access", res.data.access);
        localStorage.setItem("refresh", res.data.refresh);
        localStorage.setItem("user", JSON.stringify(res.data.user));
        window.dispatchEvent(new Event("auth:changed"));

        if (active) {
          navigate(res.data.redirect_to || "/", { replace: true });
        }
      } catch (err) {
        if (active) {
          setMessage("Google login could not be completed. Please try again.");
          setTimeout(() => navigate("/accounts/login", { replace: true }), 1200);
        }
      }
    }

    completeLogin();

    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <div className="login-container">
      <h2>Google Login</h2>
      <p>{message}</p>
    </div>
  );
}
