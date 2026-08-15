import { useEffect, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import "../styles/venue_list.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFilter,
  faPenToSquare,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import VenueSection from "../components/venues/VenueSection";
import { mediaUrl } from "../utils/media";
import { getAccessToken, refreshAccessToken } from "../utils/auth";

function formatReservationDate(value) {
  if (!value) return "";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatReservationTime(value) {
  if (!value) return "";

  return String(value).slice(0, 5);
}

function getReservationVenueImage(reservation) {
  const venue = reservation?.venue || {};

  const image =
    venue.first_image_url ||
    venue.image_url ||
    venue.first_image ||
    venue.image ||
    "";

  if (!image) {
    return "/static/images/venue-placeholder.png";
  }

  return mediaUrl(image);
}

function QuickReservationCard({ reservation }) {
  if (!reservation) return null;

  const venue = reservation.venue || {};
  const imageSrc = getReservationVenueImage(reservation);

  return (
    <div className="quick-reservation-card">
      <h3>Your Next Reservation</h3>

      <div className="reservation-info">
        <strong>{venue.name}</strong>
        <br />
        {formatReservationDate(reservation.date)}{" "}
        {formatReservationTime(reservation.time)}
        <br />

        {reservation.table_number && (
          <>
            Table: {reservation.table_number}
          </>
        )}
      </div>

      <img
        className="venue-image"
        src={imageSrc}
        alt={venue.name || "Venue"}
        onError={(event) => {
          event.currentTarget.style.display = "none";
        }}
      />

      <div className="reservation-actions">
        <Link
          to={`/venues/reservations/${reservation.id}/edit`}
          className="edit-btn"
        >
          <FontAwesomeIcon icon={faPenToSquare} /> Edit
        </Link>

        <Link
          to={`/venues/reservation/${reservation.id}/cancel`}
          className="cancel-btn"
        >
          <FontAwesomeIcon icon={faXmark} /> Cancel
        </Link>
      </div>
    </div>
  );
}

async function getOptionalAuthHeaders() {
  let token = getAccessToken();

  if (!token) {
    try {
      token = await refreshAccessToken();
    } catch {
      token = null;
    }
  }

  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function VenuesPage() {
  const [grouped, setGrouped] = useState({
    cafe_bar: [],
    restaurants: [],
    beach_bar: [],
    other: [],
  });

  const [upcomingReservation, setUpcomingReservation] = useState(null);
  const [kind, setKind] = useState("");
  const [availability, setAvailability] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetchVenues();
  }, [kind, availability]);

  const fetchVenues = async () => {
    try {
      setMessage("");

      const headers = await getOptionalAuthHeaders();

      const res = await axios.get("/api/v1/venues/", {
        params: { kind, availability },
        headers,
        withCredentials: true,
      });

      console.log("Venues response:", res.data);

      const groupedResults = res.data.results || {};

      setGrouped({
        cafe_bar: groupedResults.cafe_bar || [],
        restaurants: groupedResults.restaurants || [],
        beach_bar: groupedResults.beach_bar || [],
        other: groupedResults.other || [],
      });

      setUpcomingReservation(res.data.upcoming_reservation || null);
    } catch (err) {
      console.error("Error fetching venues:", err.response?.status, err.response?.data);
      setMessage("Could not load venues.");
    }
  };

  const clearFilters = () => {
    setKind("");
    setAvailability("");
  };

  const hasFilters = Boolean(kind || availability);

  return (
    <div className="page-container">
      <h2>Explore & Reserve Your Perfect Spot</h2>

      {message && (
        <div className="alert alert-info mb-3">
          {message}
        </div>
      )}

      <div className="filter-form">
        <div className="sticky-wrapper">
          <div className="filter-wrapper sticky-filter">
            <FontAwesomeIcon icon={faFilter} className="filter-icon" />

            <select
              className="filter-menu"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="">All Venues</option>
              <option value="restaurant">Restaurants</option>
              <option value="cafe">Cafes & Bars</option>
              <option value="beach_bar">Beach Bars</option>
              <option value="other">Other</option>
            </select>

            <select
              className="filter-menu"
              value={availability}
              onChange={(e) => setAvailability(e.target.value)}
            >
              <option value="">All</option>
              <option value="available">Available</option>
              <option value="full">Full</option>
            </select>

            {hasFilters && (
              <button
                type="button"
                className="clear-filter-btn"
                onClick={clearFilters}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      <QuickReservationCard reservation={upcomingReservation} />

      <VenueSection title="Cafes & Bars" venues={grouped.cafe_bar} />

      <VenueSection title="Restaurants" venues={grouped.restaurants} />

      <VenueSection title="Beach Bars" venues={grouped.beach_bar} />

      <VenueSection title="Other Venues" venues={grouped.other} />
    </div>
  );
}