function styleDataTableControls() {
    const mappings = [
        { lengthId: '#upcomingTable_length',   lengthWrap: '#upcoming-show-entries-wrapper', filterId: '#upcomingTable_filter', searchWrap: '#upcoming-search-wrapper' },
        { lengthId: '#pastTable_length',       lengthWrap: '#history-show-entries-wrapper',  filterId: '#pastTable_filter',    searchWrap: '#history-search-wrapper' },
        { lengthId: '#specialTable_length',    lengthWrap: '#special-show-entries-wrapper', filterId: '#specialTable_filter', searchWrap: '#special-search-wrapper' }
    ];

    mappings.forEach(({ lengthId, lengthWrap, filterId, searchWrap }) => {
        const $length = $(lengthId);
        const $lengthWrap = $(lengthWrap);
        if ($length.length && $lengthWrap.length) {
            // append only if the wrapper doesn't already contain the control
            if ($lengthWrap.find(lengthId).length === 0) {
                $lengthWrap.append($length.detach());
            }
            // add classes to the <select> inside
            $lengthWrap.find('select').addClass('form-select form-select-sm dt-length-select');
        }

        const $filter = $(filterId);
        const $searchWrap = $(searchWrap);
        if ($filter.length && $searchWrap.length) {
            if ($searchWrap.find(filterId).length === 0) {
                $searchWrap.append($filter.detach());
            }
            // add classes to the <input> inside (the input is usually under the filter element)
            $searchWrap.find('input').addClass('form-control form-control-sm dt-search-input');
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    ['#upcomingTable','#pastTable','#specialTable'].forEach(selector=>{
        if($(selector).length) initializeDataTable(selector);
    });

    const venueId = document.getElementById('venue-dashboard').dataset.venueId;

    initReservationActions();
    initBadgeHover();
    initWebSocket(venueId);
    initTabsNavigation(venueId);
    styleDataTableControls();
});
