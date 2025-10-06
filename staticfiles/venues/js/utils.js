// utils.js
function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
            cookie = cookie.trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

const _lastUpdated = new Map();
const _recentLocalUpdates = new Map();

function suppressWsFor(reservationId, ms = 3000) {
    if (!reservationId) return;
    const idStr = String(reservationId);
    const expiry = Date.now() + ms;
    _recentLocalUpdates.set(idStr, expiry);
    setTimeout(() => {
        const v = _recentLocalUpdates.get(idStr);
        if (!v || v <= Date.now()) _recentLocalUpdates.delete(idStr);
    }, ms + 50);
}

function isSuppressed(reservationId) {
    if (!reservationId) return false;
    const v = _recentLocalUpdates.get(String(reservationId));
    return !!(v && v > Date.now());
}

function shouldApplyUpdate(res) {
    if (!res || !res.id) return false;
    if (!res.updated_at) return !isSuppressed(res.id);
    const newTs = Date.parse(res.updated_at);
    const oldTs = _lastUpdated.get(String(res.id)) || 0;
    if (newTs <= oldTs) return false;
    _lastUpdated.set(String(res.id), newTs);
    return true;
}

// HTML helpers
function escapeHtml(s){
    if (s === null || s === undefined) return '';
    return String(s)
        .replace(/&/g,'&amp;')
        .replace(/</g,'&lt;')
        .replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;')
        .replace(/'/g,'&#039;');
}

function capitalize(s){ return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

function postJSON(url, data={}) {
    return fetch(url,{
        method:'POST',
        headers:{
            'X-Requested-With':     'XMLHttpRequest',
            'X-CSRFToken':          getCookie('csrftoken'),
            'Content-Type':         'application/json'
        },
        body: JSON.stringify(data)
    }).then(resp => { if(!resp.ok) throw resp; return resp.json(); });
}
