// notifications.js
function updateNotificationBadge(){
    const badge = document.getElementById('notification-badge');
    if (!badge) return;

    let count = 0;
    document.querySelectorAll('#upcomingTable tbody tr[data-reservation-id]').forEach((row) => {
        const isUnseen = String(row.dataset.seen) === 'false';
        row.classList.toggle('unseen-reservation', isUnseen);
        if (isUnseen) count += 1;
    });

    if (count > 0) {
        badge.textContent = count;
        badge.style.display = 'inline-block';
        badge.classList.remove('pop');
        void badge.offsetWidth;
        badge.classList.add('pop');
    } else {
        badge.style.display = 'none';
    }
}

function markReservationUnseen(reservationId){
    if (!reservationId) return;
    const row = document.getElementById(`reservation-row-${reservationId}`);
    if (row) row.dataset.seen = 'false';
    updateNotificationBadge();
}

function markReservationSeen(reservationId){
    if (!reservationId) return;
    const row = document.getElementById(`reservation-row-${reservationId}`);
    if (row) row.dataset.seen = 'true';
    updateNotificationBadge();
}

function initBadgeHover(){
    updateNotificationBadge();
    $(document).on('draw.dt', '#upcomingTable', function () {
        updateNotificationBadge();
    });
}
