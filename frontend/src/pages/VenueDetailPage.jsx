import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
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

const authHeaders = () => {
  const token = localStorage.getItem("access") || localStorage.getItem("access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
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
          <img src={image.url} alt="" />
        </button>
      ))}
    </div>
  );
}

function MapPreview({ venue }) {
  const lat = Number(venue.latitude);
  const lng = Number(venue.longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return <p className="venue-detail-empty">Map coordinates are not available yet.</p>;
  }

  const delta = 0.006;
  const bbox = [lng - delta, lat - delta, lng + delta, lat + delta].join(",");
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;

  return (
    <iframe
      className="venue-detail-map"
      title={`${venue.name} map`}
      src={src}
      loading="lazy"
    />
  );
}

function Reviews({ reviews, onReviewSubmitted, venueId }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState("");

  const submitReview = async (event) => {
    event.preventDefault();
    try {
      const res = await axios.post(
        `/api/v1/venues/${venueId}/reviews/`,
        { rating: Number(rating), comment },
        { headers: authHeaders() },
      );
      onReviewSubmitted(res.data);
      setComment("");
      setStatus("Your review has been submitted.");
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        setStatus("Log in before submitting a review.");
        return;
      }
      setStatus("Could not submit your review.");
    }
  };

  return (
    <>
      {reviews?.length ? (
        <div className="venue-detail-reviews">
          {reviews.map((review) => (
            <article className="venue-detail-review" key={review.id}>
              <strong>{review.username || "Guest"}</strong>
              <div className="venue-detail-review-stars" aria-label={`${review.rating} out of 5`}>
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
        <p className="venue-detail-empty">No reviews yet.</p>
      )}

      <form className="venue-detail-review-form" onSubmit={submitReview}>
        <h4>Leave a Review</h4>
        <label>
          Rating
          <select value={rating} onChange={(event) => setRating(event.target.value)} required>
            <option value="5">5 stars</option>
            <option value="4">4 stars</option>
            <option value="3">3 stars</option>
            <option value="2">2 stars</option>
            <option value="1">1 star</option>
          </select>
        </label>
        <label>
          Comment
          <textarea
            rows="4"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Share your experience..."
          />
        </label>
        <button type="submit">Submit Review</button>
        {status && <p className="venue-detail-status">{status}</p>}
      </form>
    </>
  );
}

function ReservationCard({ venueId }) {
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
    let cancelled = false;

    async function fetchSlots() {
      setSelectedSlot(null);
      try {
        const res = await axios.get(`/api/v1/venues/${venueId}/slots/`, {
          params: { date },
        });
        const now = new Date();
        const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(
          now.getMinutes(),
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
          setStatus("Could not load available times.");
        }
      }
    }

    fetchSlots();
    return () => {
      cancelled = true;
    };
  }, [date, venueId]);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const submitReservation = async (event) => {
    event.preventDefault();
    if (!selectedSlot) {
      setStatus("Choose an available time first.");
      return;
    }

    try {
      await axios.post(
        "/api/v1/reservations/",
        {
          venue_id: Number(venueId),
          ...form,
          guests: Number(form.guests),
          date: selectedSlot.slot_date,
          time: selectedSlot.time,
        },
        { headers: authHeaders() },
      );
      setStatus("Reservation submitted. Await confirmation.");
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        setStatus("Log in before submitting a reservation.");
        return;
      }
      setStatus("Could not submit the reservation. Please check the details.");
    }
  };

  return (
    <aside className="venue-detail-reserve">
      <h3>Reserve a Table</h3>
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
                aria-label={`Step ${stepNumber}`}
              >
                <FontAwesomeIcon icon={icon} />
              </button>
            );
          })}
        </div>

        {step === 1 && (
          <section className="venue-detail-form-step">
            <h4>Your Information</h4>
            <label>
              First name
              <input name="firstname" value={form.firstname} onChange={updateField} required />
            </label>
            <label>
              Last name
              <input name="lastname" value={form.lastname} onChange={updateField} required />
            </label>
            <label>
              Email
              <input name="email" type="email" value={form.email} onChange={updateField} required />
            </label>
            <label>
              Phone
              <input name="phone" value={form.phone} onChange={updateField} required />
            </label>
            <button type="button" onClick={() => setStep(2)}>
              Next
            </button>
          </section>
        )}

        {step === 2 && (
          <section className="venue-detail-form-step">
            <h4>Reservation Details</h4>
            <label>
              Date
              <input name="date" type="date" min={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <div>
              <span className="venue-detail-label">Time</span>
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
                      {slot.is_next_day ? " +1" : ""}
                    </button>
                  ))
                ) : (
                  <p>No available times for this date.</p>
                )}
              </div>
            </div>
            <label>
              Number of guests
              <input name="guests" min="1" type="number" value={form.guests} onChange={updateField} required />
            </label>
            <div className="venue-detail-button-row">
              <button type="button" onClick={() => setStep(1)}>
                Back
              </button>
              <button type="button" onClick={() => setStep(3)}>
                Next
              </button>
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="venue-detail-form-step">
            <h4>Additional Notes</h4>
            <label>
              Special requests
              <select name="special_requests" value={form.special_requests} onChange={updateField}>
                <option value="none">None</option>
                <option value="vegan">Vegan</option>
                <option value="vegetarian">Vegetarian</option>
                <option value="gluten_free">Gluten-free</option>
                <option value="wheelchair">Wheelchair accessible</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              Allergies
              <textarea name="allergies" rows="2" value={form.allergies} onChange={updateField} />
            </label>
            <label>
              Comments
              <textarea name="comments" rows="2" value={form.comments} onChange={updateField} />
            </label>
            <div className="venue-detail-button-row">
              <button type="button" onClick={() => setStep(2)}>
                Back
              </button>
              <button type="submit">Submit Reservation</button>
            </div>
          </section>
        )}

        {status && <p className="venue-detail-status">{status}</p>}
      </form>
    </aside>
  );
}

export default function VenueDetailPage() {
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

  const heroImage = venue?.first_image;
  const modalImage = modal.index >= 0 ? modal.images[modal.index] : null;
  const tabs = useMemo(
    () => [
      ["about", "About"],
      ["menu", "Menu"],
      ["photos", "Photos"],
      ["reviews", "Reviews"],
    ],
    [],
  );

  if (venue === false) {
    return (
      <div className="venue-detail-state">
        <p>Venue not found.</p>
        <Link to="/">Back to venues</Link>
      </div>
    );
  }

  if (!venue) {
    return <div className="venue-detail-state">Loading venue...</div>;
  }

  const openModal = (images, index) => setModal({ images, index });
  const closeModal = () => setModal({ images: [], index: -1 });
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
      return { ...current, reviews: [review, ...withoutCurrentUserReview] };
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
                  {venue.is_full ? "Full" : "Available"}
                </span>
                {venue.average_rating > 0 && (
                  <span>
                    <FontAwesomeIcon icon={faStar} />
                    {Number(venue.average_rating).toFixed(1)}
                  </span>
                )}
              </div>
              <p className="venue-detail-description">
                {venue.description || "This venue has not added a description yet."}
              </p>
              <h3>Location</h3>
              <MapPreview venue={venue} />
            </article>
          )}

          {activeTab === "menu" && (
            <article className="venue-detail-panel">
              <h3>Menu</h3>
              <Gallery
                images={venue.menu_images}
                emptyText="This venue has not added a menu yet."
                onOpen={openModal}
              />
            </article>
          )}

          {activeTab === "photos" && (
            <article className="venue-detail-panel">
              <h3>Photos</h3>
              <Gallery
                images={venue.images}
                emptyText="No photos available."
                onOpen={openModal}
              />
            </article>
          )}

          {activeTab === "reviews" && (
            <article className="venue-detail-panel">
              <h3>Reviews</h3>
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
          <button className="venue-detail-modal-close" type="button" onClick={closeModal} aria-label="Close">
            <FontAwesomeIcon icon={faXmark} />
          </button>
          <button
            className="venue-detail-modal-nav prev"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              moveModal(-1);
            }}
            aria-label="Previous"
          >
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>
          <img src={modalImage.url} alt="" onClick={(event) => event.stopPropagation()} />
          <button
            className="venue-detail-modal-nav next"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              moveModal(1);
            }}
            aria-label="Next"
          >
            <FontAwesomeIcon icon={faChevronRight} />
          </button>
        </div>
      )}
    </div>
  );
}
