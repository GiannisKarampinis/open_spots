document.addEventListener('DOMContentLoaded', () => {

    // =======================================================
    // HELPER FUNCTIONS
    // =======================================================

    // 1a. CSRF cookie extractor
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

    // 1b. Table creation
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
        initializeDataTable(`#${tableId}`); // initialize immediately with correct sorting
    }

    // 1c. Table initialization
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

        // Move controls immediately after initialization
        $('#upcoming-show-entries-wrapper').append($('#upcomingTable_length').detach());
        $('#upcoming-search-wrapper').append($('#upcomingTable_filter').detach());
        $('#history-show-entries-wrapper').append($('#pastTable_length').detach());
        $('#history-search-wrapper').append($('#pastTable_filter').detach());
        $('#special-show-entries-wrapper').append($('#specialTable_length').detach());
        $('#special-search-wrapper').append($('#specialTable_filter').detach());
    }

    // 1d. Add row to table
    function addRowToTable(tableSelector, rowHtml, isExistingRow = false) {
        const table = initializeDataTable(tableSelector);
        const $row = $(rowHtml);
        const trNode = $row.get(0);

        if (!trNode || trNode.nodeName !== 'TR') {
            console.error('addRowToTable: rowHtml did not produce a <tr> node', rowHtml);
            return null;
        }

        // Ensure Date and Time have data-order for proper sorting
        $row.find('td').each(function(index) {
            const $cell = $(this);

            // Column 1: Date (YYYY-MM-DD)
            if (index === 1 && !$cell.attr('data-order')) {
                const rawDate = $cell.text().trim();
                if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
                    $cell.attr('data-order', rawDate);
                }
            }

            // Column 2: Time (HH:MM:SS)
            if (index === 2 && !$cell.attr('data-order')) {
                const rawTime = $cell.text().trim();
                if (/^\d{2}:\d{2}(:\d{2})?$/.test(rawTime)) {
                    // Drop seconds if present → use HH:MM for stable ordering
                    const hhmm = rawTime.substring(0,5);
                    $cell.attr('data-order', hhmm);
                }
            }
        });

        // Add the row to DataTable
        const newRowNode = table.row.add($row.get(0)).draw(false).node();

        // Highlight new/updated row
        // $(newRowNode).addClass(isExistingRow ? 'updated-row' : 'new-row');
        // setTimeout(() => {
        //     $(newRowNode).removeClass('new-row updated-row');
        // }, 10000);

        // Force table to sort by Date (col 1) desc, then Time (col 2) desc
        table.order([[1, 'desc'], [2, 'desc']]).draw();

        return newRowNode;
    }

    // =======================================================
    // INITIALIZE EXISTING TABLES
    // =======================================================
    ['#upcomingTable', '#pastTable', '#specialTable'].forEach(selector => {
        if ($(selector).length) {
            initializeDataTable(selector);
        }
    });

   initAllTables();

    // =======================================================
    // RESERVATION REQUESTS - ACTION BUTTONS: ACCEPT/REJECT
    // =======================================================
    $(document).on('click', '#upcomingTable .btn-accept-reservation, #upcomingTable .btn-reject-reservation', function (e) {
        e.preventDefault();
        const $btn = $(this);
        const url = $btn.attr('href');
        const $row = $btn.closest('tr');

        const rowId = $row.attr('id');
        const reservationId = $row.data('reservation-id') || (rowId ? rowId.replace(/\D/g, '') : null);
        if (!reservationId) {
            console.error("Could not find reservation ID from row");
            return;
        }

        // Disable UI
        $btn.prop('disabled', true).addClass('loading');

        fetch(url, {
            method: "POST",
            headers: {
                "X-CSRFToken": getCookie("csrftoken"),
                "X-Requested-With": "XMLHttpRequest"
            }
        })
        .then(response => {
            const contentType = response.headers.get("content-type") || "";
            if (!response.ok) {
                if (contentType.includes("application/json")) {
                    return response.json().then(err => { throw new Error(err.error || "Status update failed"); });
                } else {
                    return response.text().then(html => { throw new Error("Server error:\n" + html); });
                }
            }
            return response.json(); // only if success + JSON
        })
        .then(data => {
            // Remove the row from current table
            const oldTable = initializeDataTable('#upcomingTable');
            if (oldTable && $row.length) {
                oldTable.row($row.get(0)).remove().draw(false);
            } else {
                $row.remove();
            }

            // Ensure specialTable exists
            if (!$('#specialTable').length) {
                createTable('#requests h2:contains("🚪 Guest Arrivals")', 'specialTable');
            }

            // Fetch the rendered row partial from Django
            return fetch(`/venues/arrival-row/${data.id}/`); 
        })
        .then(res => {
            if (!res.ok) throw new Error("Failed to load row partial");
            return res.text();
        })
        .then(rowHtml => {
                // Step 5: Insert the rendered row HTML
                addRowToTable('#specialTable', rowHtml, false);
        })
        .catch(err => {
            console.error("Error updating reservation:", err.message);
            $btn.prop('disabled', false).removeClass('loading');
        });

    });


    // =======================================================
    // 4. TABS NAVIGATION
    // =======================================================
    $('.tabs button').on('click', function () {
        const tabId = $(this).data('tab');

        $('.tabs button').removeClass('active');
        $('.tab-content > div, #analytics-tab').removeClass('active');

        $(this).addClass('active');
        if (tabId === 'analytics') {
            $('#analytics-tab').addClass('active');
            loadAnalyticsPartial($('#venue-dashboard').data('venue-id'), $('#group').val() || 'daily');
        } else {
            $('#' + tabId).addClass('active');
        }
    });


    // --- Suppress WS messages for recent local updates to avoid race conditions ---
    const _recentLocalUpdates = new Map(); // reservationId -> expiry timestamp (ms)
    function suppressWsFor(reservationId, ms = 3000) {
        const expiry = Date.now() + ms;
        _recentLocalUpdates.set(String(reservationId), expiry);
        setTimeout(() => {
            // cleanup in case expiry passed while tab was inactive
            if (_recentLocalUpdates.get(String(reservationId)) <= Date.now()) {
                _recentLocalUpdates.delete(String(reservationId));
            }
        }, ms + 100);
    }
    function isSuppressed(reservationId) {
        const v = _recentLocalUpdates.get(String(reservationId));
        return v && v > Date.now();
    }

    // =======================================================
    // 6. REAL-TIME NOTIFICATIONS (WebSocket)
    // =======================================================
    const venueId           = document.getElementById('venue-dashboard').dataset.venueId;
    const notificationBadge = document.getElementById('notification-badge');
    let unreadCount         = 0;

    const wsScheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket   = new WebSocket(`${wsScheme}://${window.location.host}/ws/notifications/${venueId}/`);

    socket.onopen  = ()  => console.log('WS connected');
    socket.onclose = (e) => console.warn('WS closed', e);
    socket.onerror = (e) => console.error('WS error', e);

    socket.onmessage = function (e) {
        let messages;
        try {
            messages = JSON.parse(e.data);
        } catch (err) {
            console.error('WS JSON parse error:', err);
            return;
        }

        messages.forEach((notification) => {
            
             // If this reservation was just updated locally, ignore WS updates for it briefly
            if (notification && notification.reservation_id && isSuppressed(notification.reservation_id)) {
                console.debug(`Skipping WS update for recently-updated reservation ${notification.reservation_id}`);
                return;
            }
            
            unreadCount++;
            notificationBadge.textContent   = unreadCount;
            notificationBadge.style.display = 'inline-block';

            if (notification && notification.html) {
                const rowId     = `reservation-row-${notification.reservation_id}`;
                const existing  = document.getElementById(rowId);

                let targetTableId;
                if (notification.reservation_status === 'pending') {
                    targetTableId     = '#upcomingTable';
                } else {
                    targetTableId     = '#specialTable';
                }

                if (!$(targetTableId).length) {
                    createTable('h2.mt-4:contains("📝 Pending Reservation Requests")', targetTableId.replace('#',''));
                }

                if (existing) {
                    const oldTable = initializeDataTable(targetTableId);
                    oldTable.row(existing).remove().draw(false);
                }

                addRowToTable(targetTableId, notification.html, !!existing);
            }
        });

        notificationBadge.classList.remove('pop');
        void notificationBadge.offsetWidth;
        notificationBadge.classList.add('pop');
    };

    // =======================================================
    // 5. ANALYTICS GROUPING
    // =======================================================
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

    // Move reservation back to requests (from specialTable -> upcomingTable)
    $(document).on('click', '#specialTable .btn-edit-status', function(e) {
        e.preventDefault();
        const $btn = $(this);
        const $tr = $btn.closest('tr');
        const reservationId = $tr.data('reservation-id') || ($tr.attr('id') ? $tr.attr('id').replace(/\D/g, '') : null);
        if (!reservationId) return console.error('No reservation id');

        // Prefer data-move-url (non-destructive fallback set in template)
        const url = $btn.data('move-url') || $btn.attr('href') || `/reservations/${reservationId}/move-to-requests/`;

        // Optimistic UI: disable button
        $btn.prop('disabled', true).addClass('disabled');

        postJSON(url, {})
        .then(data => {
            if (data && data.upcoming_row) {
                const specialDt = initializeDataTable('#specialTable');
                if (specialDt) {
                    specialDt.row($tr.get(0)).remove().draw(false);
                } else {
                    $tr.remove();
                }

                // Ensure upcoming table exists
                if (!$('#upcomingTable').length) {
                    createTable('#requests h2:contains("📝 Pending Reservation Requests")', 'upcomingTable');
                }

                // Insert incoming row html into upcoming table
                addRowToTable('#upcomingTable', data.upcoming_row, false);
            } else {
                console.warn('Unexpected response from move-to-requests:', data);
                // Re-enable only if row still present
                if ($tr.closest('body').length) $btn.prop('disabled', false).removeClass('disabled');
            }
        })
        .catch(err => {
            console.error('Error moving reservation to requests', err);
            // Re-enable
            if ($tr.closest('body').length) $btn.prop('disabled', false).removeClass('disabled');
        });
    });

    // =======================================================
    // GUEST ARRIVALS - ACTION BUTTONS: CHECKED-IN/NO-SHOW
    // =======================================================
    $(document).on('click', '#specialTable .btn-update-arrival', function(e){
        e.preventDefault();
        const $btn  = $(this);
        const $tr   = $btn.closest('tr');
        const reservationId = $tr.data('reservation-id') || ($tr.attr('id') ? $tr.attr('id').replace(/\D/g, '') : null);
        if (!reservationId) return console.error('No reservation id');

        // Button href should be something like /reservations/<id>/update-arrival/checked_in/
        const url = $btn.attr('href') || `/reservation/${reservationId}/update-arrival/${$btn.data('status')}/`;

        // disable UI while request is ongoing
        $btn.prop('disabled', true);

        // Step 1: Update arrival status via JSON
        fetch(url, {
            method: 'POST',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': getCookie('csrftoken')
            }
        })
        .then(response => {
            if (!response.ok) throw new Error('Network response was not ok');
            return response.json();
        })
        .then(data => {
            if (data && data.id) {
                suppressWsFor(data.id, 3000); // 3s suppression - adjust as needed

                // Step 2: remove old row
                const dt = initializeDataTable('#specialTable');
                if (dt) {
                    dt.row($tr.get(0)).remove().draw(false);
                } else {
                    $tr.remove();
                }

                // Step 3: fetch fresh row HTML from Django partial
                return fetch(`/venues/arrival-row/${data.id}/`);
            } else {
                throw new Error('Unexpected JSON response from server');
            }
        })
        .then(res => {
            if (!res.ok) throw new Error('Failed to fetch arrival row partial');
            return res.text();
        })
        .then(rowHtml => {
            // Step 4: insert updated row
            addRowToTable('#specialTable', rowHtml, true);
        })
        .catch(err => {
            console.error('Error updating arrival status (AJAX)', err);
        })
        .finally(() => {
            // If the row still exists in DOM or the button is visible, re-enable
            if ($tr.closest('body').length) $btn.prop('disabled', false);
        });
    });
});
