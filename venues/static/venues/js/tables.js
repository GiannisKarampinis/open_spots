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
    if (!isExistingRow && tableSelector === '#upcomingTable') {
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
