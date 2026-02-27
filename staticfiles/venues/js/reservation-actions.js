// reservation-actions.js
// import { getCookie, suppressWsFor, _lastUpdated } from './utils.js';
// import { upsertReservationRow, initializeDataTable } from './tables.js';
// import { postJSON } from './utils.js';

function initReservationActions() {

    // ACCEPT / REJECT
    $(document).on('click', '#upcomingTable .btn-accept-reservation, #upcomingTable .btn-reject-reservation', function(e){
        e.preventDefault();
        const $btn=$(this);
        const url=$btn.attr('href');
        const $row=$btn.closest('tr');
        const reservationId=$row.data('reservation-id');
        if(!reservationId || !url) return console.error('Missing reservation id or URL');
        $btn.prop('disabled', true).addClass('loading');

        fetch(url,{
            method:'POST',
            headers:{
                'X-CSRFToken': getCookie('csrftoken'),
                'X-Requested-With':'XMLHttpRequest',
                'Content-Type':'application/json'
            }
        })
        .then(resp=>{
            if(!resp.ok) return resp.json().then(err=>{throw new Error(err.error||'Status update failed')}).catch(()=>{throw new Error('Server error')});
            return resp.json();
        })
        .then(data=>{
            const reservationData=data.reservation||data;
            
            if (!reservationData||!reservationData.id) {
                throw new Error('Server did not return reservation JSON');
            }

            if(reservationData.updated_at)
                _lastUpdated.set(String(reservationData.id), Date.parse(reservationData.updated_at));

            suppressWsFor(reservationData.id,3000);

            const dt = initializeDataTable('#upcomingTable');
            
            if (dt) {
                dt.row($row.get(0)).remove().draw(false);
            } else {
                $row.remove();
            }

            upsertReservationRow(reservationData);
        })
        .catch(err=>{
            console.error("Error updating reservation:",err);
            $btn.prop('disabled',false).removeClass('loading');
        });
    });

    // MOVE BACK TO REQUESTS
    $(document).on('click', '#specialTable .btn-edit-status', function(e){
        e.preventDefault();
        const $btn=$(this);
        const $tr=$btn.closest('tr');
        const reservationId=$tr.data('reservation-id');
        if(!reservationId) return console.error('No reservation id');
        
        const url=$btn.data('move-url')||$btn.attr('href')||`/reservation/${reservationId}/move-to-requests/`;
        
        $btn.prop('disabled', true).addClass('disabled');

        postJSON(url,{}).then(data=>{
            const reservationData=data.reservation||data.upcoming||data;
            if (reservationData && reservationData.id) {
                if (reservationData.updated_at)
                    _lastUpdated.set(String(reservationData.id), Date.parse(reservationData.updated_at));

                suppressWsFor(reservationData.id,3000);

                const specialDt=initializeDataTable('#specialTable');
                
                if (specialDt) {
                    specialDt.row($tr.get(0)).remove().draw(false);
                } else {
                    $tr.remove();
                }

                if (!$('#upcomingTable').length) {
                    upsertReservationRow({status:'pending'}); // create table if missing
                }
                
                reservationData.status = reservationData.status||'pending';
                upsertReservationRow(reservationData);
            } else {
                console.warn('Unexpected response from move-to-requests', data);
                $btn.prop('disabled',false).removeClass('disabled');
            }
        }).catch(err=>{
            console.error('Error moving reservation to requests', err);
            $btn.prop('disabled',false).removeClass('disabled');
        });
    });

    // UPDATE ARRIVAL (CHECKED-IN / NO-SHOW)
    $(document).on('click', '#specialTable .btn-update-arrival', function(e){
        e.preventDefault();
        const $btn=$(this);
        const $tr=$btn.closest('tr');
        const reservationId=$tr.data('reservation-id');
        if(!reservationId) return console.error('No reservation id');
        const url=$btn.attr('href')||`/reservation/${reservationId}/update-arrival/${$btn.data('status')}/`;

        $btn.prop('disabled', true);

        fetch(url,{
            method:'POST',
            headers:{
                'X-Requested-With':'XMLHttpRequest',
                'X-CSRFToken':getCookie('csrftoken'),
                'Content-Type':'application/json'
            }
        }).then(resp=>{
            if(!resp.ok) throw new Error('Network response not ok');
            return resp.json();
        }).then(data=>{
            const reservationData=data.reservation||data;
            if(!reservationData||!reservationData.id) throw new Error('Unexpected JSON response from server');
            if(reservationData.updated_at)
                _lastUpdated.set(String(reservationData.id), Date.parse(reservationData.updated_at));
            suppressWsFor(reservationData.id,3000);

            const dt=initializeDataTable('#specialTable');
            if(dt) dt.row($tr.get(0)).remove().draw(false);
            else $tr.remove();

            upsertReservationRow(reservationData);
        }).catch(err=>{ console.error('Error updating arrival status', err); })
        .finally(()=>{ if($tr.closest('body').length) $btn.prop('disabled',false); });
    });
}
