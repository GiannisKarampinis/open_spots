function initWebSocket(venueId){
    if (!venueId) return console.error('No venueId for WS');

    const wsScheme  =   window.location.protocol==='https:'?'wss':'ws';
    const socket    =   new WebSocket(`${wsScheme}://${window.location.host}/ws/notifications/${venueId}/`);

    socket.onopen=()=>console.log('WS connected');
    socket.onclose=(e)=>console.warn('WS closed',e);
    socket.onerror=(e)=>console.error('WS error',e);

    socket.onmessage=function(e){
        let payload;
        try{ payload=JSON.parse(e.data); } catch(err){ console.error('WS JSON parse error',err); return; }
        const messages=Array.isArray(payload)?payload:[payload];

        messages.forEach(msg=>{
            const reservation=msg.reservation||msg.data||null;
            if(!reservation||!reservation.id) return;
            if(isSuppressed(reservation.id)){
                console.debug(`Skipping WS update for ${reservation.id}`);
                return;
            }

            if(!shouldApplyUpdate(reservation)){
                console.debug(`Dropping stale WS update for ${reservation.id}`);
                return;
            }

            if(reservation.status==='pending' || reservation.status==='confirmed' || reservation.status==='cancelled') {
                upsertReservationRow(reservation);
                if ((reservation.status || '').toLowerCase() === 'pending') {
                    markReservationUnseen(reservation.id);
                } else {
                    markReservationSeen(reservation.id);
                }
            }
        });
    };
}
