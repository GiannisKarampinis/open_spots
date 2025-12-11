// Store initialized DataTables instances
const dataTables = {};

function initializeDataTable(tableSelector) {
    // Reuse existing instance
    if (dataTables[tableSelector]) return dataTables[tableSelector];

    const dt = $(tableSelector).DataTable({
        destroy:        true,
        lengthChange:   true,
        searching:      true,
        order: [
            [1, 'desc'], // date column
            [2, 'desc']  // time column
        ]
    });

    dataTables[tableSelector] = dt;
    return dt;
}

/**
 * Ensures every row has canonical sorting keys:
 *   - date column index 1  → YYYY-MM-DD
 *   - time column index 2  → HH:MM
 *
 * No parsing, no locale dependence.
 */
function ensureDataOrderAttributes($row) {
    $row.find('td').each(function (idx) {
        const $cell = $(this);

        // DATE column (index 1)
        if (idx === 1) {
            let rawDate = $cell.attr('data-order');
            if (!rawDate) {
                const text = $cell.text().trim();
                // Extract YYYY-MM-DD if present at start
                if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
                    rawDate = text.substring(0, 10);
                }
            }
            if (rawDate) $cell.attr('data-order', rawDate);
        }

        // TIME column (index 2)
        if (idx === 2) {
            let rawTime = $cell.attr('data-order');
            if (!rawTime) {
                const text = $cell.text().trim();
                if (/^\d{2}:\d{2}/.test(text)) {
                    rawTime = text.substring(0, 5);
                }
            }
            if (rawTime) $cell.attr('data-order', rawTime);
        }
    });
}

function addRowToTable(tableSelector, rowHtml, isExistingRow = false) {
    const table  = initializeDataTable(tableSelector);
    const $row   = $(rowHtml);
    const trNode = $row.get(0);

    if (!trNode || trNode.nodeName !== 'TR') {
        console.error('Row HTML invalid', rowHtml);
        return null;
    }

    ensureDataOrderAttributes($row);

    const newRowNode = table.row.add(trNode).draw(false).node();
    table.columns.adjust().draw(false);
    table.order([[1, 'desc'], [2, 'desc']]).draw(false);

    // Highlight only for new rows in upcoming table
    if (tableSelector === '#upcomingTable' && !isExistingRow) {
        const $new = $(newRowNode);
        $new.addClass('new-reservation flash-once');
        setTimeout(() => $new.removeClass('flash-once'), 2000);
        $new.on('mouseenter', () => $new.removeClass('new-reservation'));
    }

    return newRowNode;
}

function upsertReservationRow(reservationData) {
    if (!reservationData || !reservationData.id) return;

    const rowId = `reservation-row-${reservationData.id}`;
    const existing = document.getElementById(rowId);

    const status = (reservationData.status || reservationData.reservation_status || '').toLowerCase();
    const targetTableId = (status === 'pending')
        ? '#upcomingTable'
        : '#specialTable';

    if (existing) {
        const tableId = `#${$(existing).closest('table').attr('id')}`;
        const dt = initializeDataTable(tableId);
        dt.row(existing).remove().draw(false);
    }

    addRowToTable(targetTableId, renderRowFromData(reservationData), !!existing);
}

/**
 * NEW DATE FILTERING:
 * - No parsing
 * - No Date objects
 * - Uses canonical data-order keys (YYYY-MM-DD)
 */
function filterTableByDateRange(tableSelector, start, end) {
    const dt = initializeDataTable(tableSelector);
    if (!start || !end) return;

    // Convert selected dates into sortable YYYY-MM-DD keys
    const startKey = start.slice(0, 10);
    const endKey   = end.slice(0, 10);

    dt.rows().every(function () {
        const row = this.node();
        const dateCell = $(row).find('td').eq(1);
        const rowKey = dateCell.attr('data-order') || '';

        const isInRange = rowKey >= startKey && rowKey <= endKey;
        $(row).toggle(isInRange);
    });

    dt.draw(false);
}

function resetTableFilter(tableSelector) {
    const dt = initializeDataTable(tableSelector);
    $(dt.rows().nodes()).show();
    dt.draw(false);
}

// Dispatcher for tab-specific filtering
document.addEventListener('dateRangeSelected', function (e) {
    const { start, end, targetTab } = e.detail;

    if (targetTab === 'requestsTab') {
        filterTableByDateRange('#upcomingTable', start, end);
        filterTableByDateRange('#specialTable', start, end);
        return;
    }

    if (targetTab === 'historyTab') {
        if (!start || !end) resetTableFilter('#pastTable');
        else filterTableByDateRange('#pastTable', start, end);
    }
});
