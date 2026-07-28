import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { authHeaders, getAccessToken } from "../utils/auth";
import "../styles/my_reservations.css";

function isUpcoming(reservation) {
  if (typeof reservation.is_upcoming === "boolean") return reservation.is_upcoming;
  const dt = new Date(`${reservation.date}T${reservation.time || "00:00"}`);
  return dt >= new Date();
}

function ReservationList({ reservations, onCancel }) {
  if (!reservations.length) return <p className="empty-msg">No reservations found.</p>;
  return <ul className="reservation-list">{reservations.map((r) => (
    <li className="reservation-card" key={r.id}>
      <div className="reservation-info">
        <strong>Reservation at: {r.venue_name || r.venue?.name || `Venue #${r.venue_id}`}</strong><br />
        <span>📅 Date: {r.date} {String(r.time || "").slice(0,5)}</span><br />
        <span>👥 Guests: {r.guests}</span><br />
        <span className={`status-badge ${r.status}`}>Status: {r.status?.charAt(0).toUpperCase() + r.status?.slice(1)}</span>
      </div>
      {r.status !== "cancelled" && isUpcoming(r) && <div className="reservation-actions">
        <Link to={`/venues/reservations/${r.id}/edit`} className="edit-btn">✎ Edit</Link>
        <button type="button" className="cancel-btn" onClick={() => onCancel(r.id)}>× Cancel</button>
      </div>}
    </li>
  ))}</ul>;
}

export default function MyReservationsPage() {
  const navigate = useNavigate();
  const [reservations, setReservations] = useState([]);
  const [activeTab, setActiveTab] = useState("upcoming");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const loadReservations = async () => {
    const res = await axios.get("/api/v1/reservations/", { headers: authHeaders(), withCredentials: true });
    setReservations(Array.isArray(res.data) ? res.data : res.data.results || []);
  };

  useEffect(() => {
    if (!getAccessToken()) { navigate("/accounts/login?next=/venues/my-reservations"); return; }
    loadReservations().catch(() => setMessage("Could not load reservations.")).finally(() => setLoading(false));
  }, [navigate]);

  const grouped = useMemo(() => ({
    upcoming: reservations.filter((r) => r.status !== "cancelled" && isUpcoming(r)),
    past: reservations.filter((r) => r.status !== "cancelled" && !isUpcoming(r)),
    cancelled: reservations.filter((r) => r.status === "cancelled"),
  }), [reservations]);

  const cancelReservation = async (id) => {
    if (!window.confirm("Are you sure you want to cancel this reservation?")) return;
    try { await axios.post(`/api/v1/reservations/${id}/cancel/`, {}, { headers: authHeaders(), withCredentials: true }); await loadReservations(); }
    catch { setMessage("Could not cancel reservation."); }
  };

  return (
    <div className="reservations-container">
      <h2>My Reservations</h2>
      {message && <p className="auth-message error">{message}</p>}
      <div className="tabs">{[["upcoming", "📅 Upcoming"], ["past", "↺ Past"], ["cancelled", "⊘ Cancelled"]].map(([id,label]) => <button key={id} className={`tab-button ${activeTab===id ? "active" : ""}`} type="button" onClick={() => setActiveTab(id)}>{label}</button>)}</div>
      <div className="tab-content active">{loading ? <p>Loading...</p> : <ReservationList reservations={grouped[activeTab]} onCancel={cancelReservation} />}</div>
    </div>
  );
}
