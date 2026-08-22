import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
	faCalendarDays,
	faChevronLeft,
	faChevronRight,
	faXmark,
} from "@fortawesome/free-solid-svg-icons";
import "./DateRangePicker.css";

const EMPTY_RANGE = { start: "", end: "" };
const REFERENCE_SUNDAY_TIMESTAMP = Date.UTC(1970, 0, 4);
const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

/* OK - REVIEWED */
function getWeekdayLabels(locale) {
	const formatter = new Intl.DateTimeFormat(locale, {
		weekday: "short",
		timeZone: "UTC",
	});
	const labels = [];

	for (let index = 0; index < 7; index += 1) {
		const timestamp = REFERENCE_SUNDAY_TIMESTAMP + index * ONE_DAY_IN_MS;
		labels.push(formatter.format(new Date(timestamp)));
	}

	return labels;
}

/* OK - REVIEWED */
function parseYmd(value) {
	if (!value) return null;

	const [year, month, day] = value.split("-").map(Number);

	if (!year || !month || !day) return null;

	return new Date(year, month - 1, day);
}

function toYmd(date) {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
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

function formatDate(value, locale) {
	if (!value) return "-";
	return new Intl.DateTimeFormat(locale, {
		month: "short",
		day: "numeric",
		year: "numeric",
	}).format(parseYmd(value));
}

function formatDateRangeLabel(value, t, locale) {
	if (!value.start && !value.end) return t("Select date range");
	if (value.start && value.end) {
		return `${formatDate(value.start, locale)} - ${formatDate(value.end, locale)}`;
	}
	return `${formatDate(value.start || value.end, locale)} - ...`;
}

export default function DateRangePicker({ value, onChange, minDate = "", maxDate = "" }) {
	const { t, i18n } 			= useTranslation();
	const locale 				= i18n.language;
	const [open, setOpen] 			= useState(false);
	const [draftRange, setDraftRange]   	= useState(value);
	const [hoveredDate, setHoveredDate] 	= useState("");
	const [viewDate, setViewDate] 	    	= useState(() => parseYmd(value.start) || new Date());
	const pickerRef 			= useRef(null);
	const calendarDays 			= useMemo(() => getCalendarDays(viewDate), [viewDate]);
	const monthLabel 			= new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(viewDate);
	const weekdayLabels 			= useMemo(() => getWeekdayLabels(locale), [locale]);

	/* OK - REVIEWED */
	useEffect(() => {
		if (!open) {
			setDraftRange(value);
			return;
		}

		const closePicker = () => { /* function pointer */
			setOpen(false);
			setDraftRange(value);
		};
		const closeOnOutsideClick = (event) => {
			/* pickerRef is attached to the real DOM's button element, so we can check if the click was outside of it */
			if (!pickerRef.current?.contains(event.target)) closePicker();
		};
		const closeOnEscape = (event) => {
			if (event.key === "Escape") closePicker();
		};

		document.addEventListener("mousedown", closeOnOutsideClick);
		document.addEventListener("keydown", closeOnEscape);
		return () => {
			document.removeEventListener("mousedown", closeOnOutsideClick);
			document.removeEventListener("keydown", closeOnEscape);
		};
	}, [open, value]); /* whenever open or value changes, we re-run this effect to update the event listeners and draftRange */

	/* OK - REVIEWED */
	const openPicker = () => {
		setDraftRange(value); /* initializes the draft range from parent's VenueDashboard dateRange state */
		setHoveredDate("");
		setViewDate(parseYmd(value.start) || new Date());
		setOpen(true);
	};

	/* OK - REVIEWED */
	const selectDate = (dateValue) => {
		if ((minDate && dateValue < minDate) || (maxDate && dateValue > maxDate)) return;

		setHoveredDate("");
		if (!draftRange.start || draftRange.end || dateValue < draftRange.start) {
			/* no start or complete range so re-start or earlier start-->restart */
			setDraftRange({ start: dateValue, end: "" }); /* inclomplete */
			return; /* we never reach onChange if we only selected start date */
		}
		
		const nextRange = { start: draftRange.start, end: dateValue }; /* what we had before + new dateValue */
		
		setDraftRange(nextRange);
		onChange(nextRange); /* callback of parent (in our case this updates the tables) */
		setOpen(false);
	};

	/* OK - REVIEWED */
	const clearRange = () => {
		setDraftRange(EMPTY_RANGE);
		setHoveredDate("");
		onChange(EMPTY_RANGE);
		setOpen(false);
	};

	return (
		<div className="date-range-picker" >
			<div className="date-range-trigger-wrap">
				<button
					type="button" 		/* This denotes that this is a regular interactive button, will not be used to submit a form */
					className="btn btn-outline-secondary daterange-input"
					aria-expanded={open} 	/* Describes the current state */
					aria-haspopup="dialog" 	/* Indicates that the button opens a dialog */
					onClick={open ? () => setOpen(false) : openPicker} /* Here we give function pointers or just the callbacks that will run, instead of running a function */
				>
					<FontAwesomeIcon icon={faCalendarDays} className="calendar-icon" aria-hidden="true" />
					<span>{formatDateRangeLabel(value, t, locale)}</span>
				</button>

				{open && (
					<div className="date-range-popover" role="dialog" aria-label={t("Select date range")} ref={pickerRef}>
						<div className="date-range-calendar-header">
							<button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setViewDate((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} aria-label={t("Previous month")}>
								<FontAwesomeIcon icon={faChevronLeft} aria-hidden="true" />
							</button>

							<strong>{monthLabel}</strong>
							
							<button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} aria-label={t("Next month")}>
								<FontAwesomeIcon icon={faChevronRight} aria-hidden="true" />
							</button>
						</div>
						<div className="date-range-weekdays" aria-hidden="true">
							{weekdayLabels.map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
						</div>
						<div className="date-range-calendar-grid">
							{calendarDays.map((day) => {
								const isDisabled 	= Boolean((minDate && day.value < minDate) || (maxDate && day.value > maxDate));
								const isStart 	 	= day.value === draftRange.start;
								const isEnd 	 	= day.value === draftRange.end;
								const isInRange 	= Boolean(draftRange.start && draftRange.end && day.value > draftRange.start && day.value < draftRange.end);
								const isPreviewEnd 	= Boolean(draftRange.start && !draftRange.end && hoveredDate >= draftRange.start && day.value === hoveredDate);
								const isInPreviewRange 	= Boolean(draftRange.start && !draftRange.end && hoveredDate > draftRange.start && day.value > draftRange.start && day.value < hoveredDate);

								return (
									<button
										key={day.value}
										type="button"
										className={["date-range-day", day.isCurrentMonth ? "" : "is-muted", isStart ? "is-start" : "", isEnd ? "is-end" : "", isInRange ? "is-in-range" : "", isPreviewEnd ? "is-preview-end" : "", isInPreviewRange ? "is-preview-range" : ""].filter(Boolean).join(" ")}
										disabled={isDisabled}
										onClick={() => selectDate(day.value)}
										onMouseEnter={() => !isDisabled && setHoveredDate(day.value)}
										onFocus={() => !isDisabled && setHoveredDate(day.value)}
										onMouseLeave={() => setHoveredDate("")}
										onBlur={() => setHoveredDate("")}
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
				<button type="button" className="btn btn-sm btn-outline-secondary clear-range-btn" title={t("Clear date range")} aria-label={t("Clear date range")} onClick={clearRange}>
					<FontAwesomeIcon icon={faXmark} aria-hidden="true" />
				</button>
			)}
		</div>
	);
}
