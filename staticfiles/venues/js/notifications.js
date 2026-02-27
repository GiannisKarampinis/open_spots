// notifications.js
const unseenReservations = new Set();

function markReservationUnseen(reservationId){
    if(!reservationId) return;
    unseenReservations.add(String(reservationId));
    updateNotificationBadge();
}

function markReservationSeen(reservationId){
    if(!reservationId) return;
    unseenReservations.delete(String(reservationId));
    updateNotificationBadge();
}

function updateNotificationBadge(){
    const badge=document.getElementById('notification-badge');
    if(!badge) return;
    const count=unseenReservations.size;
    if(count>0){
        badge.textContent=count;
        badge.style.display='inline-block';
        badge.classList.remove('pop');
        void badge.offsetWidth;
        badge.classList.add('pop');
    } else badge.style.display='none';
}

// Mark as seen on hover
function initBadgeHover(){
    $(document).on('mouseenter','#upcomingTable tbody tr',function(){
        const reservationId=$(this).data('reservation-id');
        markReservationSeen(reservationId);
    });
}
