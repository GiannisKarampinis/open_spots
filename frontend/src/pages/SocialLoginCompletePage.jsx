import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import axios from "axios";
import { storeAuthResponse } from "../utils/auth";
import { useToastMessage } from "../components/ToastProvider";

export default function SocialLoginCompletePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [, setMessage] = useToastMessage("error");

  useEffect(() => {
    let active = true;

    async function completeLogin() {
      try {
        const res = await axios.get("/api/v1/accounts/social/session/", {
          withCredentials: true,
        });

        storeAuthResponse(res.data);

        if (active) {
          navigate(res.data.redirect_to || "/", { replace: true });
        }
      } catch (err) {
        if (active) {
          setMessage(t("Google login could not be completed. Please try again."));

          setTimeout(() => {
            navigate("/accounts/login", { replace: true });
          }, 1200);
        }
      }
    }

    completeLogin();

    return () => {
      active = false;
    };
  }, [navigate, t]);

  return (
    <div className="login-container">
      <h2>{t("Google Login")}</h2>
      <p>{t("Completing Google login...")}</p>
    </div>
  );
}
