// analytics-tabs.js (replace existing contents)

let plotlyLoaded = false;

/**
 * Load Plotly once and call callback after it's available.
 * Exposed at module/global scope so any function can call it.
 */
function loadPlotly(callback) {
    if (plotlyLoaded) {
        callback && callback();
        return;
    }
    const script = document.createElement('script');
    script.src = "https://cdn.plot.ly/plotly-basic-latest.min.js"; // lightweight build
    script.onload = () => { plotlyLoaded = true; callback && callback(); };
    script.onerror = () => {
        console.error("Failed to load Plotly.js");
        // optional: show user-friendly message in chart area
        const el = document.getElementById('analytics-chart');
        if (el) el.innerHTML = '<div class="alert alert-warning">Failed to load chart library.</div>';
    };
    document.head.appendChild(script);
}

/**
 * Initialize tabs navigation (calls loadAnalyticsPartial when needed)
 */
function initTabsNavigation(venueId) {
    $('.tabs button').on('click', function () {
        const tabId = $(this).data('tab');
        $('.tabs button').removeClass('active');
        $('.tab-content > div, #analytics-tab').removeClass('active');
        $(this).addClass('active');

        if (tabId === 'analytics') {
            $('#analytics-tab').addClass('active');
            // Ensure Plotly is loaded before requesting and rendering data
            loadPlotly(() => loadAnalyticsPartial(venueId, $('#group').val() || 'daily'));
        } else {
            $('#' + tabId).addClass('active');
        }
    });

    $(document).on('change', '#group', function () {
        // When changing group, ensure Chart gets updated (Plotly will be loaded by this point)
        loadAnalyticsPartial(venueId, $(this).val());
    });

    // Initial load if analytics tab is active on page load
    if ($('#analytics-tab').hasClass('active')) {
        loadPlotly(() => loadAnalyticsPartial(venueId, $('#group').val() || 'daily'));
    }
}

/**
 * Fetch analytics JSON and render the chart using Plotly.
 * Uses the top-level loadPlotly so Plotly exists before call.
 */
function loadAnalyticsPartial(venueId, grouping = 'daily') {
    const chartEl = $('#analytics-chart');
    if (!chartEl.length) return;

    chartEl.html('<div class="text-center py-5">Loading analytics…</div>');

    fetch(`/venues/${venueId}/analytics/partial/?group=${grouping}`, {
        headers: { "X-Requested-With": "XMLHttpRequest" }
    })
    .then(response => {
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.json();
    })
    .then(data => {
        $('#total-visits').text(data.total_visits ?? 0);
        $('#avg-daily-visits').text(data.avg_daily_visits ?? 0);
        $('#peak-visits').text(data.peak_visits ?? 0);
        $('#total-reservations').text(data.total_reservations ?? 0);

        let figure;
        try {
            figure = (typeof data.figure === 'string') ? JSON.parse(data.figure) : data.figure;
        } catch (err) {
            console.error('Failed to parse figure JSON:', err);
            figure = null;
        }

        if (!figure || !Array.isArray(figure.data) || figure.data.length === 0) {
            chartEl.html('<div class="alert alert-info text-center">No analytics data available for the selected range.</div>');
            return;
        }

        loadPlotly(() => {
            // Enforce light theme
            figure.layout = figure.layout || {};
            figure.layout.paper_bgcolor = '#ffffff';
            figure.layout.plot_bgcolor = '#ffffff';
            figure.layout.font = figure.layout.font || {};
            figure.layout.font.color = '#000000';

            // Remove x-axis grid
            figure.layout.xaxis = figure.layout.xaxis || {};
            figure.layout.xaxis.showgrid = true;
            figure.layout.xaxis.gridcolor = 'rgba(0,0,0,0.1)'; // same for y-axis

            // Optional: keep y-axis grid if you want
            figure.layout.yaxis = figure.layout.yaxis || {};
            figure.layout.yaxis.showgrid = true;
            figure.layout.yaxis.gridcolor = 'rgba(0,0,0,0.1)'; // same for y-axis

            // Ensure trace colors are visible on light background
            figure.data.forEach(trace => {
                if (trace.marker) trace.marker.color = trace.marker.color || '#1f77b4';
                if (trace.line) trace.line.color = trace.line.color || '#1f77b4';
            });

            Plotly.newPlot('analytics-chart', figure.data, figure.layout, data.config || {})
                .then(() => {
                    setTimeout(() => {
                        const el = document.getElementById('analytics-chart');
                        if (el && window.Plotly && Plotly.Plots && typeof Plotly.Plots.resize === 'function') {
                            Plotly.Plots.resize(el);
                        }
                    }, 50);
                })
                .catch(err => {
                    console.error('Plotly.newPlot error:', err);
                    chartEl.html('<div class="alert alert-warning">Failed to render analytics chart.</div>');
                });
        });
    })
    .catch(err => {
        console.error('Error loading analytics:', err);
        chartEl.html('<div class="alert alert-warning">Failed to load analytics data.</div>');
    });
}

