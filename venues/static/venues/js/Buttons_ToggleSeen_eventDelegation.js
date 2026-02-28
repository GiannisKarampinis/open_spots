function initButtonsToggleSeenOnUpcomingTableRow() {
    $(document).on('click', '#upcomingTable .btn-toggle-seen', function (e) {
        e.preventDefault();

        const $btn = $(this);
        const url = $btn.attr('href');
        const $row = $btn.closest('tr');

        if (!url || !$row.length) return;

        $btn.prop('disabled', true).addClass('loading');

        fetch(url, {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCookie('csrftoken'),
                'X-Requested-With': 'XMLHttpRequest'
            },
            credentials: 'same-origin'
        })
        .then(resp => {
            if (!resp.ok) {
                return resp.json().then(err => {
                    throw new Error(err.error || 'Failed to update seen state');
                }).catch(() => {
                    throw new Error('Failed to update seen state');
                });
            }
            return resp.json();
        })
        .then(data => {
            const reservation = data.reservation || {};
            const seen = !!reservation.seen;
            const urls = reservation.urls || {};
            const nextUrl = seen ? urls.unseen : urls.seen;

            const html = seen
                ? `<a href="${nextUrl}" class="btn btn-sm btn-toggle-seen" data-seen="true" title="Mark as Unseen">👁️ Seen</a>`
                : `<a href="${nextUrl}" class="btn btn-sm btn-toggle-seen" data-seen="false" title="Mark as Seen">🙈 Unseen</a>`;

            $row.children().eq(4).html(html);
            $row.attr('data-seen', seen ? 'true' : 'false');
            $row.toggleClass('unseen-reservation', !seen);
            updateNotificationBadge();
        })
        .catch(err => {
            console.error('Error toggling seen state:', err);
            $btn.prop('disabled', false).removeClass('loading');
        });
    });
}