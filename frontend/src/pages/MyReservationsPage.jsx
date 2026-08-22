import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import axios from "axios";
import { authHeaders, getAccessToken } from "../utils/auth";
import "../styles/my_reservations.css";

function isUpcoming(reservation) {
  if (typeof reservation.is_upcoming === "boolean") {
    return reservation.is_upcoming;
  }

  const dt = new Date(`${reservation.date}T${reservation.time || "00:00"}`);
  return dt >= new Date();
}

function getStatusLabel(status, t) {
  if (!status) return "";

  const normalized = String(status).toLowerCase();

  const labels = {
    pending: t("Pending"),
    confirmed: t("Confirmed"),
    cancelled: t("Cancelled"),
    rejected: t("Rejected"),
    completed: t("Completed"),
  };

  return labels[normalized] || status.charAt(0).toUpperCase() + status.slice(1);
}

function ReservationList({ reservations, onCancel }) {
  const { t } = useTranslation();

  if (!reservations.length) {
    return <p className="empty-msg">{t("No reservations found.")}</p>;
  }

  return (
    <ul className="reservation-list">
      {reservations.map((reservation) => {
        const venueName =
          reservation.venue_name ||
          reservation.venue?.name ||
          `${t("Venue")} #${reservation.venue_id}`;

        return (
          <li className="reservation-card" key={reservation.id}>
            <div className="reservation-info">
              <strong>
                {t("Reservation at")}: {venueName}
              </strong>
              <br />

              <span>
                📅 {t("Date")}: {reservation.date}{" "}
                {String(reservation.time || "").slice(0, 5)}
              </span>
              <br />

              <span>
                👥 {t("Guests")}: {reservation.guests}
              </span>
              <br />

              <span className={`status-badge ${reservation.status}`}>
                {t("Status")}: {getStatusLabel(reservation.status, t)}
              </span>
            </div>

            {reservation.status !== "cancelled" && isUpcoming(reservation) && (
              <div className="reservation-actions">
                <Link
                  to={`/venues/reservations/${reservation.id}/edit`}
                  className="edit-btn"
                >
                  ✎ {t("Edit")}
                </Link>

                <button
                  type="button"
                  className="cancel-btn"
                  onClick={() => onCancel(reservation.id)}
                >
                  × {t("Cancel")}
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function MyReservationsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [reservations, setReservations] = useState([]);
  const [activeTab, setActiveTab] = useState("upcoming");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const loadReservations = useCallback(async () => {
    const res = await axios.get("/api/v1/reservations/", {
      headers: authHeaders(),
      withCredentials: true,
    });

    setReservations(Array.isArray(res.data) ? res.data : res.data.results || []);
  }, []);

  useEffect(() => {
    if (!getAccessToken()) {
      navigate("/accounts/login?next=/venues/my-reservations");
      return;
    }

    loadReservations()
      .catch(() => setMessage(t("Could not load reservations.")))
      .finally(() => setLoading(false));
  }, [navigate, loadReservations, t]);

  const grouped = useMemo(
    () => ({
      upcoming: reservations.filter(
        (reservation) =>
          reservation.status !== "cancelled" && isUpcoming(reservation)
      ),
      past: reservations.filter(
        (reservation) =>
          reservation.status !== "cancelled" && !isUpcoming(reservation)
      ),
      cancelled: reservations.filter(
        (reservation) => reservation.status === "cancelled"
      ),
    }),
    [reservations]
  );

  const cancelReservation = async (id) => {
    if (!window.confirm(t("Are you sure you want to cancel this reservation?"))) {
      return;
    }

    try {
      await axios.post(
        `/api/v1/reservations/${id}/cancel/`,
        {},
        {
          headers: authHeaders(),
          withCredentials: true,
        }
      );

      await loadReservations();
    } catch {
      setMessage(t("Could not cancel reservation."));
    }
  };

  const tabs = [
    ["upcoming", `📅 ${t("Upcoming")}`],
    ["past", `↺ ${t("Past")}`],
    ["cancelled", `⊘ ${t("Cancelled")}`],
  ];

  return (
    <div className="reservations-container">
      <h2>{t("My Reservations")}</h2>

      {message && <p className="auth-message error">{message}</p>}

      <div className="tabs">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            className={`tab-button ${activeTab === id ? "active" : ""}`}
            type="button"
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="tab-content active">
        {loading ? (
          <p>{t("Loading...")}</p>
        ) : (
          <ReservationList
            reservations={grouped[activeTab]}
            onCancel={cancelReservation}
          />
        )}
      </div>
    </div>
  );
}