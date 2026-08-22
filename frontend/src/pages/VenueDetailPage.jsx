import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import axios from "axios";
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  ZoomControl,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { authHeaders, getAccessToken, postWithAuth } from "../utils/auth";
import { mediaUrl } from "../utils/media";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChair,
  faChevronLeft,
  faChevronRight,
  faClock,
  faComment,
  faLocationDot,
  faStar,
  faUser,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import "../styles/venue_detail.css";

const todayIso = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

function Gallery({ images, emptyText, onOpen }) {
  if (!images?.length) {
    return <p className="venue-detail-empty">{emptyText}</p>;
  }

  return (
    <div className="venue-detail-gallery">
      {images.map((image, index) => (
        <button
          className="venue-detail-gallery-button"
          key={image.id || image.url}
          type="button"
          onClick={() => onOpen(images, index)}
        >
          <img src={mediaUrl(image.url)} alt="" />
        </button>
      ))}
    </div>
  );
}

function MapPreview({ venue }) {
  const { t } = useTranslation();

  const lat = Number(venue.latitude);
  const lng = Number(venue.longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return (
      <p className="venue-detail-empty">
        {t("Map coordinates are not available yet.")}
      </p>
    );
  }

  const position = [lat, lng];

  const largerMapUrl =
    `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}` +
    `#map=16/${lat}/${lng}`;

  return (
    <div className="venue-detail-map-shell">
      <MapContainer
        key={`${lat}-${lng}`}
        center={position}
        zoom={15}
        scrollWheelZoom={false}
        zoomControl={false}
        className="venue-detail-map"
        aria-label={t("Venue map", { name: venue.name })}
      >
        <TileLayer
          attribution={
            '&copy; <a href="https://www.openstreetmap.org/copyright">' +
            'OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">' +
            "CARTO</a>"
          }
          maxZoom={20}
          subdomains="abcd"
          url={
            "https://{s}.basemaps.cartocdn.com/rastertiles/" +
            "voyager/{z}/{x}/{y}{r}.png"
          }
        />

        <ZoomControl position="topright" />

        <CircleMarker
          center={position}
          radius={10}
          pathOptions={{
            color: "#fff",
            fillColor: "#e63946",
            fillOpacity: 1,
            weight: 3,
          }}
        >
          <Popup>
            <strong>{venue.name}</strong>
            <br />
            {venue.location}
          </Popup>
        </CircleMarker>
      </MapContainer>

      <a
        className="venue-detail-map-link"
        href={largerMapUrl}
        target="_blank"
        rel="noreferrer"
      >
        {t("View larger map")}
      </a>
    </div>
  );
}

function Reviews({ reviews, onReviewSubmitted, venueId }) {
  const { t } = useTranslation();

  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState("");

  const submitReview = async (event) => {
    event.preventDefault();

    if (!rating) {
      setStatus(t("Please select a rating."));
      return;
    }

    try {
      const res = await axios.post(
        `/api/v1/venues/${venueId}/reviews/`,
        { rating: Number(rating), comment },
        { headers: authHeaders() }
      );

      onReviewSubmitted(res.data);
      setRating(0);
      setHoverRating(0);
      setComment("");
      setStatus(t("Your review has been submitted."));
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        setStatus(t("Log in before submitting a review."));
        return;
      }

      setStatus(t("Could not submit your review."));
    }
  };

  return (
    <>
      {reviews?.length ? (
        <div className="venue-detail-reviews">
          {reviews.map((review) => (
            <article className="venue-detail-review" key={review.id}>
              <strong>{review.username || t("Guest")}</strong>

              <div
                className="venue-detail-review-stars"
                aria-label={t("Rating out of 5", { rating: review.rating })}
              >
                {Array.from({ length: 5 }).map((_, index) => (
                  <FontAwesomeIcon
                    icon={faStar}
                    key={index}
                    className={index < review.rating ? "full" : "empty"}
                  />
                ))}
              </div>

              {review.comment && <p>{review.comment}</p>}
            </article>
          ))}
        </div>
      ) : (
        <p className="venue-detail-empty">{t("No reviews yet.")}</p>
      )}

      <form className="venue-detail-review-form" onSubmit={submitReview}>
        <h4>{t("Leave a Review")}</h4>

        <div className="venue-detail-rating-picker">
          <span className="venue-detail-rating-label">{t("Rating")}</span>

          <div
            className="venue-detail-rating-stars"
            role="radiogroup"
            aria-label={t("Select rating")}
            onMouseLeave={() => setHoverRating(0)}
          >
            {Array.from({ length: 5 }).map((_, index) => {
              const starValue = index + 1;
              const displayedRating = hoverRating || rating;

              return (
                <button
                  type="button"
                  key={starValue}
                  className={`venue-detail-star-button ${
                    starValue <= displayedRating ? "active" : ""
                  }`}
                  onMouseEnter={() => setHoverRating(starValue)}
                  onFocus={() => setHoverRating(starValue)}
                  onClick={() => setRating(starValue)}
                  aria-label={t("Select star rating", { count: starValue })}
                  aria-checked={rating === starValue}
                  role="radio"
                >
                  <FontAwesomeIcon icon={faStar} />
                </button>
              );
            })}
          </div>
        </div>

        <label>
          {t("Comment")}
          <textarea
            rows="4"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder={t("Share your experience...")}
          />
        </label>

        <button type="submit">{t("Submit Review")}</button>

        {status && <p className="venue-detail-status">{status}</p>}
      </form>
    </>
  );
}

function getReservationErrorMessage(data, t) {
  if (!data) {
    return t("Could not submit the reservation. Please check the details.");
  }

  if (typeof data === "string") {
    return data;
  }

  if (data.detail) {
    return data.detail;
  }

  if (data.non_field_errors?.length) {
    return data.non_field_errors[0];
  }

  const firstFieldError = Object.entries(data).find(([, value]) => {
    return Array.isArray(value) && value.length > 0;
  });

  if (firstFieldError) {
    const [field, value] = firstFieldError;
    return `${field}: ${value[0]}`;
  }

  return t("Could not submit the reservation. Please check the details.");
}

function ReservationCard({ venueId }) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const isLoggedIn = Boolean(getAccessToken());

  const loginPath = `/accounts/login?next=${encodeURIComponent(
    `${location.pathname}${location.search}`
  )}`;

  const [step, setStep] = useState(1);
  const [date, setDate] = useState(todayIso());
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [status, setStatus] = useState("");

  const [form, setForm] = useState({
    firstname: "",
    lastname: "",
    email: "",
    phone: "",
    guests: 2,
    special_requests: "none",
    allergies: "",
    comments: "",
  });

  useEffect(() => {
    if (!isLoggedIn) return;

    let cancelled = false;

    async function fetchSlots() {
      setSelectedSlot(null);

      try {
        const res = await axios.get(`/api/v1/venues/${venueId}/slots/`, {
          params: { date },
        });

        const now = new Date();
        const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(
          now.getMinutes()
        ).padStart(2, "0")}`;

        const available = (res.data.slots || []).filter((slot) => {
          if (!slot.is_available) return false;
          if (date !== todayIso()) return true;
          return slot.is_next_day || slot.time >= currentTime;
        });

        if (!cancelled) setSlots(available);
      } catch (err) {
        if (!cancelled) {
          setSlots([]);
          setStatus(t("Could not load available times."));
        }
      }
    }

    fetchSlots();

    return () => {
      cancelled = true;
    };
  }, [date, venueId, isLoggedIn, t]);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const submitReservation = async (event) => {
    event.preventDefault();

    if (!isLoggedIn) {
      setStatus(t("Log in before submitting a reservation."));
      return;
    }

    if (!selectedSlot) {
      setStatus(t("Choose an available time first."));
      return;
    }

    try {
      const res = await postWithAuth(
        "/api/v1/reservations/",
        {
          venue_id: Number(venueId),
          ...form,
          guests: Number(form.guests),
          special_requests: form.special_requests !== "none",
          comments:
            form.special_requests !== "none"
              ? `Special request: ${form.special_requests}. ${form.comments || ""}`.trim()
              : form.comments,
          date: selectedSlot.slot_date,
          time: String(selectedSlot.time || "").slice(0, 5),
        },
        {},
        {
          onUnauthenticated: () => {
            setStatus(t("Log in before submitting a reservation."));
          },
        }
      );

      if (!res) return;

      navigate("/venues/reservation-pending");
    } catch (err) {
      console.log("Reservation error:", err.response?.status, err.response?.data);

      setStatus(getReservationErrorMessage(err.response?.data, t));
    }
  };

  return (
    <aside className="venue-detail-reserve">
      <h3>{t("Reserve a Table")}</h3>

      {!isLoggedIn ? (
        <p className="venue-detail-login-message">
          <Link to={loginPath}>{t("Login")}</Link> {t("to make a reservation.")}
        </p>
      ) : (
        <form onSubmit={submitReservation}>
          <div className="venue-detail-step-tabs">
            {[faUser, faClock, faComment].map((icon, index) => {
              const stepNumber = index + 1;

              return (
                <button
                  className={step === stepNumber ? "active" : ""}
                  key={stepNumber}
                  type="button"
                  onClick={() => setStep(stepNumber)}
                  aria-label={t("Step number", { number: stepNumber })}
                >
                  <FontAwesomeIcon icon={icon} />
                </button>
              );
            })}
          </div>

          {step === 1 && (
            <section className="venue-detail-form-step">
              <h4>{t("Your Information")}</h4>

              <label>
                {t("First name")}
                <input
                  name="firstname"
                  value={form.firstname}
                  onChange={updateField}
                  required
                />
              </label>

              <label>
                {t("Last name")}
                <input
                  name="lastname"
                  value={form.lastname}
                  onChange={updateField}
                  required
                />
              </label>

              <label>
                {t("Email")}
                <input
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={updateField}
                  required
                />
              </label>

              <label>
                {t("Phone")}
                <input
                  name="phone"
                  value={form.phone}
                  onChange={updateField}
                  required
                />
              </label>

              <button type="button" onClick={() => setStep(2)}>
                {t("Next")}
              </button>
            </section>
          )}

          {step === 2 && (
            <section className="venue-detail-form-step">
              <h4>{t("Reservation Details")}</h4>

              <label>
                {t("Date")}
                <input
                  name="date"
                  type="date"
                  min={todayIso()}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>

              <div>
                <span className="venue-detail-label">{t("Time")}</span>

                <div className="venue-detail-slots">
                  {slots.length ? (
                    slots.map((slot) => (
                      <button
                        className={selectedSlot === slot ? "active" : ""}
                        key={`${slot.slot_date}-${slot.time}`}
                        type="button"
                        onClick={() => setSelectedSlot(slot)}
                      >
                        {slot.time}
                      </button>
                    ))
                  ) : (
                    <p>{t("No available times for this date.")}</p>
                  )}
                </div>
              </div>

              <label>
                {t("Number of guests")}
                <input
                  name="guests"
                  min="1"
                  type="number"
                  value={form.guests}
                  onChange={updateField}
                  required
                />
              </label>

              <div className="venue-detail-button-row">
                <button type="button" onClick={() => setStep(1)}>
                  {t("Back")}
                </button>

                <button type="button" onClick={() => setStep(3)}>
                  {t("Next")}
                </button>
              </div>
            </section>
          )}

          {step === 3 && (
            <section className="venue-detail-form-step">
              <h4>{t("Additional Notes")}</h4>

              <label>
                {t("Special requests")}
                <select
                  name="special_requests"
                  value={form.special_requests}
                  onChange={updateField}
                >
                  <option value="none">{t("None")}</option>
                  <option value="vegan">{t("Vegan")}</option>
                  <option value="vegetarian">{t("Vegetarian")}</option>
                  <option value="gluten_free">{t("Gluten-free")}</option>
                  <option value="wheelchair">{t("Wheelchair accessible")}</option>
                  <option value="other">{t("Other")}</option>
                </select>
              </label>

              <label>
                {t("Allergies")}
                <textarea
                  name="allergies"
                  rows="2"
                  value={form.allergies}
                  onChange={updateField}
                />
              </label>

              <label>
                {t("Comments")}
                <textarea
                  name="comments"
                  rows="2"
                  value={form.comments}
                  onChange={updateField}
                />
              </label>

              <div className="venue-detail-button-row">
                <button type="button" onClick={() => setStep(2)}>
                  {t("Back")}
                </button>

                <button type="submit">{t("Submit Reservation")}</button>
              </div>
            </section>
          )}

          {status && <p className="venue-detail-status">{status}</p>}
        </form>
      )}
    </aside>
  );
}

export default function VenueDetailPage() {
  const { t } = useTranslation();
  const { venueId } = useParams();

  const [venue, setVenue] = useState(null);
  const [activeTab, setActiveTab] = useState("about");
  const [modal, setModal] = useState({ images: [], index: -1 });

  useEffect(() => {
    let cancelled = false;

    async function fetchVenue() {
      const res = await axios.get(`/api/v1/venues/${venueId}/`);
      if (!cancelled) setVenue(res.data);
    }

    fetchVenue().catch(() => {
      if (!cancelled) setVenue(false);
    });

    return () => {
      cancelled = true;
    };
  }, [venueId]);

  const heroImage = mediaUrl(venue?.first_image);
  const modalImage = modal.index >= 0 ? modal.images[modal.index] : null;

  const tabs = useMemo(
    () => [
      ["about", t("About")],
      ["menu", t("Menu")],
      ["photos", t("Photos")],
      ["reviews", t("Reviews")],
    ],
    [t]
  );

  if (venue === false) {
    return (
      <div className="venue-detail-state">
        <p>{t("Venue not found.")}</p>
        <Link to="/">{t("Back to venues")}</Link>
      </div>
    );
  }

  if (!venue) {
    return <div className="venue-detail-state">{t("Loading venue...")}</div>;
  }

  const openModal = (images, index) => {
    setModal({ images, index });
  };

  const closeModal = () => {
    setModal({ images: [], index: -1 });
  };

  const moveModal = (delta) => {
    setModal((current) => ({
      ...current,
      index: (current.index + delta + current.images.length) % current.images.length,
    }));
  };

  const handleReviewSubmitted = (review) => {
    setVenue((current) => {
      const reviews = current.reviews || [];
      const withoutCurrentUserReview = reviews.filter((item) => item.id !== review.id);

      return {
        ...current,
        reviews: [review, ...withoutCurrentUserReview],
      };
    });
  };

  return (
    <div className="venue-detail">
      <section
        className="venue-detail-hero"
        style={heroImage ? { backgroundImage: `url("${heroImage}")` } : undefined}
      >
        <div className="venue-detail-hero-overlay" />

        <div className="venue-detail-hero-title">
          <h1>{venue.name}</h1>

          <p>
            <FontAwesomeIcon icon={faLocationDot} />
            {venue.location}
          </p>
        </div>
      </section>

      <div className="venue-detail-layout">
        <section>
          <div className="venue-detail-tabs">
            {tabs.map(([id, label]) => (
              <button
                className={activeTab === id ? "active" : ""}
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {activeTab === "about" && (
            <article className="venue-detail-panel">
              <div className="venue-detail-summary">
                <span className={venue.is_full ? "full" : "available"}>
                  <FontAwesomeIcon icon={faChair} />
                  {venue.is_full ? t("Full") : t("Available")}
                </span>

                {venue.average_rating > 0 && (
                  <span>
                    <FontAwesomeIcon icon={faStar} />
                    {Number(venue.average_rating).toFixed(1)}
                  </span>
                )}
              </div>

              <p className="venue-detail-description">
                {venue.description || t("This venue has not added a description yet.")}
              </p>

              <h3>{t("Location")}</h3>
              <MapPreview venue={venue} />
            </article>
          )}

          {activeTab === "menu" && (
            <article className="venue-detail-panel">
              <h3>{t("Menu")}</h3>

              <Gallery
                images={venue.menu_images}
                emptyText={t("This venue has not added a menu yet.")}
                onOpen={openModal}
              />
            </article>
          )}

          {activeTab === "photos" && (
            <article className="venue-detail-panel">
              <h3>{t("Photos")}</h3>

              <Gallery
                images={venue.images}
                emptyText={t("No photos available.")}
                onOpen={openModal}
              />
            </article>
          )}

          {activeTab === "reviews" && (
            <article className="venue-detail-panel">
              <h3>{t("Reviews")}</h3>

              <Reviews
                reviews={venue.reviews}
                venueId={venue.id}
                onReviewSubmitted={handleReviewSubmitted}
              />
            </article>
          )}
        </section>

        <ReservationCard venueId={venue.id} />
      </div>

      {modalImage && (
        <div className="venue-detail-modal" onClick={closeModal} role="presentation">
          <button
            className="venue-detail-modal-close"
            type="button"
            onClick={closeModal}
            aria-label={t("Close")}
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>

          <button
            className="venue-detail-modal-nav prev"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              moveModal(-1);
            }}
            aria-label={t("Previous")}
          >
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>

          <img
            src={mediaUrl(modalImage.url)}
            alt=""
            onClick={(event) => event.stopPropagation()}
          />

          <button
            className="venue-detail-modal-nav next"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              moveModal(1);
            }}
            aria-label={t("Next")}
          >
            <FontAwesomeIcon icon={faChevronRight} />
          </button>
        </div>
      )}
    </div>
  );
}