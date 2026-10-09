function initButtonsAcceptRejectActionsOnUpcomingTableRow() {

    // When a venue admin hits: ACCEPT or REJECT we support event delegation on the upcomingTable
    // rows' buttons. So the first function that will be called is this one.
    // It gets the required data from the row's html and based on those sends 
    // a POST request to the server to update the reservation status (Accepted/Rejected).
    $(document).on('click', '#upcomingTable .btn-accept-reservation, #upcomingTable .btn-reject-reservation', function(e){
        e.preventDefault();

        const $btn          = $(this);
        const url           = $btn.attr('href');
        const $row          = $btn.closest('tr');
        const reservationId = $row.data('reservation-id');
        
        // Fallback checks
        if(!reservationId || !url) return console.error('Missing reservation id or URL');
        
        // UI feedback: disable button and show loading state
        $btn.prop('disabled', true).addClass('loading');

        fetch(url,{
            method:     'POST',
            headers:    {
                'X-CSRFToken':      getCookie('csrftoken'),
                'X-Requested-With': 'XMLHttpRequest',
                // 'Content-Type':     'application/json'  // To be removed
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
}