function initButtonsCheckedInNoShowActionsOnSpecialTableRow() {

    // When a venue admin hits: CHECKED-IN or NO-SHOW we support event delegation on the specialTable
    // rows' buttons. So the first function that will be called is this one.
    // It gets the required data from the row's html and based on those sends 
    // a POST request to the server to update the reservation arrival status (Checked-In/No-Show).
    $(document).on('click', '#specialTable .btn-update-arrival', function(e){
        e.preventDefault();
        
        const $btn          =   $(this);
        const $tr           =   $btn.closest('tr');
        const reservationId =   $tr.data('reservation-id');
        
        if(!reservationId) return console.error('No reservation id');
        
        const url           =   $btn.attr('href') || `/reservation/${reservationId}/update-arrival/${$btn.data('status')}/`;

        $btn.prop('disabled', true);

        fetch(url,{
            method:'POST',
            headers:{
                'X-Requested-With':'XMLHttpRequest',
                'X-CSRFToken':getCookie('csrftoken'),
                // 'Content-Type':'application/json' // To be removed
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