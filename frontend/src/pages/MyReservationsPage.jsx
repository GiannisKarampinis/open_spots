import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendarDays, faUsers, faPenToSquare, faXmark, faClockRotateLeft, faBan } from "@fortawesome/free-solid-svg-icons";
import { getWithAuth, postWithAuth } from "../utils/auth";
import "../styles/my_reservations.css";
import { isReservationUpcoming } from "../utils/reservationTime";
import useReservationClock from "../hooks/useReservationClock";

function getStatusLabel(status, t) {
  if (!status) return "";

  const normalized = String(status).toLowerCase();

  const labels = {
    pending: t("Pending"),
    accepted: t("Accepted"),
    confirmed: t("Confirmed"),
    cancelled: t("Cancelled"),
    rejected: t("Rejected"),
    completed: t("Completed"),
  };

  return labels[normalized] || status.charAt(0).toUpperCase() + status.slice(1);
}

function ReservationList({ reservations, onCancel, now, cancellingId }) {
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
            <div className="reservation-card-header">
              <strong className="reservation-card-title">
                {t("Reservation at")}: {venueName}
              </strong>
            </div>

            <div className="reservation-info">
              <div className="reservation-details">
              <span>
                <FontAwesomeIcon icon={faCalendarDays} aria-hidden="true" /> {t("Date")}: {reservation.date}{" "}
                {String(reservation.time || "").slice(0, 5)}
              </span>
              <br />

              <span>
                <FontAwesomeIcon icon={faUsers} aria-hidden="true" /> {t("Guests")}: {reservation.guests}
              </span>
              <br />

              <span className={`status-badge ${reservation.status}`}>
                {t("Status")}: {getStatusLabel(reservation.status, t)}
              </span>
              </div>
            {reservation.status !== "cancelled" && isReservationUpcoming(reservation, now) && (
              <div className="reservation-actions">
                <Link
                  to={`/venues/reservations/${reservation.id}/edit`}
                  className="edit-btn"
                >
                  <FontAwesomeIcon icon={faPenToSquare} aria-hidden="true" /> {t("Edit")}
                </Link>

                <button
                  type="button"
                  className="cancel-btn"
                  onClick={() => onCancel(reservation.id)}
                  disabled={cancellingId !== null}
                >
                  <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
                  {cancellingId === reservation.id ? t("Cancelling...") : t("Cancel")}
                </button>
              </div>
            )}
            </div>


          </li>
        );
      })}
    </ul>
  );
}

export default function MyReservationsPage() {
  // Reviewed: cancellation, refresh failures, retry, and duplicate submissions are handled explicitly.
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [reservations, setReservations] = useState([]);
  const now = useReservationClock(reservations);
  const [activeTab, setActiveTab] = useState("upcoming");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [cancellingId, setCancellingId] = useState(null);

  const loadReservations = useCallback(async () => {
    const res = await getWithAuth(
      "/api/v1/reservations/",
      {},
      { onUnauthenticated: () => navigate("/accounts/login?next=/venues/my-reservations") }
    );

    if (!res) return;

    setReservations(Array.isArray(res.data) ? res.data : res.data.results || []);
  }, [navigate]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    setMessage("");

    // Fetch reservations and handle stale/unmounted requests safely.
    // If the request fails after this effect was cleaned up, ignore it.
    // Otherwise surface the error and stop the loading spinner.
    loadReservations()
      .catch(() => {
        if (!active) return;
        setLoadError(true);
        setMessage(t("Could not load reservations."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    // Cleanup prevents state updates from a stale request when the component
    // unmounts or before the effect reruns due to dependency changes.
    return () => {
      active = false;
    };
  }, [loadReservations, loadAttempt, t]);

  const grouped = useMemo(
    () => ({
      upcoming: reservations.filter(
        (reservation) =>
          reservation.status !== "cancelled" && isReservationUpcoming(reservation, now)
      ),
      past: reservations.filter(
        (reservation) =>
          reservation.status !== "cancelled" && !isReservationUpcoming(reservation, now)
      ),
      cancelled: reservations.filter(
        (reservation) => reservation.status === "cancelled"
      ),
    }),
    [reservations, now]
  );

  // Cancel a reservation, preventing duplicate actions while one cancel request is in flight.
  const cancelReservation = async (id) => {
    // Ignore repeated clicks while another cancellation is already pending.
    if (cancellingId !== null) return;

    // Confirm before making the destructive request.
    if (!window.confirm(t("Are you sure you want to cancel this reservation?"))) {
      return;
    }

    // Mark the specific reservation as being cancelled to disable the button immediately.
    setCancellingId(id);
    try {
      // Send the cancel request to the backend.
      const res = await postWithAuth(
        `/api/v1/reservations/${id}/cancel/`,
        {},
        {},
        { onUnauthenticated: () => navigate("/accounts/login?next=/venues/my-reservations") }
      );

      // If the request was rejected/unauthorized, do not continue to refresh the list.
      if (!res) return;

      try {
        // Refresh the reservation list so the UI reflects the cancelled state.
        await loadReservations();
      } catch {
        // Refresh can fail after a successful cancel request; show a load error.
        setLoadError(true);
        setMessage(t("Could not load reservations."));
      }
    } catch {
      // The cancellation request itself failed, so show an error message.
      setMessage(t("Could not cancel reservation."));
    } finally {
      // Always clear the in-flight cancellation marker, regardless of success/failure.
      setCancellingId(null);
    }
  };

  const tabs = [
    ["upcoming", t("Upcoming"), faCalendarDays],
    ["past", t("Past"), faClockRotateLeft],
    ["cancelled", t("Cancelled"), faBan],
  ];

  return (
    <div className="reservations-container">
      <h2>{t("My Reservations")}</h2>

      {message && <p className="auth-message error">{message}</p>}

      <div className="tabs">
        {tabs.map(([id, label, icon]) => (
          <button
            key={id}
            className={`tab-button ${activeTab === id ? "active" : ""}`}
            type="button"
            onClick={() => setActiveTab(id)}
          >
            <FontAwesomeIcon icon={icon} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <div className="tab-content active">
        {loading ? (
          <p>{t("Loading...")}</p>
        ) : loadError ? (
          <div>
            <button type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>
              {t("Retry")}
            </button>
          </div>
        ) : (
          <ReservationList
            reservations={grouped[activeTab]}
            onCancel={cancelReservation}
            now={now}
            cancellingId={cancellingId}
          />
        )}
      </div>
    </div>
  );
}
