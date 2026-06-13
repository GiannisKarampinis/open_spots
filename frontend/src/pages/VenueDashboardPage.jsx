import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendarDays } from "@fortawesome/free-solid-svg-icons";
import axios from "axios";
import "../styles/venue_dashboard.css";

const tabs = [
  ["requests", "Reservation Requests & Guest Arrivals"],
  ["history", "Reservation History"],
  ["analytics-tab", "Analytics"],
  ["manage-venue", "Manage Venue"],
];

const venueTypes = [
  ["restaurant", "Restaurant"],
  ["cafe", "Cafe"],
  ["bar", "Bar"],
  ["beach_bar", "Beach Bar"],
  ["other", "Other"],
];

function authHeaders() {
  const token = localStorage.getItem("access") || localStorage.getItem("access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function statusClass(status) {
  if (status === "pending") return "bg-warning text-dark";
  if (status === "accepted" || status === "checked_in") return "bg-success";
  return "bg-danger";
}

function titleStatus(status) {
  if (!status) return "-";
  return status.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function formatTime(value) {
  if (!value) return "-";
  const [hour, minute] = value.split(":");
  const date = new Date();
  date.setHours(Number(hour), Number(minute), 0, 0);
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

function isWithinDateRange(value, range) {
  if (!value) return false;
  if (!range?.start && !range?.end) return true;
  if (range.start && value < range.start) return false;
  if (range.end && value > range.end) return false;
  return true;
}

function DateRangePickerShell({ targetTab, value, onChange, onClear }) {
  return (
    <div id={`date-range-component-${targetTab}`} className="date-range-container">
      <FontAwesomeIcon icon={faCalendarDays} className="calendar-icon" aria-hidden="true" />
      <input
        id={`daterange-start-${targetTab}`}
        className="form-control daterange-input"
        aria-label="Start date"
        type="date"
        value={value.start}
        max={value.end || undefined}
        onChange={(event) => onChange({ ...value, start: event.target.value })}
      />
      <span className="date-range-separator">to</span>
      <input
        id={`daterange-end-${targetTab}`}
        className="form-control daterange-input"
        aria-label="End date"
        type="date"
        value={value.end}
        min={value.start || undefined}
        onChange={(event) => onChange({ ...value, end: event.target.value })}
      />
      <button type="button" className="btn btn-sm btn-outline-secondary clear-range-btn" title="Clear date range" onClick={onClear}>
        x
      </button>
    </div>
  );
}

function ReservationStatusBadge({ value }) {
  return <span className={`badge ${statusClass(value)}`}>{titleStatus(value)}</span>;
}

function ReservationRow({ reservation, kind, onDetails, onAction }) {
  const arrivalStatus = reservation.status === "rejected" || reservation.status === "cancelled"
    ? reservation.status
    : reservation.arrival_status;

  return (
    <tr
      id={`reservation-row-${reservation.id}`}
      data-reservation-id={reservation.id}
      data-seen={reservation.seen ? "true" : "false"}
      className={!reservation.seen && kind === "requests" ? "unseen-reservation" : ""}
      onClick={() => onDetails(reservation)}
    >
      <td>{reservation.customer_name}</td>
      <td data-order={reservation.date}>{formatDate(reservation.date)}</td>
      <td data-order={reservation.time}>{formatTime(reservation.time)}</td>
      <td>{reservation.guests}</td>

      {kind === "requests" && (
        <td>
          <button
            type="button"
            className="btn btn-sm btn-toggle-seen"
            onClick={(event) => {
              event.stopPropagation();
              onAction("seen", reservation, reservation.seen ? "unseen" : "seen");
            }}
          >
            {reservation.seen ? "Seen" : "Unseen"}
          </button>
        </td>
      )}

      <td>
        <ReservationStatusBadge value={kind === "arrivals" ? arrivalStatus : reservation.status} />
      </td>

      {kind !== "history" && (
        <td>
          {kind === "requests" && reservation.status === "pending" && (
            <>
              <button type="button" className="btn btn-success btn-sm me-1" onClick={(event) => {
                event.stopPropagation();
                onAction("status", reservation, "accepted");
              }}>
                Accept
              </button>
              <button type="button" className="btn btn-danger btn-sm" onClick={(event) => {
                event.stopPropagation();
                onAction("status", reservation, "rejected");
              }}>
                Reject
              </button>
            </>
          )}

          {kind === "arrivals" && (
            <>
              {reservation.status === "accepted" && reservation.arrival_status === "pending" && (
                <>
                  <button type="button" className="btn btn-success btn-sm me-1" onClick={(event) => {
                    event.stopPropagation();
                    onAction("arrival", reservation, "checked_in");
                  }}>
                    Checked in
                  </button>
                  <button type="button" className="btn btn-danger btn-sm" onClick={(event) => {
                    event.stopPropagation();
                    onAction("arrival", reservation, "no_show");
                  }}>
                    No show
                  </button>
                </>
              )}
              <button type="button" className="btn btn-sm btn-edit-status" onClick={(event) => {
                event.stopPropagation();
                onAction("move", reservation);
              }}>
                Move to Requests
              </button>
            </>
          )}
        </td>
      )}
    </tr>
  );
}

function ReservationsTable({ id, rows, kind, onDetails, onAction }) {
  const includeSeen = kind === "requests";
  const includeAction = kind !== "history";

  return (
    <div className="table-responsive">
      <div className="datatable-controls d-flex justify-content-between mb-2">
        <div id={`${id.replace("Table", "")}-show-entries-wrapper`}></div>
        <div id={`${id.replace("Table", "")}-search-wrapper`}></div>
      </div>
      <table id={id} className="table table-striped table-hover shadow-sm">
        <thead className="table-dark">
          <tr>
            <th>Customer</th>
            <th>Date</th>
            <th>Time</th>
            <th>Guests</th>
            {includeSeen && <th>Seen</th>}
            <th>Status</th>
            {includeAction && <th>Action</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((reservation) => (
            <ReservationRow
              key={reservation.id}
              reservation={reservation}
              kind={kind}
              onDetails={onDetails}
              onAction={onAction}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AnalyticsTab({ analytics, grouping, onGroupingChange }) {
  const stats = analytics || {};

  return (
    <div className="analytics-container">
      <form id="analyticsForm" className="d-flex justify-content-center mb-4" role="search">
        <label htmlFor="group" className="me-2 fs-5">Group by:</label>
        <select name="group" id="group" className="form-select w-auto" value={grouping} onChange={onGroupingChange}>
          <option value="daily">Daily (Last 30 days)</option>
          <option value="weekly">Weekly (Last 12 weeks)</option>
          <option value="monthly">Monthly (Last 12 months)</option>
          <option value="yearly">Yearly (Last 3 years)</option>
        </select>
      </form>

      <div id="analytics-stats" className="d-flex justify-content-around flex-wrap mb-4">
        <div className="stat-card text-center p-3 shadow-sm rounded">
          <div className="stat-value fs-3 fw-bold">{stats.total_visits ?? 0}</div>
          <div className="stat-label text-muted">Total Visits</div>
        </div>
        <div className="stat-card text-center p-3 shadow-sm rounded">
          <div className="stat-value fs-3 fw-bold">{stats.avg_daily_visits ?? 0}</div>
          <div className="stat-label text-muted">Avg Daily Visits</div>
        </div>
        <div className="stat-card text-center p-3 shadow-sm rounded">
          <div className="stat-value fs-3 fw-bold">{stats.peak_visits ?? 0}</div>
          <div className="stat-label text-muted">Peak Daily Visits {titleStatus(grouping)}</div>
        </div>
        <div className="stat-card text-center p-3 shadow-sm rounded">
          <div className="stat-value fs-3 fw-bold">{stats.total_reservations ?? 0}</div>
          <div className="stat-label text-muted">Total Reservations</div>
        </div>
      </div>

      <div id="analytics-chart" className="react-analytics-chart">
        <div className="react-chart-placeholder">
          Analytics chart data is loaded for {titleStatus(grouping)}.
        </div>
      </div>
    </div>
  );
}

function ImagePreviewStrip({ title, images, newFiles, onFiles, onRemoveExisting, onRemoveNew }) {
  return (
    <div className="file-upload-group">
      <div className="file-preview">
        {images?.length || newFiles?.length ? (
          <>
        {images.map((image, index) => (
          <div className={`thumb-wrapper ${index === 0 ? "profile" : ""}`} key={image.id}>
            {index === 0 && <span className="profile-label">Profile</span>}
            <img src={image.url} width="80" alt={title} />
            <button type="button" className="remove-btn" onClick={() => onRemoveExisting(image.id)}>x</button>
          </div>
        ))}
        {newFiles.map((file, index) => (
          <div className="thumb-wrapper" key={`${file.name}-${file.lastModified}`}>
            <img src={URL.createObjectURL(file)} width="80" alt={file.name} />
            <button type="button" className="remove-btn" onClick={() => onRemoveNew(index)}>x</button>
          </div>
        ))}
          </>
        ) : <span className="no-files-msg">No files selected</span>}
      </div>
      <label className="custom-file-btn">
        {title}
        <input type="file" multiple hidden accept="image/*" onChange={onFiles} />
      </label>
    </div>
  );
}

function snapTime(value) {
  if (!value) return "";
  const [hours, minutes] = value.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return value;
  const total = (Math.round((hours * 60 + minutes) / 30) * 30 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function ManageVenueTab({ venue, workingDays, onSubmit, saving }) {
  const [form, setForm] = useState({
    name: "",
    kind: "other",
    location: "",
    description: "",
    email: "",
    phone: "",
  });
  const [days, setDays] = useState([]);
  const [venueImages, setVenueImages] = useState([]);
  const [menuImages, setMenuImages] = useState([]);
  const [newVenueImages, setNewVenueImages] = useState([]);
  const [newMenuImages, setNewMenuImages] = useState([]);

  useEffect(() => {
    setForm({
      name: venue.name || "",
      kind: venue.kind || "other",
      location: venue.location || "",
      description: venue.description || "",
      email: venue.email || "",
      phone: venue.phone || "",
    });
    setVenueImages(venue.images || []);
    setMenuImages(venue.menu_images || []);
  }, [venue]);

  useEffect(() => {
    setDays(workingDays || []);
  }, [workingDays]);

  const updateForm = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const updateDay = (weekday, patch) => {
    setDays((current) => current.map((day) => {
      if (day.weekday !== weekday) return day;
      const next = { ...day, ...patch };
      if (patch.open_time || patch.close_time) {
        next.closes_next_day = Boolean(next.open_time && next.close_time && next.close_time < next.open_time);
      }
      if (patch.is_closed) {
        next.open_time = "";
        next.close_time = "";
        next.closes_next_day = false;
      }
      return next;
    }));
  };

  const submit = (event) => {
    event.preventDefault();
    onSubmit({
      form,
      workingDays: days,
      venueImages,
      menuImages,
      newVenueImages,
      newMenuImages,
    });
  };

  return (
    <div className="container mt-5" id="manage-venue-form">
      <form className="venue-form-card" onSubmit={submit}>
        <div className="section-card mb-4 sensitive-contact-section">
          <div className="section-header">
            <h5 className="mb-0">Sensitive & Contact Information</h5>
          </div>
          <div className="section-body show">
            <div className="grid">
              <div>
                <label htmlFor="name">Venue Name</label>
                <input type="text" id="name" value={form.name} onChange={(event) => updateForm("name", event.target.value)} className="form-input" required />
              </div>
              <div>
                <label htmlFor="kind">Type</label>
                <select id="kind" value={form.kind} onChange={(event) => updateForm("kind", event.target.value)} className="form-input">
                  {venueTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="location">Location</label>
              <input type="text" id="location" value={form.location} onChange={(event) => updateForm("location", event.target.value)} className="form-input" required />
            </div>

            <div>
              <label htmlFor="description">Description</label>
              <textarea id="description" rows="4" value={form.description} onChange={(event) => updateForm("description", event.target.value)} className="form-input"></textarea>
            </div>

            <div className="grid">
              <div>
                <label htmlFor="email">Email</label>
                <input type="email" id="email" value={form.email} onChange={(event) => updateForm("email", event.target.value)} className="form-input" />
              </div>
              <div>
                <label htmlFor="phone">Phone</label>
                <input type="text" id="phone" value={form.phone} onChange={(event) => updateForm("phone", event.target.value)} className="form-input" />
              </div>
            </div>

            <ImagePreviewStrip
              title="Upload Venue Images"
              images={venueImages}
              newFiles={newVenueImages}
              onFiles={(event) => setNewVenueImages((current) => [...current, ...Array.from(event.target.files || [])])}
              onRemoveExisting={(id) => setVenueImages((current) => current.filter((image) => image.id !== id))}
              onRemoveNew={(index) => setNewVenueImages((current) => current.filter((_, itemIndex) => itemIndex !== index))}
            />
            <ImagePreviewStrip
              title="Upload Menu Images"
              images={menuImages}
              newFiles={newMenuImages}
              onFiles={(event) => setNewMenuImages((current) => [...current, ...Array.from(event.target.files || [])])}
              onRemoveExisting={(id) => setMenuImages((current) => current.filter((image) => image.id !== id))}
              onRemoveNew={(index) => setNewMenuImages((current) => current.filter((_, itemIndex) => itemIndex !== index))}
            />
          </div>
        </div>

        <div className="section-card mb-4">
          <div className="section-header">
            <h5 className="mb-0">Time Schedule Management</h5>
          </div>
          <div className="section-body show">
            <table className="working-hours-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Closed</th>
                  <th>Opens</th>
                  <th>Closes</th>
                </tr>
              </thead>
              <tbody>
                {days.map((day) => (
                  <tr key={day.id || day.weekday}>
                    <td>{day.weekday_display}</td>
                    <td><input type="checkbox" checked={day.is_closed} onChange={(event) => updateDay(day.weekday, { is_closed: event.target.checked })} /></td>
                    <td><input type="time" step="1800" value={day.open_time || ""} disabled={day.is_closed} onChange={(event) => updateDay(day.weekday, { open_time: snapTime(event.target.value) })} /></td>
                    <td className="close-cell">
                      <input type="time" step="1800" value={day.close_time || ""} disabled={day.is_closed} onChange={(event) => updateDay(day.weekday, { close_time: snapTime(event.target.value) })} />
                      <span className={`next-day-label ${!day.closes_next_day ? "is-hidden" : ""}`}> (+1 day)</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <button type="submit" className="btn-edit-status" disabled={saving}>
          {saving ? "Saving..." : "Submit for Approval"}
        </button>
      </form>
    </div>
  );
}

function ReservationDetailsModal({ reservation, onClose }) {
  if (!reservation) return null;

  const status = reservation.arrival_status && reservation.arrival_status !== "pending"
    ? reservation.arrival_status
    : reservation.status;

  const detailRows = [
    ["Customer", reservation.customer_name],
    ["Date", formatDate(reservation.date)],
    ["Time", formatTime(reservation.time)],
    ["Guests", reservation.guests],
    ["Status", titleStatus(status)],
    ["Email", reservation.email],
    ["Phone", reservation.phone],
    ["Special Requests", reservation.special_requests],
    ["Allergies", reservation.allergies],
    ["Comments", reservation.comments],
  ];

  return (
    <div className="modal-backdrop show" onClick={onClose}>
      <div id="reservationDetailsModal" className="modal fade show" onClick={(event) => event.stopPropagation()}>
        <div className="modal-dialog modal-dialog-centered">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">Reservation Details</h5>
              <button type="button" className="btn-close" onClick={onClose} aria-label="Close"></button>
            </div>
            <div className="modal-body">
              {detailRows.map(([label, value]) => (
                <p key={label}><strong>{label}:</strong> <span>{value || "-"}</span></p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VenueDashboardPage() {
  const { venueId } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("requests");
  const [dashboard, setDashboard] = useState(null);
  const [grouping, setGrouping] = useState("daily");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [dateRanges, setDateRanges] = useState({
    requests: { start: "", end: "" },
    history: { start: "", end: "" },
  });

  useEffect(() => {
    const href = "/static/venues/venue_dashboard.css";
    if (document.querySelector(`link[href="${href}"]`)) return undefined;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);

    return () => {
      link.remove();
    };
  }, []);

  const fetchDashboard = async (group = grouping) => {
    const token = authHeaders().Authorization;
    if (!token) {
      navigate("/accounts/login");
      return;
    }

    try {
      const res = await axios.get(`/api/v1/venues/${venueId}/dashboard/`, {
        params: { group },
        headers: authHeaders(),
        withCredentials: true,
      });
      setDashboard(res.data);
      setMessage("");
    } catch (err) {
      setMessage(err.response?.data?.detail || "Could not load the venue dashboard.");
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, [venueId]);

  const venue = dashboard?.venue || {};
  const notificationCount = useMemo(
    () => (dashboard?.upcoming_reservations || []).filter((reservation) => !reservation.seen).length,
    [dashboard]
  );
  const filteredUpcomingReservations = useMemo(
    () => (dashboard?.upcoming_reservations || []).filter((reservation) => isWithinDateRange(reservation.date, dateRanges.requests)),
    [dashboard, dateRanges.requests]
  );
  const filteredArrivals = useMemo(
    () => (dashboard?.arrivals || []).filter((reservation) => isWithinDateRange(reservation.date, dateRanges.requests)),
    [dashboard, dateRanges.requests]
  );
  const filteredPastReservations = useMemo(
    () => (dashboard?.past_reservations || []).filter((reservation) => isWithinDateRange(reservation.date, dateRanges.history)),
    [dashboard, dateRanges.history]
  );

  const updateDateRange = (key, range) => {
    setDateRanges((current) => ({
      ...current,
      [key]: range,
    }));
  };

  const clearDateRange = (key) => {
    updateDateRange(key, { start: "", end: "" });
  };

  const action = async (kind, reservation, value) => {
    const endpoints = {
      status: [`/api/v1/reservations/${reservation.id}/status/`, { status: value }],
      arrival: [`/api/v1/reservations/${reservation.id}/arrival/`, { arrival_status: value }],
      seen: [`/api/v1/reservations/${reservation.id}/seen/`, { state: value }],
      move: [`/api/v1/reservations/${reservation.id}/move-to-requests/`, {}],
    };

    const [url, payload] = endpoints[kind];
    try {
      await axios.post(url, payload, { headers: authHeaders(), withCredentials: true });
      fetchDashboard();
    } catch (err) {
      setMessage(err.response?.data?.detail || "Could not update the reservation.");
    }
  };

  const toggleAvailability = async () => {
    try {
      const res = await axios.post(`/api/v1/venues/${venueId}/toggle-full/`, {}, {
        headers: authHeaders(),
        withCredentials: true,
      });
      setDashboard((current) => ({
        ...current,
        venue: { ...current.venue, is_full: res.data.is_full },
      }));
      setMessage(res.data.is_full ? "Venue marked as full." : "Venue marked as available.");
    } catch (err) {
      setMessage(err.response?.data?.detail || "Could not update venue availability.");
    }
  };

  const submitVenueUpdate = async ({ form, workingDays, venueImages, menuImages, newVenueImages, newMenuImages }) => {
    setSaving(true);
    setMessage("");

    const formData = new FormData();
    Object.entries(form).forEach(([key, value]) => {
      formData.append(key, value ?? "");
    });
    formData.append("visible_venue_image_ids", [
      ...venueImages.map((image) => String(image.id)),
      ...newVenueImages.map((_, index) => `new-${index}`),
    ].join(","));
    formData.append("visible_menu_image_ids", [
      ...menuImages.map((image) => String(image.id)),
      ...newMenuImages.map((_, index) => `new-${index}`),
    ].join(","));
    newVenueImages.forEach((file) => formData.append("venue_images", file));
    newMenuImages.forEach((file) => formData.append("menu_images", file));

    try {
      const updateRes = await axios.post(`/api/v1/venues/${venueId}/submit-update/`, formData, {
        headers: authHeaders(),
        withCredentials: true,
      });
      const hoursRes = await axios.post(`/api/v1/venues/${venueId}/working-hours/`, {
        working_days: workingDays.map((day) => ({
          weekday: day.weekday,
          is_closed: day.is_closed,
          open_time: day.open_time,
          close_time: day.close_time,
          closes_next_day: day.closes_next_day,
        })),
      }, {
        headers: authHeaders(),
        withCredentials: true,
      });
      setDashboard((current) => ({
        ...current,
        venue: updateRes.data.venue || current.venue,
        working_days: hoursRes.data.working_days || current.working_days,
      }));
      setMessage(updateRes.data.detail || "Venue details saved.");
      fetchDashboard();
    } catch (err) {
      const data = err.response?.data;
      setMessage(data?.detail || data?.non_field_errors?.[0] || "Could not save venue details.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container mt-5" id="venue-dashboard" data-venue-id={venueId}>
      {message && <div className="alert-info">{message}</div>}

      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="fw-bold">{venue.name || "Venue Dashboard"}</h1>
        <div className="venue-status-toggle">
          {venue.is_full ? (
            <>
              <span className="badge bg-danger me-2">Full</span>
              <button type="button" className="btn btn-outline-success btn-sm mark-availability" onClick={toggleAvailability}>
                Mark as Available
              </button>
            </>
          ) : (
            <>
              <span className="badge bg-success me-2">Available</span>
              <button type="button" className="btn btn-outline-danger btn-sm mark-availability" onClick={toggleAvailability}>
                Mark as Full
              </button>
            </>
          )}
        </div>
      </div>

      <div className="tabs">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={activeTab === id ? "active d-flex align-items-center gap-1" : ""}
            data-tab={id.replace("-tab", "")}
            onClick={() => setActiveTab(id)}
          >
            {label}
            {id === "requests" && (
              <span id="notification-container" className="position-relative ms-2">
                <span id="notification-badge" className="position-absolute badge rounded-pill bg-danger" style={{ display: notificationCount ? "inline-block" : "none" }}>
                  {notificationCount}
                </span>
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="tab-content">
        <div id="requests" className={activeTab === "requests" ? "active" : ""}>
          <DateRangePickerShell
            targetTab="requestsTab"
            value={dateRanges.requests}
            onChange={(range) => updateDateRange("requests", range)}
            onClear={() => clearDateRange("requests")}
          />
          <h2 className="mt-4">Pending Reservation Requests</h2>
          <ReservationsTable id="upcomingTable" rows={filteredUpcomingReservations} kind="requests" onDetails={setSelectedReservation} onAction={action} />

          <h2 className="mt-5">Guest Arrivals & Cancellations</h2>
          <ReservationsTable id="specialTable" rows={filteredArrivals} kind="arrivals" onDetails={setSelectedReservation} onAction={action} />
        </div>

        <div id="history" className={activeTab === "history" ? "active" : ""}>
          <DateRangePickerShell
            targetTab="historyTab"
            value={dateRanges.history}
            onChange={(range) => updateDateRange("history", range)}
            onClear={() => clearDateRange("history")}
          />
          <ReservationsTable id="pastTable" rows={filteredPastReservations} kind="history" onDetails={setSelectedReservation} onAction={action} />
        </div>

        <div id="analytics-tab" className={activeTab === "analytics-tab" ? "active tab-pane" : "tab-pane"}>
          <AnalyticsTab
            analytics={dashboard?.analytics}
            grouping={grouping}
            onGroupingChange={(event) => {
              setGrouping(event.target.value);
              fetchDashboard(event.target.value);
            }}
          />
        </div>

        <div id="manage-venue" className={activeTab === "manage-venue" ? "active tab-pane" : "tab-pane"}>
          <ManageVenueTab
            venue={venue}
            workingDays={dashboard?.working_days || []}
            onSubmit={submitVenueUpdate}
            saving={saving}
          />
        </div>
      </div>

      <ReservationDetailsModal reservation={selectedReservation} onClose={() => setSelectedReservation(null)} />
    </div>
  );
}
