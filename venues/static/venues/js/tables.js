// Store initialized DataTables instances (global cache)
const dataTables = {};


function initializeDataTable(tableSelector) {
// REVIEWED - OK
    // Reuse existing instance
    if (dataTables[tableSelector]) return dataTables[tableSelector];

    const dt = $(tableSelector).DataTable({
        destroy:        true, // allows re-initialization if needed (e.g. after dynamic content changes)
        lengthChange:   true,
        searching:      true,
        order: [
            [1, 'asc'], // date column
            [2, 'asc']  // time column
        ]
    }); // this wraps the <table> element with a DataTable instance object, which
        // injects a header/footer, search box, length dropdown, 
        // pagination controls, etc.
        // wires up sorting, filtering and paging logic.
        // DataTables enhance the original table.

    dataTables[tableSelector] = dt;
    return dt;
}


function ensureDataOrderAttributes($row) {
// REVIEWED - OK
    /**
     * Ensures every row has canonical sorting keys:
     *   - date column index 1  → YYYY-MM-DD
     *   - time column index 2  → HH:MM
     * No parsing, no locale dependence.
     */
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


function filterTableByDateRange(tableSelector, start, end) {    
// REVIEWED - OK
// Uses canonical data-order keys (YYYY-MM-DD) to filter rows without parsing date objects, ensuring consistent behavior regardless of locale or date format variations in the cell text.
    const dt = initializeDataTable(tableSelector);
    if (!start || !end) return;
 
    // support either ISO strings or actual Date objects
    if (start instanceof Date)  start = start.toISOString();
    if (end instanceof Date)    end   = end.toISOString();
    
    // Convert selected dates into sortable YYYY-MM-DD keys
    const startKey = start.slice(0, 10);
    const endKey   = end.slice(0, 10);

    dt.rows().every(function () {
        const row       = this.node();
        const dateCell  = $(row).find('td').eq(1);           // jQuerty: get 2nd column (0-indexed)
        const rowKey    = dateCell.attr('data-order') || '';   // reads the data-order attribute which contains the date in canonical YYYY-MM-DD format

        const isInRange = rowKey >= startKey && rowKey <= endKey;
        $(row).toggle(isInRange); // show if in range, hide if out of range
    });

    dt.draw(false); // redraw without resetting pagination
}


function resetTableFilter(tableSelector) {
// REVIEWED - OK
    const dt = initializeDataTable(tableSelector);

    $(dt.rows().nodes()).show(); // Show all rows

    dt.draw(false);
}


///////////////////////////////////////////////////////////////////////////////////////////////////////
//  HELPERS:
///////////////////////////////////////////////////////////////////////////////////////////////////////


function addRowToTable(tableSelector, rowHtml, isExistingRow = false) {
// REVIEWED - OK
    const table  = initializeDataTable(tableSelector); // Get the wrapped DataTable instance
    const $row   = $(rowHtml); // wrap the new row HTML in a jQuery object for manipulation
    const trNode = $row.get(0);

    if (!trNode || trNode.nodeName !== 'TR') {
        console.error('Row HTML invalid', rowHtml);
        return null;
    }

    ensureDataOrderAttributes($row); // it adds data-order attributes for date/time 
                                     // columns so sorting & filtering work later.

    const newRowNode = table.row.add(trNode).draw(false).node();
    table.columns.adjust().draw(false);
    table.order([[1, 'asc'], [2, 'asc']]).draw(false);

    // Highlight only for new rows in upcoming table. If the row was added to 
    // #upcomingTable and it wasn’t an update of an existing entry, we flash 
    // a yellow background briefly so the admin notices new requests.
    if (tableSelector === '#upcomingTable' && !isExistingRow) {
        const $new = $(newRowNode);
        $new.addClass('new-reservation flash-once');
        setTimeout(() => $new.removeClass('flash-once'), 2000);
        $new.on('mouseenter', () => $new.removeClass('new-reservation'));
    }

    return newRowNode;
}


function upsertReservationRow(reservationData) {
// REVIEWED - OK
    if (!reservationData || !reservationData.id) return;

    const rowId         = `reservation-row-${reservationData.id}`;
    const existing      = document.getElementById(rowId);
    const status        = (reservationData.status || reservationData.reservation_status || '').toLowerCase();
    const targetTableId = (status === 'pending') ? '#upcomingTable' : '#specialTable';

    if (existing) {
        const tableId = `#${$(existing).closest('table').attr('id')}`;
        const dt = initializeDataTable(tableId);
        dt.row(existing).remove().draw(false);
    }

    addRowToTable(targetTableId, renderRowFromData(reservationData), !!existing);
}


///////////////////////////////////////////////////////////////////////////////////////////////////////
//  EVENT LISTENERS:
///////////////////////////////////////////////////////////////////////////////////////////////////////


document.addEventListener('dateRangeSelected', function (e) {
// REVIEWED - OK
    // Catches the custom event dispatched by the Flatpickr 
    // onChange handler in date-range-picker.js
    
    const { start, end, targetTab } = e.detail;

    console.assert(targetTab === 'requestsTab' || targetTab === 'historyTab',
        "Unknown targetTab value provided in dispatchedEvent named \
        'dateRangeSelected' → expected 'requestsTab' or 'historyTab', got: " + targetTab,
    );

    if (targetTab === 'requestsTab') {
        if (start && end) { // empty range = show everything again
            filterTableByDateRange('#upcomingTable', start, end);
            filterTableByDateRange('#specialTable', start, end);
        } else {
            resetTableFilter('#upcomingTable');
            resetTableFilter('#specialTable');
        }
    } else if (targetTab === 'historyTab') {
        if (start && end) {
            filterTableByDateRange('#pastTable', start, end);
        } else {
            resetTableFilter('#pastTable');
        }
    }
});