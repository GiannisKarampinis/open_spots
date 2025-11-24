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

document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
        const tabs = document.querySelectorAll(".tabs button");
        const tabContents = document.querySelectorAll(".tab-content > div");

        const tabIdMap = {
            "requests": "requests",
            "history": "history",
            "analytics": "analytics-tab",
            "manage-venue": "manage-venue"
        };

        function activateTab(tabName, triggerClick = false) {
            const targetId = tabIdMap[tabName];
            if (!targetId) return;

            if (triggerClick) {// If we want to simulate a REAL click
                const btn = document.querySelector(`.tabs button[data-tab="${tabName}"]`);
                if (btn) {
                    btn.click(); // IMPORTANT!!! 
                    return; 
                }
            }

            // Fallback: manual activation
            tabs.forEach(btn =>
                btn.classList.toggle("active", btn.dataset.tab === tabName)
            );
            tabContents.forEach(content =>
                content.classList.toggle("active", content.id === targetId)
            );
        }

        // Load saved tab
        const saved = localStorage.getItem("venue_active_tab");

        if (saved && tabIdMap[saved]) {
            // 🔥 Trigger actual click to load analytics charts or any dynamic content
            activateTab(saved, true);
        }

        // Save tab on click
        tabs.forEach(btn => {
            btn.addEventListener("click", () => {
                const tabName = btn.dataset.tab;
                localStorage.setItem("venue_active_tab", tabName);
            });
        });

    }, 100);  // ensures other JS has already set up event listeners
});