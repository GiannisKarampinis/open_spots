import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
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

function formatReservationDate(value, locale = "en") {
  if (!value) return "";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
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
  const { t, i18n } = useTranslation();

  if (!reservation) return null;

  const venue = reservation.venue || {};
  const imageSrc = getReservationVenueImage(reservation);
  const dateLocale = i18n.language === "el" ? "el-GR" : "en";

  return (
    <div className="quick-reservation-card">
      <h3>{t("Your Next Reservation")}</h3>

      <div className="reservation-info">
        <strong>{venue.name}</strong>
        <br />

        {formatReservationDate(reservation.date, dateLocale)}{" "}
        {formatReservationTime(reservation.time)}
        <br />

        {reservation.table_number && (
          <>
            {t("Table")}: {reservation.table_number}
          </>
        )}
      </div>

      <img
        className="venue-image"
        src={imageSrc}
        alt={venue.name || t("Venue")}
        onError={(event) => {
          event.currentTarget.style.display = "none";
        }}
      />

      <div className="reservation-actions">
        <Link
          to={`/venues/reservations/${reservation.id}/edit`}
          className="edit-btn"
        >
          <FontAwesomeIcon icon={faPenToSquare} /> {t("Edit")}
        </Link>

        <Link
          to={`/venues/reservation/${reservation.id}/cancel`}
          className="cancel-btn"
        >
          <FontAwesomeIcon icon={faXmark} /> {t("Cancel")}
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
  const { t } = useTranslation();

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

  const fetchVenues = useCallback(async () => {
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
      console.error(
        "Error fetching venues:",
        err.response?.status,
        err.response?.data
      );

      setMessage(t("Could not load venues."));
    }
  }, [kind, availability, t]);

  useEffect(() => {
    fetchVenues();
  }, [fetchVenues]);

  const clearFilters = () => {
    setKind("");
    setAvailability("");
  };

  const hasFilters = Boolean(kind || availability);

  return (
    <div className="page-container">
      <h2>{t("Explore & Reserve Your Perfect Spot")}</h2>

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
              <option value="">{t("All Venues")}</option>
              <option value="restaurant">{t("Restaurants")}</option>
              <option value="cafe">{t("Cafes & Bars")}</option>
              <option value="beach_bar">{t("Beach Bars")}</option>
              <option value="other">{t("Other")}</option>
            </select>

            <select
              className="filter-menu"
              value={availability}
              onChange={(e) => setAvailability(e.target.value)}
            >
              <option value="">{t("All")}</option>
              <option value="available">{t("Available")}</option>
              <option value="full">{t("Full")}</option>
            </select>

            {hasFilters && (
              <button
                type="button"
                className="clear-filter-btn"
                onClick={clearFilters}
              >
                {t("Clear")}
              </button>
            )}
          </div>
        </div>
      </div>

      <QuickReservationCard reservation={upcomingReservation} />

      <VenueSection title={t("Cafes & Bars")} venues={grouped.cafe_bar} />

      <VenueSection title={t("Restaurants")} venues={grouped.restaurants} />

      <VenueSection title={t("Beach Bars")} venues={grouped.beach_bar} />

      <VenueSection title={t("Other Venues")} venues={grouped.other} />
    </div>
  );
}