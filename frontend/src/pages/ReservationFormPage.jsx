import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  getAccessToken,
  getWithAuth,
  patchWithAuth,
  postWithAuth,
} from "../utils/auth";
import "../styles/make_reservation.css";
import "../styles/edit_reservation.css";

const todayIso = () => new Date().toISOString().slice(0, 10);

const emptyForm = {
  firstname: "",
  lastname: "",
  email: "",
  phone: "",
  date: todayIso(),
  time: "",
  guests: 2,
  special_requests: "none",
  allergies: "",
  comments: "",
};

function getErrorMessage(data) {
  if (!data) {
    return "Could not save the reservation. Please check the details.";
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

  return "Could not save the reservation. Please check the details.";
}

export default function ReservationFormPage({ mode = "create" }) {
  const { venueId, reservationId } = useParams();
  const navigate = useNavigate();

  const [venue, setVenue] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [slots, setSlots] = useState([]);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      navigate(`/accounts/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }

    let cancelled = false;

    async function load() {
      if (mode === "edit") {
        const res = await getWithAuth(
          `/api/v1/reservations/${reservationId}/`,
          {},
          { onUnauthenticated: () => navigate("/accounts/login") }
        );

        if (!res || cancelled) return;

        const r = res.data;

        setForm({
          firstname: r.firstname || "",
          lastname: r.lastname || "",
          email: r.email || "",
          phone: r.phone || "",
          date: r.date || todayIso(),
          time: String(r.time || "").slice(0, 5),
          guests: r.guests || 2,
          special_requests: r.special_requests ? "other" : "none",
          allergies: r.allergies || "",
          comments: r.comments || "",
        });

        setVenue({
          id: r.venue_id,
          name: r.venue_name || `Venue #${r.venue_id}`,
        });
      } else {
        const res = await getWithAuth(
          `/api/v1/venues/${venueId}/`,
          {},
          { onUnauthenticated: () => navigate("/accounts/login") }
        );

        if (!res || cancelled) return;

        setVenue(res.data);
      }
    }

    load().catch(() => {
      if (!cancelled) {
        setMessage("Could not load reservation data.");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [mode, navigate, reservationId, venueId]);

  useEffect(() => {
    const id = mode === "edit" ? venue?.id : venueId;

    if (!id || !form.date) return;

    let cancelled = false;

    getWithAuth(
      `/api/v1/venues/${id}/slots/`,
      { params: { date: form.date } },
      { onUnauthenticated: () => navigate("/accounts/login") }
    )
      .then((res) => {
        if (!cancelled && res) {
          setSlots((res.data.slots || []).filter((slot) => slot.is_available));
        }
      })
      .catch(() => {
        if (!cancelled) setSlots([]);
      });

    return () => {
      cancelled = true;
    };
  }, [form.date, mode, navigate, venue?.id, venueId]);

  const updateField = (event) => {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  };

  const chooseSlot = (slot) => {
    setForm((current) => ({
      ...current,
      date: slot.slot_date,
      time: String(slot.time || "").slice(0, 5),
    }));
  };

  const submit = async (event) => {
    event.preventDefault();

    setSubmitting(true);
    setMessage("");

    const selectedSpecialRequest = form.special_requests;

    const basePayload = {
      firstname: form.firstname,
      lastname: form.lastname,
      email: form.email,
      phone: form.phone,
      date: form.date,
      time: String(form.time || "").slice(0, 5),
      guests: Number(form.guests),
      special_requests: selectedSpecialRequest !== "none",
      allergies: form.allergies,
      comments:
        selectedSpecialRequest !== "none"
          ? `Special request: ${selectedSpecialRequest}. ${form.comments || ""}`.trim()
          : form.comments,
    };

    const createPayload = {
      ...basePayload,
      venue_id: Number(venueId),
    };

    try {
      let res;

      if (mode === "edit") {
        res = await patchWithAuth(
          `/api/v1/reservations/${reservationId}/`,
          basePayload,
          {},
          { onUnauthenticated: () => navigate("/accounts/login") }
        );
      } else {
        res = await postWithAuth(
          "/api/v1/reservations/",
          createPayload,
          {},
          { onUnauthenticated: () => navigate("/accounts/login") }
        );
      }

      if (!res) return;

      navigate(
        mode === "edit"
          ? "/venues/my-reservations"
          : "/venues/reservation-pending"
      );
    } catch (err) {
      console.log("Reservation error:", err.response?.status, err.response?.data);

      const data = err.response?.data;

      if (typeof data === "string" && data.includes("<!doctype html>")) {
        setMessage("Server error while saving reservation. Check Django logs.");
      } else {
        setMessage(getErrorMessage(data));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      id="reservationForm"
      className={`reservation-form-page ${
        mode === "edit" ? "reservation-form-page-edit" : "reservation-form-page-create"
      }`}
    >
      <h2 className="text-2xl font-semibold mb-4">
        {mode === "edit" ? "Edit Reservation for" : "Reserve at"}{" "}
        {venue?.name || "..."}
      </h2>

      {message && <p className="auth-message error">{message}</p>}

      <form onSubmit={submit}>
        <p>
          <label>
            First name
            <input
              name="firstname"
              value={form.firstname}
              onChange={updateField}
              required
            />
          </label>
        </p>

        <p>
          <label>
            Last name
            <input
              name="lastname"
              value={form.lastname}
              onChange={updateField}
              required
            />
          </label>
        </p>

        <p>
          <label>
            Email
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={updateField}
              required
            />
          </label>
        </p>

        <p>
          <label>
            Phone
            <input
              name="phone"
              value={form.phone}
              onChange={updateField}
              required
            />
          </label>
        </p>

        <p>
          <label>
            Date
            <input
              name="date"
              type="date"
              min={todayIso()}
              value={form.date}
              onChange={updateField}
              required
            />
          </label>
        </p>

        <p>
          <label>
            Time
            <div className="venue-detail-slots time-slot-container">
              {slots.length ? (
                slots.map((slot) => (
                  <button
                    type="button"
                    key={`${slot.slot_date}-${slot.time}`}
                    className={
                      form.time === String(slot.time || "").slice(0, 5) &&
                      form.date === slot.slot_date
                        ? "active time-slot"
                        : "time-slot"
                    }
                    onClick={() => chooseSlot(slot)}
                  >
                    {String(slot.time || "").slice(0, 5)}
                    {slot.is_next_day ? " +1" : ""}
                  </button>
                ))
              ) : (
                <p>No available times for this date.</p>
              )}
            </div>
          </label>
        </p>

        <p>
          <label>
            Guests
            <input
              name="guests"
              min="1"
              type="number"
              value={form.guests}
              onChange={updateField}
              required
            />
          </label>
        </p>

        <p>
          <label>
            Special requests
            <select
              name="special_requests"
              value={form.special_requests}
              onChange={updateField}
            >
              <option value="none">None</option>
              <option value="vegan">Vegan</option>
              <option value="vegetarian">Vegetarian</option>
              <option value="gluten_free">Gluten-free</option>
              <option value="wheelchair">Wheelchair accessible</option>
              <option value="other">Other</option>
            </select>
          </label>
        </p>

        <p>
          <label>
            Allergies
            <textarea
              name="allergies"
              value={form.allergies}
              onChange={updateField}
            />
          </label>
        </p>

        <p>
          <label>
            Comments
            <textarea
              name="comments"
              value={form.comments}
              onChange={updateField}
            />
          </label>
        </p>

        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          disabled={submitting}
        >
          {submitting ? "Saving..." : mode === "edit" ? "Save Changes" : "Reserve"}
        </button>

        <button
          type="button"
          onClick={() =>
            navigate(
              mode === "edit" ? "/venues/my-reservations" : `/venues/${venueId}`
            )
          }
          className="text-blue-500 text-sm mt-4 inline-block"
        >
          {" "}
          Back
        </button>
      </form>
    </div>
  );
}