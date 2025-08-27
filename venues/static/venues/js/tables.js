// tables.js
// import { formatDateDisplay, formatTimeDisplay, escapeHtml, capitalize } from './utils.js';

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

function renderRowFromData(data){
    if(!data||!data.id) return '';
    const id=data.id;
    const customer=data.customer_name||(data.customer&&data.customer.name)||data.customer||'—';
    const dateISO=data.date||data.reservation_date||'';
    const timeRaw=data.time||data.reservation_time||'';
    const party=(data.party_size!==undefined&&data.party_size!==null)?data.party_size:(data.party||'');
    const status=(data.status||data.reservation_status||'').toLowerCase();
    const arrivalStatusRaw=(data.arrival_status||'').toLowerCase();
    const isArrival=!!data.is_arrival||['checked_in','no_show'].includes(status)||status==='accepted';
    const dateDisplay=formatDateDisplay(dateISO);
    const timeDisplay=formatTimeDisplay(timeRaw);
    const dateDataOrder=dateISO||'';
    const timeDataOrder=(timeRaw&&/^\d{2}:\d{2}(:\d{2})?$/.test(timeRaw))?timeRaw.substring(0,5):(timeRaw||'');
    const displayStatus=isArrival?(arrivalStatusRaw||'pending'):(status||'unknown');

    let badgeClasses='badge ';
    if(displayStatus==='pending') badgeClasses+='bg-warning text-dark';
    else if(displayStatus==='accepted') badgeClasses+='bg-success';
    else if(displayStatus==='checked_in') badgeClasses+='bg-success';
    else if(displayStatus==='no_show') badgeClasses+='bg-danger';
    else badgeClasses+='bg-danger';

    const statusLabel=(displayStatus||'unknown').replace('_',' ');

    const urls=data.urls||{};
    const acceptUrl=urls.accept||`/reservation/${id}/status/accepted/`;
    const rejectUrl=urls.reject||`/reservation/${id}/status/rejected/`;
    const moveUrl=urls.move||`/reservation/${id}/move-to-requests/`;
    const checkInUrl=urls.checkin||`/reservation/${id}/update-arrival/checked_in/`;
    const noShowUrl=urls.no_show||urls.noshow||`/reservation/${id}/update-arrival/no_show/`;
    const editHref=urls.edit||`/reservation/${id}/edit-status/`;

    let actionsHtml='';
    if(status==='pending'){
        actionsHtml=`<a href="${acceptUrl}" class="btn btn-success btn-sm me-1 btn-accept-reservation" data-status="accepted">✅ Accept</a>
                     <a href="${rejectUrl}" class="btn btn-danger btn-sm btn-reject-reservation" data-status="rejected">❌ Reject</a>`;
    } else {
        const arrivalSet=['pending','checked_in','no_show'];
        const showArrivalButtons=(status==='accepted' && arrivalStatusRaw==='pending');
        let btns='';
        if(showArrivalButtons){
            btns+=`<a href="${checkInUrl}" class="btn btn-success btn-sm me-1 btn-update-arrival" data-status="checked_in">✅ Checked-in</a>
                   <a href="${noShowUrl}" class="btn btn-danger btn-sm btn-update-arrival" data-status="no_show">❌ No-show</a>`;
        }
        btns+=`<a href="${editHref}" data-move-url="${moveUrl}" class="btn btn-sm btn-edit-status">Move to Requests</a>`;
        actionsHtml=btns;
    }

    return `<tr id="reservation-row-${id}" data-reservation-id="${id}">
                <td>${escapeHtml(customer)}</td>
                <td data-order="${escapeHtml(dateDataOrder)}">${escapeHtml(dateDisplay)}</td>
                <td data-order="${escapeHtml(timeDataOrder)}">${escapeHtml(timeDisplay)}</td>
                <td>${escapeHtml(String(party))}</td>
                <td><span class="${badgeClasses}">${escapeHtml(capitalize(statusLabel))}</span></td>
                <td>${actionsHtml}</td>
            </tr>`;
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
