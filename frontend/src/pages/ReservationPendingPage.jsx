import { Link } from "react-router-dom";
import "../styles/reservation_pending.css";

export default function ReservationPendingPage() {
  return (
    <div className="success-message">
      <div className="box-canvas"><div className="frame"><div className="top" /><div className="bottom"><div className="drip" /><div className="blob" /><div className="glass" /></div></div></div>
      <h2>Reservation Pending</h2>
      <p>Thank you for your booking request. Your reservation is currently pending and requires confirmation from the venue administrator.</p>
      <p>You’ll receive a confirmation or update shortly via email.</p>
      <Link to="/">Back to Venue List</Link>
    </div>
  );
}
