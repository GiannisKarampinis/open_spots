function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function capitalize(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

function formatDateDisplay(isoDateStr) {
    if (!isoDateStr) return '';
    const parts = isoDateStr.split('T')[0];
    const [y, m, d] = parts.split('-').map(Number);
    if (!y || !m || !d) return isoDateStr;
    const dt = new Date(Date.UTC(y, m - 1, d));
    try {
        return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(dt);
    } catch {
        return dt.toLocaleDateString();
    }
}

function formatTimeDisplay(timeStr) {
    if (!timeStr) return '';
    const hhmm = timeStr.split(':').slice(0,2).join(':');
    const [hh, mm] = hhmm.split(':').map(Number);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return timeStr;
    const dt = new Date(Date.UTC(1970,0,1, hh, mm));
    try {
        return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: 'numeric', hour12: true }).format(dt);
    } catch {
        const hour12 = ((hh + 11) % 12) + 1;
        const ampm = hh >= 12 ? 'PM' : 'AM';
        return `${hour12}:${String(mm).padStart(2,'0')} ${ampm}`;
    }
}

function renderRowFromData(data) {
    if (!data || !data.id) return '';

    const id        = data.id;
    const customer  = data.customer_name || (data.customer && data.customer.name) || data.customer || '—';
    const dateISO   = data.date || data.reservation_date || '';
    const timeRaw   = data.time || data.reservation_time || '';
    const party     = (data.guests !== undefined && data.guests !== null) ? data.guests : '';
    const status    = (data.status || data.reservation_status || '').toLowerCase();
    const arrivalStatusRaw = (data.arrival_status || '').toLowerCase();
    const isArrival = !!data.is_arrival || ['checked_in','no_show'].includes(status) || status === 'accepted';

    const dateDisplay = formatDateDisplay(dateISO);
    const timeDisplay = formatTimeDisplay(timeRaw);

    const dateDataOrder = dateISO || '';
    const timeDataOrder = (timeRaw && /^\d{2}:\d{2}(:\d{2})?$/.test(timeRaw)) ? timeRaw.substring(0,5) : (timeRaw || '');
    const displayStatus = isArrival ? (arrivalStatusRaw || 'pending') : (status || 'unknown');

    let badgeClasses = 'badge ';
    if          (displayStatus === 'pending')       badgeClasses += 'bg-warning text-dark';
    else if     (displayStatus === 'accepted')      badgeClasses += 'bg-success';
    else if     (displayStatus === 'checked_in')    badgeClasses += 'bg-success';
    else if     (displayStatus === 'no_show')       badgeClasses += 'bg-danger';
    else if     (displayStatus === 'cancelled')     badgeClasses += 'bg-secondary';
    else badgeClasses += 'bg-danger';

    const statusLabel = (displayStatus || 'unknown').replace('_',' ');

    const urls      = data.urls || {};
    const acceptUrl = urls.accept || `/reservation/${id}/status/accepted/`;
    const rejectUrl = urls.reject || `/reservation/${id}/status/rejected/`;
    const moveUrl   = urls.move   || `/reservation/${id}/move-to-requests/`;
    const checkInUrl= urls.checkin|| `/reservation/${id}/update-arrival/checked_in/`;
    const noShowUrl = urls.no_show || urls.noshow || `/reservation/${id}/update-arrival/no_show/`;
    const editHref  = urls.edit   || `/reservation/${id}/edit-status/`;

    let actionsHtml = '';
    if (status === 'pending') {
        actionsHtml = `
            <a href="${acceptUrl}" class="btn btn-success btn-sm me-1 btn-accept-reservation" data-status="accepted">✅ Accept</a>
            <a href="${rejectUrl}" class="btn btn-danger btn-sm btn-reject-reservation" data-status="rejected">❌ Reject</a>
        `;
    } else {
        const showArrivalButtons = (status === 'accepted' && arrivalStatusRaw === 'pending');
        let btns = '';
        if (showArrivalButtons) {
            btns += `
                <a href="${checkInUrl}" class="btn btn-success btn-sm me-1 btn-update-arrival" data-status="checked_in">✅ Checked-in</a>
                <a href="${noShowUrl}" class="btn btn-danger btn-sm btn-update-arrival" data-status="no_show">❌ No-show</a>
            `;
        }
        btns += `<a href="${editHref}" data-move-url="${moveUrl}" class="btn btn-sm btn-edit-status">Move to Requests</a>`;
        actionsHtml = btns;
    }

    return `
        <tr id="reservation-row-${id}" data-reservation-id="${id}">
            <td>${escapeHtml(customer)}</td>
            <td data-order="${escapeHtml(dateDataOrder)}">${escapeHtml(dateDisplay)}</td>
            <td data-order="${escapeHtml(timeDataOrder)}">${escapeHtml(timeDisplay)}</td>
            <td>${escapeHtml(String(party))}</td>
            <td><span class="${badgeClasses}">${escapeHtml(capitalize(statusLabel))}</span></td>
            <td>${actionsHtml}</td>
        </tr>
    `;
}
