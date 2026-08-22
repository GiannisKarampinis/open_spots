import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "../styles/auth.css";

export default function ApplicationSubmittedPage() {
  const { t } = useTranslation();

  return (
    <div className="auth-container">
      <h2>{t("Thank you!")}</h2>

      <p>
        {t(
          "Your application has been submitted. We will review it and contact you shortly."
        )}
      </p>

      <Link className="auth-submit" to="/">
        {t("Back to Venues")}
      </Link>
    </div>
  );
}