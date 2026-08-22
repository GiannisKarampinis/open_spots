import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "../styles/reservation_pending.css";

export default function ReservationPendingPage() {
  const { t } = useTranslation();

  return (
    <div className="success-message">
      <div className="box-canvas">
        <div className="frame">
          <div className="top" />
          <div className="bottom">
            <div className="drip" />
            <div className="blob" />
            <div className="glass" />
          </div>
        </div>
      </div>

      <h2>{t("Reservation Pending")}</h2>

      <p>
        {t(
          "Thank you for your booking request. Your reservation is currently pending and requires confirmation from the venue administrator."
        )}
      </p>

      <p>
        {t("You’ll receive a confirmation or update shortly via email.")}
      </p>

      <Link to="/">{t("Back to Venue List")}</Link>
    </div>
  );
}