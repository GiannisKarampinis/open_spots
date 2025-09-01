document.addEventListener('DOMContentLoaded', () => {

    const unseenReservations = new Set();

    const _lastUpdated          = new Map(); // id -> timestamp ms
    const _recentLocalUpdates   = new Map(); // reservationId -> expiry timestamp (ms)
    // =======================================================
    // SUPPRESSION MAP FOR RACE CONDITION PROTECTION
    // =======================================================
    function suppressWsFor(reservationId, ms = 3000) {
        if (!reservationId) return;
        const idStr = String(reservationId);
        const expiry = Date.now() + ms;
        _recentLocalUpdates.set(idStr, expiry);
        setTimeout(() => {
            const v = _recentLocalUpdates.get(idStr);
            if (!v || v <= Date.now()) _recentLocalUpdates.delete(idStr);
        }, ms + 50);
    }

    function isSuppressed(reservationId) {
        if (!reservationId) return false;
        const v = _recentLocalUpdates.get(String(reservationId));
        return !!(v && v > Date.now());
    }

    function shouldApplyUpdate(res) {
        if (!res || !res.id) return false;
        if (!res.updated_at) {
            // fallback to suppression only
            return !isSuppressed(res.id);
        }
        const newTs = Date.parse(res.updated_at);
        const oldTs = _lastUpdated.get(String(res.id)) || 0;
        if (newTs <= oldTs) return false;
        _lastUpdated.set(String(res.id), newTs);
        return true;
    }

    function getCookie(name) {
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }

    function createTable(referenceSelector, tableId) {
        const tableHtml = `
            <div class="table-responsive">
                <div class="datatable-controls d-flex justify-content-between mb-2">
                    <div id="${tableId}-show-entries-wrapper"></div>
                    <div id="${tableId}-search-wrapper"></div>
                </div>
                <table id="${tableId}" class="table table-striped table-hover shadow-sm">
                    <thead class="table-dark">
                        <tr>
                            <th>Customer</th>
                            <th>Date</th>
                            <th>Time</th>
                            <th>Party Size</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
        `;
        $(tableHtml).insertAfter($(referenceSelector));
        initializeDataTable(`#${tableId}`);
    }

    function initializeDataTable(tableSelector) {
        if ($.fn.DataTable.isDataTable(tableSelector)) {
            return $(tableSelector).DataTable();
        }
        return $(tableSelector).DataTable({
            destroy:        true,
            lengthChange:   true,
            searching:      true,
            order: [
                [1, 'desc'],
                [2, 'desc']
            ]
        });
    }

    function initAllTables() {
        ['#upcomingTable', '#pastTable', '#specialTable'].forEach(selector => {
            if ($(selector).length && !$.fn.DataTable.isDataTable(selector)) {
                initializeDataTable(selector);
            }
        });

        // Move controls immediately after initialization (fixed pastTable wrapper names)
        $('#upcoming-show-entries-wrapper').append($('#upcomingTable_length').detach());
        $('#upcoming-search-wrapper').append($('#upcomingTable_filter').detach());
        $('#pastTable-show-entries-wrapper').append($('#pastTable_length').detach());
        $('#pastTable-search-wrapper').append($('#pastTable_filter').detach());
        $('#special-show-entries-wrapper').append($('#specialTable_length').detach());
        $('#special-search-wrapper').append($('#specialTable_filter').detach());
    }

    // Ensure date/time cell ordering helper used consistently
    function ensureDataOrderAttributes($row) {
        $row.find('td').each(function(index) {
            const $cell = $(this);

            // Date is column index 1: expect YYYY-MM-DD
            if (index === 1 && !$cell.attr('data-order')) {
                const rawDate = $cell.text().trim();
                if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
                    $cell.attr('data-order', rawDate);
                }
            }

            // Time is column index 2: HH:MM or HH:MM:SS -> store HH:MM
            if (index === 2 && !$cell.attr('data-order')) {
                const rawTime = $cell.text().trim();
                if (/^\d{2}:\d{2}(:\d{2})?$/.test(rawTime)) {
                    const hhmm = rawTime.substring(0,5);
                    $cell.attr('data-order', hhmm);
                }
            }
        });
    }

    function addRowToTable(tableSelector, rowHtml, isExistingRow = false) {
        const table     = initializeDataTable(tableSelector);
        const $row      = $(rowHtml);
        const trNode    = $row.get(0);

        if (!trNode || trNode.nodeName !== 'TR') {
            console.error('addRowToTable: rowHtml did not produce a <tr> node', rowHtml);
            return null;
        }

        ensureDataOrderAttributes($row);

        const newRowNode = table.row.add($row.get(0)).draw(false).node();

        // Force table to sort by Date (col 1) desc, then Time (col 2) desc
        table.order([[1, 'desc'], [2, 'desc']]).draw();

        // Highlight if it's a brand new row
        // Inside addRowToTable(...) AFTER the final table.order(...).draw();
        if (!isExistingRow && tableSelector === '#upcomingTable') {
            const $new = $(newRowNode);

            // Flash once + persist
            $new.addClass('new-reservation flash-once');

            // Remove only the animation class; persistent highlight remains
            setTimeout(() => $new.removeClass('flash-once'), 2000);

            // Optional: clear on hover (acknowledge)
            $new.on('mouseenter', function () { $(this).removeClass('new-reservation'); });
        }

        return newRowNode;
    }

    // =======================================================
    // INIT
    // =======================================================
    ['#upcomingTable', '#pastTable', '#specialTable'].forEach(selector => {
        if ($(selector).length) {
            initializeDataTable(selector);
        }
    });
    initAllTables();

    // =======================================================
    // RENDER ROW FROM JSON (client-side rendering)
    // Adapt this to the exact JSON shape you send from backend
    // =======================================================
    // Helpers: format display date/time (locale-friendly) and ensure data-order values
    function formatDateDisplay(isoDateStr) {
        if (!isoDateStr) return '';
        // Accept YYYY-MM-DD or full ISO. Create Date using UTC to avoid timezone shifting of date-only values.
        const parts = isoDateStr.split('T')[0]; // YYYY-MM-DD
        const [y, m, d] = parts.split('-').map(Number);
        if (!y || !m || !d) return isoDateStr;
        // Use UTC Date to avoid local tz shifts
        const dt = new Date(Date.UTC(y, m - 1, d));
        try {
            return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(dt);
        } catch (e) {
            return dt.toLocaleDateString();
        }
    }

    function formatTimeDisplay(timeStr) {
        if (!timeStr) return '';
        // accept HH:MM or HH:MM:SS (24h)
        const hhmm = timeStr.split(':').slice(0,2).join(':');
        const [hh, mm] = hhmm.split(':').map(Number);
        if (Number.isNaN(hh) || Number.isNaN(mm)) return timeStr;
        // construct a date on epoch day UTC with that time so Intl can format as 12h with AM/PM
        const dt = new Date(Date.UTC(1970,0,1, hh, mm));
        try {
            return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: 'numeric', hour12: true }).format(dt);
        } catch (e) {
            // fallback
            const hour12 = ((hh + 11) % 12) + 1;
            const ampm = hh >= 12 ? 'PM' : 'AM';
            return `${hour12}:${String(mm).padStart(2,'0')} ${ampm}`;
        }
    }

    function renderRowFromData(data) {
        console.log("Row data:", data);

        if (!data || !data.id) return '';
        const id        = data.id;
        const customer  = data.customer_name || (data.customer && data.customer.name) || data.customer || '—';
        const dateISO   = data.date || data.reservation_date || '';      // expected YYYY-MM-DD
        const timeRaw   = data.time || data.reservation_time || '';      // expected HH:MM or HH:MM:SS
        const party     = (data.guests !== undefined && data.guests !== null) ? data.guests : '';
        const status    = (data.status || data.reservation_status || '').toLowerCase();
        const arrivalStatusRaw = (data.arrival_status || '').toLowerCase();
        const isArrival = !!data.is_arrival || ['checked_in','no_show'].includes(status) || status === 'accepted';

        // display-friendly strings
        const dateDisplay = formatDateDisplay(dateISO);
        const timeDisplay = formatTimeDisplay(timeRaw);

        // data-order values for sorting (must be YYYY-MM-DD and HH:MM)
        const dateDataOrder = dateISO || '';
        const timeDataOrder = (timeRaw && /^\d{2}:\d{2}(:\d{2})?$/.test(timeRaw)) ? timeRaw.substring(0,5) : (timeRaw || '');

        const displayStatus = isArrival ? (arrivalStatusRaw || 'pending') : (status || 'unknown');


        // badge class mapping (matches your template + arrival-specific mapping)
        let badgeClasses = 'badge ';
        if (displayStatus === 'pending') badgeClasses += 'bg-warning text-dark';
        else if (displayStatus === 'accepted') badgeClasses += 'bg-success';
        else if (displayStatus === 'checked_in') badgeClasses += 'bg-success';
        else if (displayStatus === 'no_show') badgeClasses += 'bg-danger';
        else badgeClasses += 'bg-danger';

        const statusLabel = (displayStatus || 'unknown').replace('_',' ');

        // urls from server (preferred) or sensible fallbacks
        const urls = data.urls || {};
        const acceptUrl = urls.accept || `/reservation/${id}/status/accepted/`;
        const rejectUrl = urls.reject || `/reservation/${id}/status/rejected/`;
        const moveUrl   = urls.move   || `/reservation/${id}/move-to-requests/`;
        const checkInUrl= urls.checkin|| `/reservation/${id}/update-arrival/checked_in/`;
        const noShowUrl = urls.no_show || urls.noshow || `/reservation/${id}/update-arrival/no_show/`;
        const editHref  = urls.edit   || `/reservation/${id}/edit-status/`;

        let actionsHtml = '';

        // Render exactly as your Django template for upcoming rows:
        // If pending -> Accept / Reject buttons (same classes and data attributes)
        if (status === 'pending') {
            actionsHtml = `
                <a href="${acceptUrl}" class="btn btn-success btn-sm me-1 btn-accept-reservation" data-status="accepted">✅ Accept</a>
                <a href="${rejectUrl}" class="btn btn-danger btn-sm btn-reject-reservation" data-status="rejected">❌ Reject</a>
            `;
        } else {
            // Arrival block condition from template
            const arrivalSet = ['pending', 'checked_in', 'no_show'];

            if (arrivalSet.includes(arrivalStatusRaw) || isArrival) {
                // show Checked-In / No-Show buttons only when status is accepted AND arrival_status is pending
                const showArrivalButtons = (status === 'accepted' && arrivalStatusRaw === 'pending');

                let btns = '';
                if (showArrivalButtons) {
                    btns += `
                        <a href="${checkInUrl}"
                        class="btn btn-success btn-sm me-1 btn-update-arrival"
                        data-status="checked_in">✅ Checked-in</a>
                        <a href="${noShowUrl}"
                        class="btn btn-danger btn-sm btn-update-arrival"
                        data-status="no_show">❌ No-show</a>
                    `;
                }

                // Move button: href points to edit page, data-move-url points to move AJAX endpoint
                const moveDataUrl = urls.move || moveUrl;
                btns += `
                    <a href="${editHref}"
                    data-move-url="${moveDataUrl}"
                    class="btn btn-sm btn-edit-status">Move to Requests</a>
                `;

                actionsHtml = btns;
            } else {
                // fallback: same as template when arrival_status not in the set
                actionsHtml = `<span class="text-muted">—</span>`;
            }
        }

        // Build the row HTML to match the template EXACTLY (date/time cells include data-order)
        const rowHtml = `
            <tr id="reservation-row-${id}" data-reservation-id="${id}">
                <td>${escapeHtml(customer)}</td>
                <td data-order="${escapeHtml(dateDataOrder)}">${escapeHtml(dateDisplay)}</td>
                <td data-order="${escapeHtml(timeDataOrder)}">${escapeHtml(timeDisplay)}</td>
                <td>${escapeHtml(String(party))}</td>
                <td><span class="${badgeClasses}">${escapeHtml(capitalize(statusLabel))}</span></td>
                <td>${actionsHtml}</td>
            </tr>
        `;
        return rowHtml;
    }

    // tiny helpers used above
    function escapeHtml(s) {
        if (s === null || s === undefined) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
    
    function capitalize(s){ return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

    // Replace or insert a reservation row from JSON
    function upsertReservationRow(reservationData) {
        if (!reservationData || !reservationData.id) return;
        const rowId = `reservation-row-${reservationData.id}`;
        const existing = document.getElementById(rowId);

        // Decide target table by reservation_status/pending/accepted vs arrival presence
        let targetTableId;
        const status = (reservationData.status || reservationData.reservation_status || '').toLowerCase();
        if (status === 'pending') {
            targetTableId = '#upcomingTable';
        } else if (status === 'accepted') {
            // accepted may also be in upcoming; adapt to your app's logic — I put accepted into specialTable
            targetTableId = '#specialTable';
        } else if (reservationData.is_arrival || status === 'checked_in' || status === 'no_show') {
            targetTableId = '#specialTable';
        } else {
            targetTableId = '#specialTable';
        }

        // Ensure table exists
        if (!$(targetTableId).length) {
            // Choose a sensible reference selector
            if (targetTableId === '#upcomingTable') {
                createTable('#requests h2:contains("📝 Pending Reservation Requests")', targetTableId.replace('#',''));
            } else {
                createTable('#requests h2:contains("🚪 Guest Arrivals")', targetTableId.replace('#',''));
            }
        }

        // Remove existing row from whichever table
        if (existing) {
            // find its parent table (search up DOM)
            const $existing = $(existing);
            const parentTable = $existing.closest('table');
            if (parentTable.length) {
                const dt = initializeDataTable(`#${parentTable.attr('id')}`);
                if (dt) {
                    dt.row(existing).remove().draw(false);
                } else {
                    $existing.remove();
                }
            } else {
                $existing.remove();
            }
        }

        // Render and insert
        const html = renderRowFromData(reservationData);
        addRowToTable(targetTableId, html, !!existing);
    }

    // =======================================================
    // RESERVATION REQUESTS - ACCEPT / REJECT
    // Expect server to return JSON e.g. { reservation: {...} }
    // =======================================================
    $(document).on('click', '#upcomingTable .btn-accept-reservation, #upcomingTable .btn-reject-reservation', function (e) {
        e.preventDefault();
        const $btn = $(this);
        const href = $btn.attr('href');
        const url = href || null;
        const $row = $btn.closest('tr');

        const rowId = $row.attr('id');
        const reservationId = $row.data('reservation-id') || (rowId ? rowId.replace(/\D/g, '') : null);
        if (!reservationId) {
            console.error("Could not find reservation ID from row");
            return;
        }

        if (!url) {
            console.error("No URL for accept/reject button; ensure template sets href attribute");
            return;
        }

        // Disable UI
        $btn.prop('disabled', true).addClass('loading');

        fetch(url, {
            method: "POST",
            headers: {
                "X-CSRFToken":      getCookie("csrftoken"),
                "X-Requested-With": "XMLHttpRequest",
                "Content-Type":     "application/json"
            }
        })
        .then(response => {
            const contentType = (response.headers.get("content-type") || '');
            if (!response.ok) {
                if (contentType.includes("application/json")) {
                    return response.json().then(err => { throw new Error(err.error || "Status update failed"); });
                } else {
                    return response.text().then(txt => { throw new Error("Server error:\n" + txt); });
                }
            }
            return response.json();
        })
        .then(data => {
            // Expect server to return the updated reservation as JSON
            const reservationData = data.reservation || data;
            if (!reservationData || !reservationData.id) {
                throw new Error('Server did not return reservation JSON');
            }

             // Set last-updated timestamp from server (prevents stale WS updates)
            if (reservationData.updated_at) {
                _lastUpdated.set(String(reservationData.id), Date.parse(reservationData.updated_at));
            }

            // Suppress WS handling for this id while we update DOM
            suppressWsFor(reservationData.id, 3000);

            // Remove from upcoming table (if present) and insert into appropriate table using client rendering
            const dt = initializeDataTable('#upcomingTable');
            if (dt && $row.length) {
                dt.row($row.get(0)).remove().draw(false);
            } else {
                $row.remove();
            }

            upsertReservationRow(reservationData);
        })
        .catch(err => {
            console.error("Error updating reservation:", err);
            $btn.prop('disabled', false).removeClass('loading');
        });
    });

    // =======================================================
    // MOVE BACK TO REQUESTS (specialTable -> upcomingTable)
    // Expect server to return { reservation: {...} } or { upcoming_row: {...} }
    // =======================================================
    $(document).on('click', '#specialTable .btn-edit-status', function(e) {
        e.preventDefault();
        const $btn = $(this);
        const $tr = $btn.closest('tr');
        const reservationId = $tr.data('reservation-id') || ($tr.attr('id') ? $tr.attr('id').replace(/\D/g, '') : null);
        if (!reservationId) return console.error('No reservation id');

        const url = $btn.data('move-url') || $btn.attr('href') || `/reservation/${reservationId}/move-to-requests/`;

        $btn.prop('disabled', true).addClass('disabled');

        postJSON(url, {})
        .then(data => {
            const reservationData = data.reservation || data.upcoming || data;
            if (reservationData && reservationData.id) {
                // suppress ws for this id
                
                 // Set last-updated timestamp from server (prevents stale WS updates)
                if (reservationData.updated_at) {
                    _lastUpdated.set(String(reservationData.id), Date.parse(reservationData.updated_at));
                }
                            
                suppressWsFor(reservationData.id, 3000);

                const specialDt = initializeDataTable('#specialTable');
                if (specialDt) {
                    specialDt.row($tr.get(0)).remove().draw(false);
                } else {
                    $tr.remove();
                }

                // Force target upcoming table
                if (!$('#upcomingTable').length) {
                    createTable('#requests h2:contains("📝 Pending Reservation Requests")', 'upcomingTable');
                }

                // Render and insert to upcoming table
                // Ensure the reservationData has status 'pending'
                reservationData.status = reservationData.status || 'pending';
                upsertReservationRow(reservationData);
            } else {
                console.warn('Unexpected response from move-to-requests:', data);
                if ($tr.closest('body').length) $btn.prop('disabled', false).removeClass('disabled');
            }
        })
        .catch(err => {
            console.error('Error moving reservation to requests', err);
            if ($tr.closest('body').length) $btn.prop('disabled', false).removeClass('disabled');
        });
    });

    // =======================================================
    // UPDATE ARRIVAL (checked-in / no-show)
    // Expect server to return the updated reservation JSON
    // =======================================================
    $(document).on('click', '#specialTable .btn-update-arrival', function(e){
        e.preventDefault();
        const $btn  = $(this);
        const $tr   = $btn.closest('tr');
        const reservationId = $tr.data('reservation-id') || ($tr.attr('id') ? $tr.attr('id').replace(/\D/g, '') : null);
        if (!reservationId) return console.error('No reservation id');

        const url = $btn.attr('href') || `/reservation/${reservationId}/update-arrival/${$btn.data('status')}/`;

        $btn.prop('disabled', true);

        fetch(url, {
            method: 'POST',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': getCookie('csrftoken'),
                'Content-Type': 'application/json'
            }
        })
        .then(resp => {
            if (!resp.ok) throw new Error('Network response was not ok');
            return resp.json();
        })
        .then(data => {
            const reservationData = data.reservation || data;
            if (!reservationData || !reservationData.id) {
                throw new Error('Unexpected JSON response from server');
            }

             // Set last-updated timestamp from server (prevents stale WS updates)
            if (reservationData.updated_at) {
                _lastUpdated.set(String(reservationData.id), Date.parse(reservationData.updated_at));
            }

            // Avoid double-applying WS updates while we handle the updated JSON
            suppressWsFor(reservationData.id, 3000);

            // Remove old row from specialTable then re-insert rendered row according to returned status
            const dt = initializeDataTable('#specialTable');
            if (dt) {
                dt.row($tr.get(0)).remove().draw(false);
            } else {
                $tr.remove();
            }

            upsertReservationRow(reservationData);
        })
        .catch(err => {
            console.error('Error updating arrival status (AJAX)', err);
        })
        .finally(() => {
            if ($tr.closest('body').length) $btn.prop('disabled', false);
        });
    });

    // =======================================================
    // POST JSON helper (used above)
    // =======================================================
    function postJSON(url, data = {}) {
        return fetch(url, {
            method: 'POST',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': getCookie('csrftoken'),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        }).then(resp => {
            if (!resp.ok) throw resp;
            return resp.json();
        });
    }

    // =======================================================
    // TABS NAVIGATION & ANALYTICS (unchanged logic, only kept)
    // =======================================================
    
    let plotlyLoaded = false;

    function loadPlotly(callback) {
        if (plotlyLoaded) {
            callback && callback();
            return;
        }

        const script = document.createElement('script');
        script.src = "https://cdn.plot.ly/plotly-basic-latest.min.js"; // use lightweight build
        script.onload = () => {
            plotlyLoaded = true;
            callback && callback();
        };
        script.onerror = () => console.error("Failed to load Plotly.js");
        document.head.appendChild(script);
    }
    
    $('.tabs button').on('click', function () {
        const tabId = $(this).data('tab');
        $('.tabs button').removeClass('active');
        $('.tab-content > div, #analytics-tab').removeClass('active');
        $(this).addClass('active');
        if (tabId === 'analytics') {
            $('#analytics-tab').addClass('active');
            loadPlotly(() => {
                loadAnalyticsPartial(
                    $('#venue-dashboard').data('venue-id'),
                    $('#group').val() || 'daily'
                );
            });
        } else {
            $('#' + tabId).addClass('active');
        }
    });

    $(document).on('change', '#group', function () {
        loadAnalyticsPartial($('#venue-dashboard').data('venue-id'), $(this).val());
    });

    function loadAnalyticsPartial(venueId, grouping = 'daily') {
        fetch(`/venues/${venueId}/analytics/partial/?group=${grouping}`, {
            headers: { "X-Requested-With": "XMLHttpRequest" }
        })
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
        })
        .then(data => {
            $('#total-visits').text(data.total_visits);
            $('#avg-daily-visits').text(data.avg_daily_visits);
            $('#peak-visits').text(data.peak_visits);
            $('#total-reservations').text(data.total_reservations);

            const figure = (typeof data.figure === 'string') ? JSON.parse(data.figure) : data.figure;
            Plotly.newPlot('analytics-chart', figure.data, figure.layout, data.config || {});
        })
        .catch(err => {
            console.error('Error loading analytics:', err);
            $('#analytics-chart').html('<div class="alert alert-warning">Failed to load analytics data.</div>');
        });
    }

    if ($('#analytics-tab').hasClass('active')) {
        loadAnalyticsPartial($('#venue-dashboard').data('venue-id'), $('#group').val() || 'daily');
    }

    // =======================================================
    // WEBSOCKET - expects typed JSON messages only (no HTML)
    // Example event shape:
    // { "event": "reservation.updated", "reservation": {...} }
    // or an array of such objects
    // =======================================================
    const notificationBadge = document.getElementById('notification-badge');
    
    function markReservationUnseen(reservationId) {
        if (!reservationId) return;
        unseenReservations.add(String(reservationId));
        updateNotificationBadge();
    }

    function markReservationSeen(reservationId) {
        if (!reservationId) return;
        unseenReservations.delete(String(reservationId));
        updateNotificationBadge();
    }

    function updateNotificationBadge() {
        if (!notificationBadge) return;
        const count = unseenReservations.size;
        if (count > 0) {
            notificationBadge.textContent = count;
            notificationBadge.style.display = 'inline-block';
            notificationBadge.classList.remove('pop');
            void notificationBadge.offsetWidth;
            notificationBadge.classList.add('pop');
        } else {
            notificationBadge.style.display = 'none';
        }
    }    
    
    const venueId           = document.getElementById('venue-dashboard').dataset.venueId;
    let unreadCount         = 0;
    const wsScheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket   = new WebSocket(`${wsScheme}://${window.location.host}/ws/notifications/${venueId}/`);

    socket.onopen  = ()  => console.log('WS connected');
    socket.onclose = (e) => console.warn('WS closed', e);
    socket.onerror = (e) => console.error('WS error', e);

    socket.onmessage = function (e) {
        let payload;
        try {
            payload = JSON.parse(e.data);
        } catch (err) {
            console.error('WS JSON parse error:', err);
            return;
        }

        // Normalize to an array for uniform handling
        const messages = Array.isArray(payload) ? payload : [payload];

        messages.forEach(msg => {
            // Expect server to send a typed event and reservation JSON
            const reservation = msg.reservation || msg.data || null;
            const eventType = msg.event || msg.type || '';

            if (!reservation || !reservation.id) {
                // nothing to render; skip
                return;
            }

            // Skip processing if we recently updated this reservation locally
            if (isSuppressed(reservation.id)) {
                console.debug(`Skipping WS update for recently-updated reservation ${reservation.id}`);
                return;
            }

            // Update unread count & badge
            unreadCount++;
            if (notificationBadge) {
                notificationBadge.textContent   = unreadCount;
                notificationBadge.style.display = 'inline-block';
                notificationBadge.classList.remove('pop');
                void notificationBadge.offsetWidth;
                notificationBadge.classList.add('pop');
            }

            if (!shouldApplyUpdate(reservation)) {
                console.debug(`Dropping stale WS update for ${reservation.id}`);
                return;
            }

            // For event-specific logic you may branch by eventType if needed
            // For now, for any reservation data we upsert into proper table
            if (reservation.status === 'pending') {
                upsertReservationRow(reservation);
                markReservationUnseen(reservation.id);
            }
        });
    };

    if ($('#analytics-tab').hasClass('active')) {
        loadPlotly(() => {
            loadAnalyticsPartial($('#venue-dashboard').data('venue-id'), $('#group').val() || 'daily');
        });
    }

    $(document).on('mouseenter', '#upcomingTable tbody tr', function () {
        const reservationId = $(this).data('reservation-id');
        markReservationSeen(reservationId);
    });


});
