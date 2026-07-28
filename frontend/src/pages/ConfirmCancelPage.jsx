import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { authHeaders, getAccessToken } from "../utils/auth";

export default function ConfirmCancelPage() {
  const { reservationId } = useParams();
  const navigate = useNavigate();
  const [reservation, setReservation] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!getAccessToken()) { navigate(`/accounts/login?next=${window.location.pathname}`); return; }
    axios.get(`/api/v1/reservations/${reservationId}/`, { headers: authHeaders(), withCredentials: true })
      .then((res) => setReservation(res.data)).catch(() => setMessage("Could not load reservation."));
  }, [navigate, reservationId]);

  const cancel = async () => {
    try { await axios.post(`/api/v1/reservations/${reservationId}/cancel/`, {}, { headers: authHeaders(), withCredentials: true }); navigate("/venues/my-reservations"); }
    catch { setMessage("Could not cancel reservation."); }
  };

  return <div className="max-w-xl mx-auto mt-8 p-6 bg-white rounded shadow">
    <h2 className="text-xl font-semibold mb-4">Cancel Reservation</h2>
    {message && <p className="auth-message error">{message}</p>}
    {reservation ? <p>Are you sure you want to cancel your reservation at <strong>{reservation.venue_name || `Venue #${reservation.venue_id}`}</strong> on <strong>{reservation.date}</strong> at <strong>{String(reservation.time || "").slice(0,5)}</strong>?</p> : <p>Loading...</p>}
    <button type="button" className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700" onClick={cancel}>Yes, Cancel</button>
    <Link to="/venues/my-reservations" className="ml-4 text-blue-600">No, go back</Link>
  </div>;
}
