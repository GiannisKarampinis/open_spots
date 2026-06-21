import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  faBell,
  faBuilding,
  faCalendarDays,
  faChartBar,
  faChevronLeft,
  faChevronRight,
  faClockRotateLeft,
  faEye,
  faEyeSlash,
  faTableList,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { faAlarmClock } from "@fortawesome/free-regular-svg-icons";
import { getWithAuth, postWithAuth } from "../utils/auth";
import "../styles/venue_dashboard_legacy.css";
import "../styles/venue_dashboard.css";

const tabs = [
  ["requests",      faTableList,        "Reservation Requests & Guest Arrivals"],
  ["history",       faClockRotateLeft,  "Reservation History"],
  ["analytics-tab", faChartBar,         "Analytics"],
  ["manage-venue",  faBuilding,         "Manage Venue"],
];

const venueTypes = [
  ["restaurant",  "Restaurant"],
  ["cafe",        "Cafe"],
  ["bar",         "Bar"],
  ["beach_bar",   "Beach Bar"],
  ["other",       "Other"],
];

const emptyReservationTable = {
  rows:       [],
  count:      0,
  page:       1,
  pageSize:   10,
  totalPages: 1,
  search:     "",
  sorting:    [],
  loading:    false,
};


function statusClass(status) {
  if (status === "pending") return "bg-warning text-dark";
  if (status === "accepted" || status === "checked_in") return "bg-success";
  return "bg-danger";
}


function titleStatus(status, t = (value) => value) {
  if (!status) return "-";
  const label = status.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  return t(label);
}


function formatDate(value, locale) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}


function formatTime(value, locale) {
  if (!value) return "-";
  const [hour, minute] = value.split(":");
  const date = new Date();
  date.setHours(Number(hour), Number(minute), 0, 0);
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(date);
}


function normalizeAnalyticsRows(analytics) {
  if (Array.isArray(analytics?.series)) {
    return analytics.series
      .map((row) => ({
        period: row.period,
        visits: Number(row.visits || 0),
        reservations: Number(row.reservations || 0),
      }))
      .sort((a, b) => String(a.period).localeCompare(String(b.period)));
  }

  const figure = analytics?.figure;
  if (!figure) return [];

  try {
    const parsedFigure = typeof figure === "string" ? JSON.parse(figure) : figure;
    const traces = Array.isArray(parsedFigure?.data) ? parsedFigure.data : [];
    const rowsByPeriod = new Map();

    traces.forEach((trace) => {
      const key = String(trace.name || "").toLowerCase().includes("reservation")
        ? "reservations"
        : "visits";
      const labels = Array.isArray(trace.x) ? trace.x : [];
      const values = Array.isArray(trace.y) ? trace.y : [];

      labels.forEach((label, index) => {
        if (!rowsByPeriod.has(label)) {
          rowsByPeriod.set(label, { period: label, visits: 0, reservations: 0 });
        }
        rowsByPeriod.get(label)[key] = Number(values[index] || 0);
      });
    });

    return Array.from(rowsByPeriod.values()).sort((a, b) => String(a.period).localeCompare(String(b.period)));
  } catch {
    return [];
  }
}


function AnalyticsTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="analytics-tooltip">
      <strong>{label}</strong>
      {payload.map((item) => (
        <div key={item.dataKey} style={{ color: item.color }}>
          {item.name}: {item.value}
        </div>
      ))}
    </div>
  );
}


function tableControlPrefix(id) {
  if (id === "pastTable") return "history";
  return id.replace("Table", "");
}


function toYmd(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}


function parseYmd(value) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}


function getCalendarDays(viewDate) {
  const firstOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const start = new Date(firstOfMonth);
  start.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      date,
      value: toYmd(date),
      isCurrentMonth: date.getMonth() === viewDate.getMonth(),
    };
  });
}


function formatDateRangeLabel(value, t, locale) {
  if (!value.start && !value.end) return t("Select date range");
  if (value.start && value.end) return `${formatDate(value.start, locale)} - ${formatDate(value.end, locale)}`;
  return `${formatDate(value.start || value.end, locale)} - ...`;
}


function DateRangePickerShell({ targetTab, value, onChange, onClear }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const [open, setOpen] = useState(false);
  const [draftRange, setDraftRange] = useState(value);
  const [viewDate, setViewDate] = useState(() => parseYmd(value.start) || new Date());
  const pickerRef = useRef(null);
  const calendarDays = useMemo(() => getCalendarDays(viewDate), [viewDate]);
  const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(viewDate);
  const weekdayLabels = useMemo(() => (
    Array.from({ length: 7 }, (_, dayIndex) => (
      new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(2026, 1, dayIndex + 1))
    ))
  ), [locale]);

  useEffect(() => {
    if (!open) return undefined;

    const closeOnOutsideClick = (event) => {
      if (!pickerRef.current?.contains(event.target)) {
        setOpen(false);
        setDraftRange(value);
      }
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        setDraftRange(value);
      }
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, value]);

  useEffect(() => {
    if (!open) {
      setDraftRange(value);
    }
  }, [open, value]);

  const openPicker = () => {
    setDraftRange(value);
    setViewDate(parseYmd(value.start) || new Date());
    setOpen(true);
  };

  const moveMonth = (offset) => {
    setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  const selectDate = (dateValue) => {
    if (!draftRange.start || draftRange.end) {
      setDraftRange({ start: dateValue, end: "" });
      return;
    }

    if (dateValue < draftRange.start) {
      setDraftRange({ start: dateValue, end: "" });
      return;
    }

    const nextRange = { start: draftRange.start, end: dateValue };
    setDraftRange(nextRange);
    onChange(nextRange);
    setOpen(false);
  };

  const clearRange = () => {
    setDraftRange({ start: "", end: "" });
    onClear();
    setOpen(false);
  };

  return (
    <div id={`date-range-component-${targetTab}`} className="date-range-container" ref={pickerRef}>
      <div className="date-range-trigger-wrap">
        <button
          type="button"
          id={`daterange-input-${targetTab}`}
          className="btn btn-outline-secondary daterange-input"
          data-target-tab={targetTab}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={open ? () => setOpen(false) : openPicker}
        >
          <FontAwesomeIcon icon={faCalendarDays} className="calendar-icon" aria-hidden="true" />
        <span>{formatDateRangeLabel(value, t, locale)}</span>
        </button>

        {open && (
          <div className="date-range-popover" role="dialog" aria-label="Select date range">
            <div className="date-range-calendar-header">
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => moveMonth(-1)} aria-label={t("Previous month")}>
                <FontAwesomeIcon icon={faChevronLeft} aria-hidden="true" />
              </button>
              <strong>{monthLabel}</strong>
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => moveMonth(1)} aria-label={t("Next month")}>
                <FontAwesomeIcon icon={faChevronRight} aria-hidden="true" />
              </button>
            </div>
            <div className="date-range-weekdays" aria-hidden="true">
              {weekdayLabels.map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="date-range-calendar-grid">
              {calendarDays.map((day) => {
                const isStart = day.value === draftRange.start;
                const isEnd = day.value === draftRange.end;
                const isInRange = draftRange.start && draftRange.end && day.value > draftRange.start && day.value < draftRange.end;

                return (
                  <button
                    key={day.value}
                    type="button"
                    className={[
                      "date-range-day",
                      day.isCurrentMonth ? "" : "is-muted",
                      isStart ? "is-start" : "",
                      isEnd ? "is-end" : "",
                      isInRange ? "is-in-range" : "",
                    ].filter(Boolean).join(" ")}
                    onClick={() => selectDate(day.value)}
                    aria-pressed={isStart || isEnd}
                  >
                    {day.date.getDate()}
                  </button>
                );
              })}
            </div>
            <div className="date-range-calendar-footer">
              <span>{draftRange.start && !draftRange.end ? t("Select an end date") : t("Choose start and end dates")}</span>
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={clearRange}>{t("Clear")}</button>
            </div>
          </div>
        )}
      </div>

      {(value.start || value.end) && (
        <button type="button" className="btn btn-sm btn-outline-secondary clear-range-btn" data-target-tab={targetTab} title="Clear date range" aria-label="Clear date range" onClick={clearRange}>
          <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}


function ReservationStatusBadge({ value }) {
  const { t } = useTranslation();
  return <span className={`badge ${statusClass(value)}`}>{titleStatus(value, t)}</span>;
}


function SeenToggleButton({ reservation, onAction }) {
  const { t } = useTranslation();
  const isSeen = Boolean(reservation.seen);

  return (
    <button
      type="button"
      className="btn btn-sm btn-toggle-seen"
      data-seen={isSeen ? "true" : "false"}
      title={isSeen ? t("Mark as Unseen") : t("Mark as Seen")}
      aria-label={isSeen ? t("Mark reservation as unseen") : t("Mark reservation as seen")}
      onClick={(event) => {
        event.stopPropagation();
        onAction("seen", reservation, isSeen ? "unseen" : "seen");
      }}
    >
      <FontAwesomeIcon icon={isSeen ? faEye : faEyeSlash} aria-hidden="true" />
      {" "}
      <span>{isSeen ? t("Seen") : t("Unseen")}</span>
    </button>
  );
}


function SpecialRequestsBadge({ reservation }) {
  const { t } = useTranslation();
  const hasSpecialRequests = Boolean(reservation.special_requests);

  if (!hasSpecialRequests) {
    return null;
  }

  return (
    <span
      className="btn btn-sm btn-toggle-seen btn-special-requests"
      title={t("Has special requests")}
      aria-label={t("Has special requests")}
    >
      <FontAwesomeIcon icon={faTableList} aria-hidden="true" />
      {" "}
      <span>{t("Special Requests")}</span>
    </span>
  );
}


function ReservationRow({ reservation, kind, onDetails, onAction }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
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
      <td data-order={reservation.date}>{formatDate(reservation.date, locale)}</td>
      <td data-order={reservation.time}>{formatTime(reservation.time, locale)}</td>
      <td>{reservation.guests}</td>

      {kind === "requests" && (
        <td>
          <SeenToggleButton reservation={reservation} onAction={onAction} />
        </td>
      )}

      <td>
        <ReservationStatusBadge value={kind === "arrivals" ? arrivalStatus : reservation.status} />
      </td>

      {kind !== "history" && (
        <td>
          {kind === "requests" && reservation.status === "pending" && (
            <>
              <button type="button" className="btn btn-success btn-sm me-1 btn-accept-reservation" data-status="accepted" onClick={(event) => {
                event.stopPropagation();
                if (reservation.special_requests && !reservation.seen) {
                  onDetails(reservation, { highlightSpecialRequests: true });
                  return;
                }
                onAction("status", reservation, "accepted");
              }}>
                {t("Accept")}
              </button>
              <button type="button" className="btn btn-danger btn-sm btn-reject-reservation" data-status="rejected" onClick={(event) => {
                event.stopPropagation();
                onAction("status", reservation, "rejected");
              }}>
                {t("Reject")}
              </button>
            </>
          )}

          {kind === "arrivals" && (
            <>
              {reservation.status === "accepted" && reservation.arrival_status === "pending" && (
                <>
                  <button type="button" className="btn btn-success btn-sm me-1 btn-update-arrival" data-status="checked_in" onClick={(event) => {
                    event.stopPropagation();
                    onAction("arrival", reservation, "checked_in");
                  }}>
                    {t("Checked in")}
                  </button>
                  <button type="button" className="btn btn-danger btn-sm btn-update-arrival" data-status="no_show" onClick={(event) => {
                    event.stopPropagation();
                    onAction("arrival", reservation, "no_show");
                  }}>
                    {t("No show")}
                  </button>
                </>
              )}
              <button type="button" className="btn btn-sm btn-edit-status" data-move-url={`/api/v1/reservations/${reservation.id}/move-to-requests/`} onClick={(event) => {
                event.stopPropagation();
                onAction("move", reservation);
              }}>
                {t("Move to Requests")}
              </button>
            </>
          )}
        </td>
      )}
    </tr>
  );
}


function ReservationsTable({
  id,
  rows,
  kind,
  meta,
  search,
  sorting,
  onSearchChange,
  onPageChange,
  onPageSizeChange,
  onSortingChange,
  onDetails,
  onAction,
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const includeSeen = kind === "requests";
  const includeAction = kind !== "history";
  const controlPrefix = tableControlPrefix(id);
  const columns = useMemo(() => {
    const baseColumns = [
      {
        accessorKey: "customer_name",
        header: t("Customer"),
        cell: (info) => info.getValue(),
      },
      {
        accessorKey: "date",
        header: t("Date"),
        cell: (info) => formatDate(info.getValue(), locale),
      },
      {
        accessorKey: "time",
        header: t("Time"),
        cell: (info) => formatTime(info.getValue(), locale),
      },
      {
        accessorKey: "guests",
        header: t("Guests"),
        cell: (info) => info.getValue(),
      },
    ];

    if (includeSeen) {
      baseColumns.push({
        id: "seen",
        accessorFn: (reservation) => (reservation.seen ? t("Seen") : t("Unseen")),
        header: t("Seen"),
        cell: ({ row }) => <SeenToggleButton reservation={row.original} onAction={onAction} />,
      });
    }

    baseColumns.push({
      id: "status",
      accessorFn: (reservation) => {
        if (kind !== "arrivals") return reservation.status;
        return reservation.status === "rejected" || reservation.status === "cancelled"
          ? reservation.status
          : reservation.arrival_status;
      },
      header: t("Status"),
      cell: (info) => <ReservationStatusBadge value={info.getValue()} />,
    });

    if (includeAction) {
      baseColumns.push({
        id: "action",
        header: t("Action"),
        enableSorting: false,
        cell: ({ row }) => (
          <>
            {kind === "requests" && row.original.status === "pending" && (
              <>
                <button type="button" className="btn btn-success btn-sm me-1 btn-accept-reservation" data-status="accepted" onClick={(event) => {
                  event.stopPropagation();
                  if (row.original.special_requests && !row.original.seen) {
                    onDetails(row.original, { highlightSpecialRequests: true });
                    return;
                  }
                  onAction("status", row.original, "accepted");
                }}>
                  {t("Accept")}
                </button>
                <button type="button" className="btn btn-danger btn-sm btn-reject-reservation" data-status="rejected" onClick={(event) => {
                  event.stopPropagation();
                  onAction("status", row.original, "rejected");
                }}>
                  {t("Reject")}
                </button>
              </>
            )}

            {kind === "arrivals" && (
              <>
                {row.original.status === "accepted" && row.original.arrival_status === "pending" && (
                  <>
                    <button type="button" className="btn btn-success btn-sm me-1 btn-update-arrival" data-status="checked_in" onClick={(event) => {
                      event.stopPropagation();
                      onAction("arrival", row.original, "checked_in");
                    }}>
                      {t("Checked in")}
                    </button>
                    <button type="button" className="btn btn-danger btn-sm btn-update-arrival" data-status="no_show" onClick={(event) => {
                      event.stopPropagation();
                      onAction("arrival", row.original, "no_show");
                    }}>
                      {t("No show")}
                    </button>
                  </>
                )}
                <button type="button" className="btn btn-sm btn-edit-status" data-move-url={`/api/v1/reservations/${row.original.id}/move-to-requests/`} onClick={(event) => {
                  event.stopPropagation();
                  onAction("move", row.original);
                }}>
                  {t("Move to Requests")}
                </button>
              </>
            )}
          </>
        ),
      });
    }

    baseColumns.push({
      id: "special_requests",
      accessorFn: (reservation) => Boolean(reservation.special_requests),
      header: t("Special Requests"),
      enableSorting: false,
      cell: ({ row }) => <SpecialRequestsBadge reservation={row.original} />,
    });

    return baseColumns;
  }, [includeSeen, includeAction, kind, onAction, t, locale]);

  const table = useReactTable({
    data: rows,
    columns,
    state: {
      sorting,
    },
    onSortingChange: (updater) => {
      const nextSorting = typeof updater === "function" ? updater(sorting) : updater;
      onSortingChange(nextSorting);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const page = meta?.page || 1;
  const pageSize = meta?.pageSize || 10;
  const totalRows = meta?.count || 0;
  const totalPages = meta?.totalPages || 1;
  const visibleRows = table.getRowModel().rows;
  const firstVisibleRow = totalRows ? (page - 1) * pageSize + 1 : 0;
  const lastVisibleRow = Math.min((page - 1) * pageSize + visibleRows.length, totalRows);
  const canPreviousPage = page > 1;
  const canNextPage = page < totalPages;

  return (
    <div className="table-responsive">
      <div className="datatable-controls d-flex justify-content-between mb-2">
        <div id={`${controlPrefix}-show-entries-wrapper`} className="datatable-length-control">
          <label>
            {t("Show")}{" "}
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
            >
              {[10, 25, 50, 100].map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>{" "}
            {t("entries")}
          </label>
        </div>
        <div id={`${controlPrefix}-search-wrapper`} className="datatable-search-control">
          <label>
            {t("Search:")}
            <input
              type="search"
              value={search ?? ""}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </label>
        </div>
      </div>
      <table id={id} className="table table-striped table-hover shadow-sm">
        <thead className="table-dark">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th key={header.id}>
                  {header.isPlaceholder ? null : (
                    <button
                      type="button"
                      className="datatable-sort-button"
                      disabled={!header.column.getCanSort()}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <span>{flexRender(header.column.columnDef.header, header.getContext())}</span>
                      {header.column.getCanSort() && (
                        <span className="datatable-sort-indicator" aria-hidden="true">
                          {header.column.getIsSorted() === "asc" ? "▲" : header.column.getIsSorted() === "desc" ? "▼" : "↕"}
                        </span>
                      )}
                    </button>
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {visibleRows.length ? (
            visibleRows.map((row) => (
              <tr
                key={row.id}
                id={`reservation-row-${row.original.id}`}
                data-reservation-id={row.original.id}
                data-seen={row.original.seen ? "true" : "false"}
                className={!row.original.seen && kind === "requests" ? "unseen-reservation" : ""}
                onClick={() => onDetails(row.original)}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} data-order={cell.column.id === "date" || cell.column.id === "time" ? cell.getValue() : undefined}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={table.getAllLeafColumns().length} className="datatable-empty">
                {t("No matching reservations found.")}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="datatable-footer">
        <div className="datatable-info">
          {totalRows
            ? t("Showing {{first}} to {{last}} of {{total}} entries", { first: firstVisibleRow, last: lastVisibleRow, total: totalRows })
            : t("Showing 0 entries")}
        </div>
        <div className="datatable-pagination" aria-label={`${id} pagination`}>
          <button type="button" className="paginate_button" onClick={() => onPageChange(1)} disabled={!canPreviousPage}>
            {t("First")}
          </button>
          <button type="button" className="paginate_button" onClick={() => onPageChange(page - 1)} disabled={!canPreviousPage}>
            {t("Previous")}
          </button>
          <span className="datatable-page-status">
            {t("Page {{page}} of {{total}}", { page, total: totalPages })}
          </span>
          <button type="button" className="paginate_button" onClick={() => onPageChange(page + 1)} disabled={!canNextPage}>
            {t("Next")}
          </button>
          <button type="button" className="paginate_button" onClick={() => onPageChange(totalPages)} disabled={!canNextPage}>
            {t("Last")}
          </button>
        </div>
      </div>
    </div>
  );
}


function AnalyticsTab({ analytics, grouping, onGroupingChange, venueId }) {
  const { t } = useTranslation();
  const stats = analytics || {};
  const chartData = useMemo(() => normalizeAnalyticsRows(stats), [stats]);
  const hasChartData = chartData.some((row) => row.visits || row.reservations);

  return (
    <div className="analytics-container" data-venue-id={venueId}>
      <form id="analyticsForm" className="d-flex justify-content-center mb-4" role="search" aria-label="Group analytics data">
        <label htmlFor="group" className="me-2 fs-5">{t("Group by:")}</label>
        <select name="group" id="group" className="form-select w-auto" aria-describedby="group-help" value={grouping} onChange={onGroupingChange}>
          <option value="daily">{t("Daily (Last 30 days)")}</option>
          <option value="weekly">{t("Weekly (Last 12 weeks)")}</option>
          <option value="monthly">{t("Monthly (Last 12 months)")}</option>
          <option value="yearly">{t("Yearly (Last 3 years)")}</option>
        </select>
      </form>

      <div id="analytics-stats" className="d-flex justify-content-around flex-wrap mb-4">
        <div className="stat-card text-center p-3 shadow-sm rounded">
          <div className="stat-value fs-3 fw-bold" id="total-visits">{stats.total_visits ?? 0}</div>
          <div className="stat-label text-muted">{t("Total Visits")}</div>
        </div>
        <div className="stat-card text-center p-3 shadow-sm rounded">
          <div className="stat-value fs-3 fw-bold" id="avg-daily-visits">{stats.avg_daily_visits ?? 0}</div>
          <div className="stat-label text-muted">{t("Avg Daily Visits")}</div>
        </div>
        <div className="stat-card text-center p-3 shadow-sm rounded">
          <div className="stat-value fs-3 fw-bold" id="peak-visits">{stats.peak_visits ?? 0}</div>
          <div className="stat-label text-muted">{t("Peak Daily Visits")} {titleStatus(grouping, t)}</div>
        </div>
        <div className="stat-card text-center p-3 shadow-sm rounded">
          <div className="stat-value fs-3 fw-bold" id="total-reservations">{stats.total_reservations ?? 0}</div>
          <div className="stat-label text-muted">{t("Total Reservations")}</div>
        </div>
      </div>

      <div id="analytics-chart" className="react-analytics-chart">
        {hasChartData ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 24, right: 28, left: 8, bottom: 20 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.16)" strokeDasharray="4 4" />
              <XAxis
                dataKey="period"
                tick={{ fill: "var(--button-text)", fontSize: 12 }}
                tickMargin={12}
                minTickGap={20}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: "var(--button-text)", fontSize: 12 }}
                tickMargin={8}
              />
              <Tooltip content={<AnalyticsTooltip />} />
              <Legend wrapperStyle={{ color: "var(--button-text)", paddingTop: 8 }} />
              <Line
                type="monotone"
                dataKey="visits"
                name={t("Visits")}
                stroke="#4a90e2"
                strokeWidth={3}
                dot={{ r: 4, strokeWidth: 2 }}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey="reservations"
                name={t("Reservations")}
                stroke="#f5a623"
                strokeWidth={3}
                dot={{ r: 4, strokeWidth: 2 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="react-chart-placeholder">
            {t("No analytics data available for the selected range.")}
          </div>
        )}
      </div>
    </div>
  );
}


function ImagePreviewStrip({ title, previewId, inputId, inputName, images, newFiles, onFiles, onRemoveExisting, onRemoveNew }) {
  return (
    <div className="file-upload-group">
      <div id={previewId} className="file-preview">
        {images?.length || newFiles?.length ? (
          <>
        {images.map((image, index) => (
          <div
            className={`thumb-wrapper ${index === 0 ? "profile" : ""}`}
            data-existing="true"
            data-id={image.id}
            data-approved="true"
            data-deleted="false"
            key={image.id}
          >
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
        <input type="file" name={inputName} id={inputId} multiple hidden accept="image/*" onChange={onFiles} />
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
      <form method="POST" encType="multipart/form-data" className="venue-form-card" onSubmit={submit}>
        <div className="section-card mb-4 sensitive-contact-section">
          <div className="section-header">
            <h5 className="mb-0">Sensitive & Contact Information</h5>
          </div>
          <div id="sensitiveSection" className="section-body show">
            <div className="grid">
              <div>
                <label htmlFor="name">Venue Name</label>
                <input type="text" name="name" id="name" value={form.name} onChange={(event) => updateForm("name", event.target.value)} className="form-input" required />
              </div>
              <div>
                <label htmlFor="kind">Type</label>
                <select name="kind" id="kind" value={form.kind} onChange={(event) => updateForm("kind", event.target.value)} className="form-input">
                  {venueTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="location">Location</label>
              <input type="text" name="location" id="location" value={form.location} onChange={(event) => updateForm("location", event.target.value)} className="form-input" required />
            </div>

            <div>
              <label htmlFor="description">Description</label>
              <textarea name="description" id="description" rows="4" value={form.description} onChange={(event) => updateForm("description", event.target.value)} className="form-input"></textarea>
            </div>

            <div className="grid">
              <div>
                <label htmlFor="email">Email</label>
                <input type="email" name="email" id="email" value={form.email} onChange={(event) => updateForm("email", event.target.value)} className="form-input" />
              </div>
              <div>
                <label htmlFor="phone">Phone</label>
                <input type="text" name="phone" id="phone" value={form.phone} onChange={(event) => updateForm("phone", event.target.value)} className="form-input" />
              </div>
            </div>

            <ImagePreviewStrip
              title="Upload Venue Images"
              previewId="venue-preview"
              inputId="venue_images"
              inputName="venue_images"
              images={venueImages}
              newFiles={newVenueImages}
              onFiles={(event) => setNewVenueImages((current) => [...current, ...Array.from(event.target.files || [])])}
              onRemoveExisting={(id) => setVenueImages((current) => current.filter((image) => image.id !== id))}
              onRemoveNew={(index) => setNewVenueImages((current) => current.filter((_, itemIndex) => itemIndex !== index))}
            />
            <ImagePreviewStrip
              title="Upload Menu Images"
              previewId="menu-preview"
              inputId="menu_images"
              inputName="menu_images"
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
                    <td><input type="checkbox" name={`${day.weekday}-is_closed`} checked={day.is_closed} onChange={(event) => updateDay(day.weekday, { is_closed: event.target.checked })} /></td>
                    <td><input type="time" name={`${day.weekday}-open_time`} step="1800" value={day.open_time || ""} disabled={day.is_closed} onChange={(event) => updateDay(day.weekday, { open_time: snapTime(event.target.value) })} /></td>
                    <td className="close-cell">
                      <input type="time" name={`${day.weekday}-close_time`} step="1800" value={day.close_time || ""} disabled={day.is_closed} onChange={(event) => updateDay(day.weekday, { close_time: snapTime(event.target.value) })} />
                      <span className={`next-day-label ${!day.closes_next_day ? "is-hidden" : ""}`} data-next-day-label> (+1 day)</span>
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

      <div id="imageModal" className="image-modal" aria-hidden="true">
        <button type="button" className="close-btn" aria-label="Close image preview">x</button>
        <img src="" alt="Preview" />
      </div>
    </div>
  );
}







function ReservationDetailsModal({ reservation, sourceKind, highlightSpecialRequests, onAction, onClose }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  useEffect(() => {
    if (!reservation) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [reservation, onClose]);

  if (!reservation) return null;

  const nameParts = (reservation.customer_name || "").trim().split(/\s+/).filter(Boolean);
  const fallbackFirstName = nameParts[0] || "";
  const fallbackLastName = nameParts.slice(1).join(" ");

  const status = reservation.arrival_status && reservation.arrival_status !== "pending"
    ? reservation.arrival_status
    : reservation.status;

  const detailFields = [
    [t("First Name"), "reservation-detail-first-name", reservation.firstname || fallbackFirstName],
    [t("Last Name"), "reservation-detail-last-name", reservation.lastname || fallbackLastName],
    [t("Email"), "reservation-detail-email", reservation.email],
    [t("Phone"), "reservation-detail-phone", reservation.phone],
    [t("Date"), "reservation-detail-date", formatDate(reservation.date, locale)],
    [t("Time"), "reservation-detail-time", formatTime(reservation.time, locale)],
    [t("Guests"), "reservation-detail-guests", reservation.guests],
    [t("Status"), "reservation-detail-status", titleStatus(status, t)],
  ];

  const seatingPreference = reservation.seating_preference || "none";
  const seatingPreferenceOptions = [
    ["none", t("No seating preference")],
    ["indoor", t("Indoor Seating")],
    ["outdoor", t("Outdoor Seating")],
  ];

  const specialRequestOptions = [
    [t("Vegan"), "vegan", Boolean(reservation.vegan)],
    [t("Vegetarian"), "vegetarian", Boolean(reservation.vegetarian)],
    [t("Gluten free"), "gluten-free", Boolean(reservation.gluten_free)],
    [t("Wheelchair"), "wheelchair", Boolean(reservation.wheelchair)],
    [t("Smoking"), "smoking", Boolean(reservation.smoking)],
    [t("Allergies"), "allergies", Boolean(reservation.has_allergies)],
  ];
  const allergyComment = (reservation.allergies || "").trim();
  const reservationComment = (reservation.comments || "").trim();

  return (
    <div className="modal-backdrop show" onClick={onClose}>
      <div id="reservationDetailsModal" className="modal show" tabIndex="-1" aria-labelledby="reservationDetailsModalLabel" aria-hidden="false" onClick={onClose}>
        <div className="modal-dialog modal-dialog-centered" onClick={(event) => event.stopPropagation()}>
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id="reservationDetailsModalLabel">{t("Reservation Details")}</h5>
              <button type="button" className="btn-close" onClick={onClose} aria-label={t("Close")}></button>
            </div>
            <div className="modal-body">
              <div className="reservation-detail-grid">
                {detailFields.map(([label, id, value]) => (
                  <div className="reservation-detail-field" key={id}>
                    <span className="reservation-detail-label">{label}</span>
                    <span className="reservation-detail-value" id={id}>{value || "-"}</span>
                  </div>
                ))}
              </div>

              <section className={`reservation-special-section ${highlightSpecialRequests ? "is-highlighted" : ""}`} aria-labelledby="reservation-detail-special-requests-title">
                <h6 id="reservation-detail-special-requests-title">{t("Special Requests")}</h6>
                <div className="reservation-special-options" id="reservation-detail-special-requests">
                  <select className={`reservation-seating-select ${seatingPreference === "none" ? "is-empty" : "is-selected"}`} id="reservation-detail-seating" value={seatingPreference} disabled aria-label={t("Seating")}>
                    {seatingPreferenceOptions.map(([value, label]) => (
                      <option value={value} key={value}>{label}</option>
                    ))}
                  </select>
                  {specialRequestOptions.map(([label, key, checked]) => (
                    <label className="reservation-special-option" key={key}>
                      <input type="checkbox" checked={checked} readOnly aria-label={label} />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                {allergyComment && (
                  <div className="reservation-detail-note">
                    <span className="reservation-detail-label">{t("Allergies")} {t("Comments")}</span>
                    <p id="reservation-detail-allergies">{allergyComment}</p>
                  </div>
                )}
                {reservationComment && (
                  <div className="reservation-detail-note">
                    <span className="reservation-detail-label">{t("Comments")}</span>
                    <p id="reservation-detail-comments">{reservationComment}</p>
                  </div>
                )}
              </section>
            </div>
            {sourceKind !== "history" && (
              <div className="modal-footer reservation-modal-actions">
                {sourceKind === "requests" && reservation.status === "pending" && (
                  <>
                    <button type="button" className="btn btn-success btn-sm me-1 btn-accept-reservation" data-status="accepted" onClick={(event) => {
                      event.stopPropagation();
                      onAction("status", reservation, "accepted");
                      onClose();
                    }}>
                      {t("Accept")}
                    </button>
                    <button type="button" className="btn btn-danger btn-sm btn-reject-reservation" data-status="rejected" onClick={(event) => {
                      event.stopPropagation();
                      onAction("status", reservation, "rejected");
                      onClose();
                    }}>
                      {t("Reject")}
                    </button>
                  </>
                )}

                {sourceKind === "arrivals" && (
                  <>
                    {reservation.status === "accepted" && reservation.arrival_status === "pending" && (
                      <>
                        <button type="button" className="btn btn-success btn-sm me-1 btn-update-arrival" data-status="checked_in" onClick={(event) => {
                          event.stopPropagation();
                          onAction("arrival", reservation, "checked_in");
                          onClose();
                        }}>
                          {t("Checked in")}
                        </button>
                        <button type="button" className="btn btn-danger btn-sm btn-update-arrival" data-status="no_show" onClick={(event) => {
                          event.stopPropagation();
                          onAction("arrival", reservation, "no_show");
                          onClose();
                        }}>
                          {t("No show")}
                        </button>
                      </>
                    )}
                    <button type="button" className="btn btn-sm btn-edit-status" data-move-url={`/api/v1/reservations/${reservation.id}/move-to-requests/`} onClick={(event) => {
                      event.stopPropagation();
                      onAction("move", reservation);
                      onClose();
                    }}>
                      {t("Move to Requests")}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}





export default function VenueDashboardPage() {
  const { t }        = useTranslation();
  const { venueId }  = useParams();      /* Reads the venueId from the URL parameters */
  const navigate     = useNavigate();    /* Later, this will be used to redirect */
  
  
  const activeTabStorageKey = `venue-dashboard:${venueId}:active-tab`; /* Key used to store the active tab in localStorage */
  
  const [activeTab, setActiveTab] = useState(() => {
    const storedTab = localStorage.getItem(activeTabStorageKey);
    return tabs.some(([id]) => id === storedTab) ? storedTab : "requests";
  });

  const selectTab = (tabId) => {
    setActiveTab(tabId);
    localStorage.setItem(activeTabStorageKey, tabId);
  };

  useEffect(() => {
    const storedTab = localStorage.getItem(activeTabStorageKey);
    setActiveTab(tabs.some(([id]) => id === storedTab) ? storedTab : "requests");
  }, [activeTabStorageKey]);


  const [dashboard, setDashboard]                     = useState(null);
  const [grouping, setGrouping]                       = useState("daily");
  const [message, setMessage]                         = useState("");
  const [saving, setSaving]                           = useState(false);
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [selectedReservationSource, setSelectedReservationSource] = useState(null);
  const [highlightSpecialRequests, setHighlightSpecialRequests] = useState(false);

  const [dateRanges, setDateRanges] = useState({
    requests:   { start: "", end: "" },
    history:    { start: "", end: "" },
  });

  const [reservationTables, setReservationTables] = useState({
    requests:   { ...emptyReservationTable },
    arrivals:   { ...emptyReservationTable },
    history:    { ...emptyReservationTable },
  });

  /* OK - REVIEWED */
  const redirectToLogin = () => {
    navigate(`/accounts/login?next=${encodeURIComponent(`/venues/dashboard/${venueId}`)}`);
    // This will redirect the user to the login page and then back to the dashboard after successful login
    // We build the url parameter "next" which will be consumed in the login page to redirect back to the 
    // dashboard after successful login. The encodeURIComponent is used to ensure that the URL is properly 
    // encoded for use in a query string.
  };

  /* OK - REVIEWED */
  const fetchDashboard = async (group = grouping) => {
    try {
      
      const res = await getWithAuth(`/api/v1/venues/${venueId}/dashboard/`,
                                    { params: { group } },
                                    { onUnauthenticated: redirectToLogin },
      );
      
      if (!res) {
        return;
      }
      
      setDashboard(res.data); /* Stores the backend response and re-render */
      setMessage("");         /* Clears any previous error messages */
    
    } catch (err) {
    
      setMessage(err.response?.data?.detail || "Could not load the venue dashboard.");
    
    }
  };

  const fetchDashboardCounts = async () => {
    try {
      const res = await getWithAuth(`/api/v1/venues/${venueId}/dashboard-counts/`,
                                    {},
                                    { onUnauthenticated: redirectToLogin },
      );

      if (!res) {
        return;
      }

      setDashboard((current) => ({
        ...current,
        reservation_counts: res.data,
      }));

    } catch (err) {
      setMessage(err.response?.data?.detail || "Could not load dashboard counts.");
    }
  };

  /* OK - REVIEWED */
  const setReservationTable = (key, patch) => {
    /* key:["requests", "arrivals", "history"], patch:[the partial update to apply to the table] */
    
      setReservationTables((current) => ({
      ...current,         /* Copy the whole existing resercationTables object to maintain other tables unchanged */
      [key]: {            /* use the value of the variable key as the object property name */
        ...current[key],  /* copies the existing table data for that specific table */
        ...(typeof patch === "function" ? patch(current[key]) : patch), /* If patch is a function, call it with the current table. Otherwise, use patch as the object directly. (Function is not used right now, we leave it for future flexibility.) */
      },

    }));
  };

  /* OK - REVIEWED */
  const fetchReservationBucket = async (key) => {
    const   table = reservationTables[key]; /* Pointer to the respective table reference */
    const   range = key === "history" ? dateRanges.history : dateRanges.requests; /* Pointer to the respective date range reference */
    
    setReservationTable(key, { loading: true }); /* Mark this table as loading (state boolean) before making the API call */

    try {
      const sort = table.sorting?.[0];
      
      const res = await getWithAuth(`/api/v1/venues/${venueId}/dashboard-reservations/`,
        {
          params: {
            bucket:     key,
            page:       table.page,
            page_size:  table.pageSize,
            search:     table.search  || undefined,
            sort:       sort?.id      || undefined,
            direction:  sort?.desc    ? "desc" : "asc",
            start:      range.start   || undefined,
            end:        range.end     || undefined,
          },
        },
        { onUnauthenticated: redirectToLogin },
      );
      
      if (!res) {
        setReservationTable(key, { loading: false });
        return;
      }
      
      setReservationTable(key, {
        rows:         res.data.results || [], /* This is returned from the _reservation_payload() function in the backend */
        count:        res.data.count || 0,
        page:         res.data.page || 1,
        pageSize:     res.data.page_size || table.pageSize,
        totalPages:   res.data.total_pages || 1,
        loading:      false,
      });

    } catch (err) {
      setReservationTable(key, { loading: false });
      setMessage(err.response?.data?.detail || "Could not load reservations.");
    }
  };

  /* OK - REVIEWED */
  useEffect(() => {
    fetchDashboard(); /* Initial dashboard loading when the component mounts or when venueId changes */
  }, [venueId]);

  /* OK - REVIEWED */
  useEffect(() => {
    fetchReservationBucket("requests");
  }, [
    venueId,
    dateRanges.requests.start,
    dateRanges.requests.end,
    reservationTables.requests.page,
    reservationTables.requests.pageSize,
    reservationTables.requests.search,
    JSON.stringify(reservationTables.requests.sorting),
  ]);

  /* OK - REVIEWED */
  useEffect(() => {
    fetchReservationBucket("arrivals");
  }, [
    venueId,
    dateRanges.requests.start,
    dateRanges.requests.end,
    reservationTables.arrivals.page,
    reservationTables.arrivals.pageSize,
    reservationTables.arrivals.search,
    JSON.stringify(reservationTables.arrivals.sorting),
  ]);

  /* OK - REVIEWED */
  useEffect(() => {
    fetchReservationBucket("history");
  }, [
    venueId,
    dateRanges.history.start,
    dateRanges.history.end,
    reservationTables.history.page,
    reservationTables.history.pageSize,
    reservationTables.history.search,
    JSON.stringify(reservationTables.history.sorting),
  ]);

  const venue             = dashboard?.venue || {};
  const notificationCount = dashboard?.reservation_counts?.unseen_requests || 0;

  /* OK - REVIEWED */
  const updateDateRange = (key, range) => {  
    setDateRanges((current) => ({
      ...current,
      [key]: range,
    }));
    // In JavaScript, if an object has the same key twice, the later one wins.
    // {
    //   requests: { start: "", end: "" },
    //   history:  { start: "", end: "" },
    //   requests: { start: "2026-06-20", end: "2026-06-25" }
    // }
    
    if (key === "requests") {
      setReservationTable("requests", { page: 1 });
      setReservationTable("arrivals", { page: 1 });
    } else {
      setReservationTable(key, { page: 1 });
    }
  };

  /* OK - REVIEWED */
  const clearDateRange = (key) => {
    updateDateRange(key, { start: "", end: "" });
  };

  /* OK - REVIEWED */
  const updateTableSearch = (key, search) => {
    /* For reservationTables[key], update the search value and reset page back to 1. */
    setReservationTable(key, { search, page: 1 });
  };

  /* OK - REVIEWED */
  const updateTablePageSize = (key, pageSize) => {
    setReservationTable(key, { pageSize, page: 1 });
  };

  /* OK - REVIEWED */
  const updateTableSorting = (key, sorting) => {
    setReservationTable(key, { sorting, page: 1 });
  };

  /* OK - REVIEWED */
  const updateReservationInDashboard = (key, updatedReservation) => {
    /* NOTE: */
    /* This is simply utilized to update the seen/unseen for a specific row */
    /* It can be later used for any other reservation specific update */
    if (!updatedReservation?.id) return; /* If updatedResrvation exists, read it */
                                         /* If not, return undefined instead of crashing */

    setReservationTables((current) => {
      
      const patchTable = (table) => ({ /* Helper function inside the updater */
        ...table, /* copies all existing table metadata */
        
        rows: table.rows.map((item) => (
          item.id === updatedReservation.id ? { ...item, ...updatedReservation } : item
          /* Keep all old row fields, but overwrite/add the fields from updatedReservation. */
        )),
      });

      return {
        ...current,
        [key]: patchTable(current[key]),
      };
    });
  };

  /* OK - REVIEWED */
  const showReservationDetails = async (reservation, sourceKind, options = {}) => {
    /* NOTE: It wires a table row click to the reservation details modal. */
    /* onClick function of a row enables the onDetails() function */
    setSelectedReservationSource(sourceKind);
    setHighlightSpecialRequests(Boolean(options.highlightSpecialRequests));
    setSelectedReservation(reservation); 
    /* Stores the clicked reservation in state. */
    /* This triggers the ReservationDetailsModal to show up with the reservation details. */
    
    try {
      const res = await getWithAuth(`/api/v1/reservations/${reservation.id}/details/`,
        {},
        { onUnauthenticated: redirectToLogin },
      );
    
      if (!res) return;
      
      setSelectedReservation(res.data);
      /* Replaces the modal data with the full backend response */
      /* So the modal first opens with basic row info, then updates with complete detais
         once the request finishes. */
      
      updateReservationInDashboard("requests", { id: res.data.id, seen: res.data.seen }); /* updates seen */
      
      fetchDashboardCounts(); /* To update only the reservation counts in the dashboard */
    
    } catch (err) {
      setMessage(err.response?.data?.detail || "Could not load reservation details.");
    }
  };


  const action = async (kind, reservation, value) => {
    
    const endpoints = {
      status:   [`/api/v1/reservations/${reservation.id}/status/`, { status: value }],
      arrival:  [`/api/v1/reservations/${reservation.id}/arrival/`, { arrival_status: value }],
      seen:     [`/api/v1/reservations/${reservation.id}/seen/`, { state: value }],
      move:     [`/api/v1/reservations/${reservation.id}/move-to-requests/`, {}],
    };

    const [url, payload] = endpoints[kind];
    try {
    
      const res = await postWithAuth(url, payload, {}, { onUnauthenticated: redirectToLogin });
    
      if (!res) return;
    
      if (kind === "seen") {
        updateReservationInDashboard("requests", res.data.reservation || res.data);
        fetchDashboard(); /* To update the unseen reservation count in the dashboard */
        return;
      }
    
      fetchDashboard();
    
      fetchReservationBucket("requests");
      fetchReservationBucket("arrivals");
      fetchReservationBucket("history");
    
    } catch (err) {
      setMessage(err.response?.data?.detail || "Could not update the reservation.");
    }
  };

  const toggleAvailability = async () => {
    try {
      const res = await postWithAuth(
        `/api/v1/venues/${venueId}/toggle-full/`,
        {},
        {},
        { onUnauthenticated: redirectToLogin },
      );
      if (!res) return;
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
      const updateRes = await postWithAuth(
        `/api/v1/venues/${venueId}/submit-update/`,
        formData,
        {},
        { onUnauthenticated: redirectToLogin },
      );
      if (!updateRes) return;

      const hoursRes = await postWithAuth(
        `/api/v1/venues/${venueId}/working-hours/`,
        {
          working_days: workingDays.map((day) => ({
            weekday: day.weekday,
            is_closed: day.is_closed,
            open_time: day.open_time,
            close_time: day.close_time,
            closes_next_day: day.closes_next_day,
          })),
        },
        {},
        { onUnauthenticated: redirectToLogin },
      );
      if (!hoursRes) return;
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
      {/* {message && <div className="alert-info">{message}</div>} */}

      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="fw-bold">{venue.name || t("Venue Dashboard")}</h1>
        <div className="venue-status-toggle">
          {venue.is_full ? (
            <>
              <span className="badge bg-danger me-2">{t("Full")}</span>
              <button type="button" className="btn btn-outline-success btn-sm mark-availability" onClick={toggleAvailability}>
                {t("Mark as Available")}
              </button>
            </>
          ) : (
            <>
              <span className="badge bg-success me-2">{t("Available")}</span>
              <button type="button" className="btn btn-outline-danger btn-sm mark-availability" onClick={toggleAvailability}>
                {t("Mark as Full")}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="tabs">
        {tabs.map(([id, icon, label]) => (
          <button
            key={id}
            type="button"
            className={activeTab === id ? "active d-flex align-items-center gap-1" : ""}
            data-tab={id.replace("-tab", "")}
            onClick={() => selectTab(id)}
          >
            <FontAwesomeIcon icon={icon} aria-hidden="true" />
            {t(label)}
            {id === "requests" && (
              <span id="notification-container" className="position-relative ms-2">
                <FontAwesomeIcon
                  icon={faBell}
                  className="notification-bell"
                  aria-hidden="true"
                  style={{ display: notificationCount ? "inline-block" : "none" }}
                />
                <span id="notification-badge" className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger" style={{ display: notificationCount ? "inline-block" : "none", fontSize: "0.7rem" }}>
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
          <h2 className="mt-4"><FontAwesomeIcon icon={faAlarmClock} /> {t("Pending Reservation Requests")}</h2>
          <ReservationsTable
            id="upcomingTable"
            rows={reservationTables.requests.rows}
            kind="requests"
            meta={reservationTables.requests}
            search={reservationTables.requests.search}
            sorting={reservationTables.requests.sorting}
            onSearchChange={(value) => updateTableSearch("requests", value)}
            onPageChange={(page) => setReservationTable("requests", { page })}
            onPageSizeChange={(pageSize) => updateTablePageSize("requests", pageSize)}
            onSortingChange={(sorting) => updateTableSorting("requests", sorting)}
            onDetails={(reservation, options) => showReservationDetails(reservation, "requests", options)}
            onAction={action}
          />

          <h2 className="mt-5"><FontAwesomeIcon icon={faAlarmClock} /> {t("Guest Arrivals & Cancellations")}</h2>
          <ReservationsTable
            id="specialTable"
            rows={reservationTables.arrivals.rows}
            kind="arrivals"
            meta={reservationTables.arrivals}
            search={reservationTables.arrivals.search}
            sorting={reservationTables.arrivals.sorting}
            onSearchChange={(value) => updateTableSearch("arrivals", value)}
            onPageChange={(page) => setReservationTable("arrivals", { page })}
            onPageSizeChange={(pageSize) => updateTablePageSize("arrivals", pageSize)}
            onSortingChange={(sorting) => updateTableSorting("arrivals", sorting)}
            onDetails={(reservation, options) => showReservationDetails(reservation, "arrivals", options)}
            onAction={action}
          />
        </div>

        <div id="history" className={activeTab === "history" ? "active" : ""}>
          <DateRangePickerShell
            targetTab="historyTab"
            value={dateRanges.history}
            onChange={(range) => updateDateRange("history", range)}
            onClear={() => clearDateRange("history")}
          />
          <ReservationsTable
            id="pastTable"
            rows={reservationTables.history.rows}
            kind="history"
            meta={reservationTables.history}
            search={reservationTables.history.search}
            sorting={reservationTables.history.sorting}
            onSearchChange={(value) => updateTableSearch("history", value)}
            onPageChange={(page) => setReservationTable("history", { page })}
            onPageSizeChange={(pageSize) => updateTablePageSize("history", pageSize)}
            onSortingChange={(sorting) => updateTableSorting("history", sorting)}
            onDetails={(reservation, options) => showReservationDetails(reservation, "history", options)}
            onAction={action}
          />
        </div>

        <div id="analytics-tab" className={activeTab === "analytics-tab" ? "active tab-pane" : "tab-pane"}>
          <AnalyticsTab
            analytics={dashboard?.analytics}
            grouping={grouping}
            venueId={venueId}
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

      <ReservationDetailsModal
        reservation={selectedReservation}
        sourceKind={selectedReservationSource}
        highlightSpecialRequests={highlightSpecialRequests}
        onAction={action}
        onClose={() => {
          setSelectedReservation(null);
          setSelectedReservationSource(null);
          setHighlightSpecialRequests(false);
        }}
      />
    </div>
  );
}
