function initializeDataTable(tableSelector) {
    if ($.fn.DataTable.isDataTable(tableSelector)) {
        return $(tableSelector).DataTable();
    }
    return $(tableSelector).DataTable({
        destroy:        true,
        lengthChange:   true,
        searching:      true,
        order: [
            [1,'desc'],
            [2,'desc']
        ]
    });
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

function ensureDataOrderAttributes($row){
    $row.find('td').each(function(idx){
        const $cell = $(this);
        
        if (idx === 1 && !$cell.attr('data-order')) {
            const rawDate=$cell.text().trim();
            if(/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
                $cell.attr('data-order',rawDate);
            } 
        }

        if (idx === 2 && !$cell.attr('data-order')) {
            const rawTime=$cell.text().trim();
            if(/^\d{2}:\d{2}(:\d{2})?$/.test(rawTime)) {
                $cell.attr('data-order',rawTime.substring(0,5));
            }
        }
    });
}

function addRowToTable(tableSelector,rowHtml,isExistingRow=false) {
    const table     = initializeDataTable(tableSelector);
    const $row      = $(rowHtml);
    const trNode    = $row.get(0);

    if (!trNode || trNode.nodeName !== 'TR') { 
        console.error('Row HTML invalid',rowHtml); 
        return null; 
    }

    ensureDataOrderAttributes($row);
    
    const newRowNode=table.row.add($row.get(0)).draw(false).node();
    
    table.order([[1,'desc'],[2,'desc']]).draw();
    
    if (!isExistingRow && tableSelector === '#upcomingTable') {
        const $new  = $(newRowNode);
        
        $new.addClass('new-reservation flash-once');
        
        setTimeout(()=> $new.removeClass('flash-once'),2000);
        
        $new.on('mouseenter',()=> $new.removeClass('new-reservation'));
    }
    return newRowNode;
}

function upsertReservationRow(reservationData){
    if(!reservationData||!reservationData.id) return;
    const rowId     = `reservation-row-${reservationData.id}`;
    const existing  = document.getElementById(rowId);
    
    let targetTableId;
    const status=(reservationData.status||reservationData.reservation_status||'').toLowerCase();
    if(status==='pending') {
        targetTableId='#upcomingTable';
    } else {
        targetTableId='#specialTable';
    }

    if(!$(targetTableId).length){
        if(targetTableId==='#upcomingTable') {
            createTable('#requests h2:contains("📝 Pending Reservation Requests")','upcomingTable');
        } else {
            createTable('#requests h2:contains("🚪 Guest Arrivals")','specialTable');
        }
    }

    if (existing) {
        const $existing     =   $(existing);
        const parentTable   =   $existing.closest('table');
        
        if(parentTable.length){
            const dt=initializeDataTable(`#${parentTable.attr('id')}`);
            if(dt) {
                dt.row(existing).remove().draw(false);
            } else {
                $existing.remove();
            }
        } else {
            $existing.remove();
        }
    }
    addRowToTable(targetTableId,renderRowFromData(reservationData),!!existing);
}
