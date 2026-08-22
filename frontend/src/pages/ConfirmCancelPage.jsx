import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { authHeaders, getAccessToken } from "../utils/auth";
import "../styles/confirm_cancel.css";
import { useTranslation } from "react-i18next";

export default function ConfirmCancelPage() {
  const { t } = useTranslation();
  const { reservationId } = useParams();
  const navigate = useNavigate();

  const [reservation, setReservation] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!getAccessToken()) {
      navigate(`/accounts/login?next=${window.location.pathname}`);
      return;
    }

    axios
      .get(`/api/v1/reservations/${reservationId}/`, {
        headers: authHeaders(),
        withCredentials: true,
      })
      .then((res) => setReservation(res.data))
      .catch(() => setMessage(t("Could not load reservation.")));
  }, [navigate, reservationId, t]);

  const cancel = async () => {
    try {
      await axios.post(
        `/api/v1/reservations/${reservationId}/cancel/`,
        {},
        {
          headers: authHeaders(),
          withCredentials: true,
        }
      );

      navigate("/venues/my-reservations");
    } catch {
      setMessage(t("Could not cancel reservation."));
    }
  };

  return (
    <div className="confirm-cancel-page">
      <h2>{t("Cancel Reservation")}</h2>

      {message && <p className="confirm-cancel-message">{message}</p>}

      {reservation ? (
        <p>
          {t("Are you sure you want to cancel your reservation at")}{" "}
          <strong>
            {reservation.venue_name || `${t("Venue")} #${reservation.venue_id}`}
          </strong>{" "}
          {t("on")} <strong>{reservation.date}</strong> {t("at")}{" "}
          <strong>{String(reservation.time || "").slice(0, 5)}</strong>?
        </p>
      ) : (
        <p>{t("Loading...")}</p>
      )}

      <div className="confirm-cancel-actions">
        <button
          type="button"
          className="confirm-cancel-btn danger"
          onClick={cancel}
        >
          {t("Cancel")}
        </button>

        <button
          type="button"
          className="confirm-cancel-btn back"
          onClick={() => navigate("/venues/my-reservations")}
        >
          {t("Go back")}
        </button>
      </div>
    </div>
  );
}