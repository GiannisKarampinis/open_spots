const dataTables = {};

function initializeDataTable(tableSelector) {
    if (dataTables[tableSelector]) return dataTables[tableSelector];

    const dt = $(tableSelector).DataTable({
        destroy:        true,
        lengthChange:   true,
        searching:      true,
        order: [
            [1,'desc'],
            [2,'desc']
        ]
    });

    dataTables[tableSelector] = dt;
    return dt;
}

function ensureDataOrderAttributes($row){
    $row.find('td').each(function(idx){
        const $cell = $(this);
        
        if (idx === 1 && !$cell.attr('data-order')) {
            const rawDate = $cell.text().trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
                $cell.attr('data-order', rawDate);
            }
        }

        if (idx === 2 && !$cell.attr('data-order')) {
            const rawTime = $cell.text().trim();
            if (/^\d{2}:\d{2}(:\d{2})?$/.test(rawTime)) {
                $cell.attr('data-order', rawTime.substring(0,5));
            }
        }
    });
}

function addRowToTable(tableSelector, rowHtml, isExistingRow=false) {
    const table = initializeDataTable(tableSelector);
    const $row = $(rowHtml);
    const trNode = $row.get(0);

    if (!trNode || trNode.nodeName !== 'TR') { 
        console.error('Row HTML invalid', rowHtml); 
        return null; 
    }

    ensureDataOrderAttributes($row);

    const newRowNode = table.row.add(trNode).draw(false).node();
    table.columns.adjust().draw(false);
    table.order([[1,'desc'], [2,'desc']]).draw();

    // Highlight only for upcoming reservations
    if (tableSelector === '#upcomingTable') { //!isExistingRow
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
    const targetTableId = status === 'pending' ? '#upcomingTable' : '#specialTable';

    // Remove existing row if found
    if (existing) {
        const dt = initializeDataTable(`#${$(existing).closest('table').attr('id')}`);
        if (dt) {
            dt.row(existing).remove().draw(false);
        } else {
            $(existing).remove();
        }
    }

    // Add the new/updated row
    addRowToTable(targetTableId, renderRowFromData(reservationData), !!existing);
}







function filterTableByDateRange(tableSelector, start, end) {
  console.log(`[filterTableByDateRange] Filtering table: ${tableSelector}`);
  console.log(`Start: ${start}, End: ${end}`);

  const dt = initializeDataTable(tableSelector);    // Ensure DataTable instance
  if (!start || !end) return;                       // Exit if no dates provided

  // Normalize start/end to cover full day
  const startDate = new Date(start);
  const endDate = new Date(end);
  startDate.setHours(0, 0, 0, 0);                   // Start of day
  endDate.setHours(23, 59, 59, 999);                // End of day

  dt.rows().every(function () {
    const row = this.node();                        // Get <tr> element
    const dateCell = $(row).find('td').eq(1);       // Assume column index 1 = Date
    if (!dateCell.length) return;

    const rawText = dateCell.text().trim();         // Get text content of the date cell
    const rowDate = parseRowDate(rawText);          // Parse into local Date
    if (!rowDate) return;                           // Skip unparseable rows

    rowDate.setHours(12, 0, 0, 0);                  // Normalize to noon to avoid timezone shifts

    // Check if the row date falls within the selected range
    const isInRange = rowDate >= startDate && rowDate <= endDate;
    
    $(row).toggle(isInRange);                       // Show/hide row based on filter

    console.log(`[filter] rowDate=${rowDate}, start=${startDate}, end=${endDate}, inRange=${isInRange}`);
  });

  dt.draw(false);                           // Redraw table without resetting paging
  console.log(`[filterTableByDateRange] Filter applied for ${tableSelector}`);
}

function resetTableFilter(tableSelector) {
  const dt = initializeDataTable(tableSelector);
  
  $(dt.rows().nodes()).show();
  
  dt.draw(false);

}

document.addEventListener('dateRangeSelected', function (e) {
    const { start, end, targetTab } = e.detail;
    let tableSelector;
    
    // Map each date picker tab to its table(s)
    if (targetTab === 'requestsTab') {
        // Apply same range filter to both current-request tables
        filterTableByDateRange('#upcomingTable', start, end);
        filterTableByDateRange('#specialTable', start, end);
        return; // we already handled both
    } else if (targetTab === 'historyTab') {
        tableSelector = '#pastTable';
    }

    if (!tableSelector) return;

    if (!start || !end) {
        resetTableFilter(tableSelector);
    } else {
        filterTableByDateRange(tableSelector, start, end);
    }
});
