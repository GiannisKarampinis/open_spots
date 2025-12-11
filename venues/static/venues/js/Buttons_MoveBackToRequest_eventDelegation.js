function initButtonsMoveBackToRequestsActionOnSpecialTableRow() {

    // When a venue admin hits: MOVE BACK TO REQUESTS we support event delegation on the specialTable
    // rows' buttons. So the first function that will be called is this one.
    // It gets the required data from the row's html and based on those sends 
    // a POST request to the server to update the reservation status back to 'pending'.
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

                // To be removed:
                // if (!$('#upcomingTable').length) {
                //     upsertReservationRow({status:'pending'}); // create table if missing
                // }
                
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
}