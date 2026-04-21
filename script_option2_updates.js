// ============================================================
//  script_option2_updates.js
//  Add this AFTER script_option2.js in index.html:
//  <script src="./script_option2_updates.js"></script>
//
//  This file:
//  1. Adds _2026 suffix to school names before submission
//  2. Replaces syncPending with robust sync engine
//  3. Adds manual SYNC NOW button + status bar
// ============================================================

// ── 1. _2026 SUFFIX ──────────────────────────────────────────
function ensureSchoolSuffix(name) {
    if (!name) return name;
    const trimmed = name.trim();
    return trimmed.endsWith('_2026') ? trimmed : trimmed + '_2026';
}

// ── 2. Override doSubmit to add _2026 before submitKey ───────
(function() {
    const _origDoSubmit = window.doSubmit;
    window.doSubmit = async function() {
        // Patch school_name in the form before original doSubmit runs
        const schoolEl = document.getElementById('school_name');
        const newSchoolEl = document.getElementById('school_name_new');
        if (schoolEl && schoolEl.value) {
            schoolEl.value = ensureSchoolSuffix(schoolEl.value);
        }
        if (newSchoolEl && newSchoolEl.value) {
            newSchoolEl.value = ensureSchoolSuffix(newSchoolEl.value);
        }
        // Stamp submission time into hidden field
        var tsEl = document.getElementById('submission_timestamp');
        if (!tsEl) {
            tsEl = document.createElement('input');
            tsEl.type = 'hidden';
            tsEl.name = 'submission_timestamp';
            tsEl.id   = 'submission_timestamp';
            var form = document.getElementById('dataForm');
            if (form) form.appendChild(tsEl);
        }
        tsEl.value = new Date().toISOString();
        return _origDoSubmit.apply(this, arguments);
    };
})();

// ── 3. Override saveOffline to tag each record with unique ID ─
window.saveOffline = function(data) {
    if (!data._submission_id) {
        data._submission_id = 'SUB-' + Date.now() + '-' + Math.floor(Math.random()*9999);
    }
    if (!data.submission_timestamp) data.submission_timestamp = new Date().toISOString();
    if (data.school_name) data.school_name = ensureSchoolSuffix(data.school_name);
    state.pendingSubmissions.push(data);
    markSchoolSubmitted(data);
    clearDraft();
    saveToStorage(); updateCounts(); updateSummaryBadge();
    updateSyncBar();
    showThankYouModal(data, true);
};

// ── 4. SYNC ENGINE ────────────────────────────────────────────
// ── SYNC ENGINE — replaces syncPending ───────────────────────
// Fixes: duplicate prevention, sync lock, status indicator, manual button

let _isSyncing = false;  // lock — prevents concurrent syncs

// Inject sync status bar near the pending count
function injectSyncBar() {
    if (document.getElementById('syncStatusBar')) return;
    const bar = document.createElement('div');
    bar.id = 'syncStatusBar';
    bar.style.cssText = 'display:none;position:fixed;bottom:0;left:0;right:0;z-index:9000;' +
        'background:#004080;color:#fff;padding:10px 16px;' +
        'display:flex;align-items:center;gap:10px;font-family:Oswald,sans-serif;font-size:12px;' +
        'box-shadow:0 -2px 12px rgba(0,0,0,.25);';
    bar.innerHTML =
        '<div id="syncStatusIcon" style="width:18px;height:18px;border:3px solid rgba(255,255,255,.4);' +
        'border-top-color:#ffc107;border-radius:50%;flex-shrink:0;"></div>' +
        '<div style="flex:1;">' +
            '<span id="syncStatusText" style="font-weight:700;letter-spacing:.4px;">0 PENDING</span>' +
            '<span id="syncStatusDetail" style="color:rgba(255,255,255,.65);margin-left:8px;font-size:11px;"></span>' +
        '</div>' +
        '<button id="syncNowBtn" onclick="window.manualSync()" ' +
        'style="background:#ffc107;color:#004080;border:none;border-radius:7px;padding:7px 16px;' +
        'font-family:Oswald,sans-serif;font-size:11px;font-weight:700;letter-spacing:.5px;cursor:pointer;' +
        'flex-shrink:0;display:flex;align-items:center;gap:5px;">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12">' +
                '<path d="M21 2v6h-6M3 12a9 9 0 0115.36-6.36L21 8M3 22v-6h6M21 12a9 9 0 01-15.36 6.36L3 16"/>' +
            '</svg>SYNC NOW' +
        '</button>' +
        '<button onclick="document.getElementById(\'syncStatusBar\').style.display=\'none\'" ' +
        'style="background:rgba(255,255,255,.15);border:none;color:#fff;border-radius:6px;' +
        'width:28px;height:28px;cursor:pointer;font-size:16px;flex-shrink:0;' +
        'display:flex;align-items:center;justify-content:center;">✕</button>';
    document.body.appendChild(bar);
}

function updateSyncBar() {
    injectSyncBar();
    const count  = state.pendingSubmissions.length;
    const bar    = document.getElementById('syncStatusBar');
    const text   = document.getElementById('syncStatusText');
    const detail = document.getElementById('syncStatusDetail');
    const icon   = document.getElementById('syncStatusIcon');
    const btn    = document.getElementById('syncNowBtn');

    if (!bar) return;

    if (count === 0) {
        bar.style.display = 'none';
        return;
    }

    bar.style.display = 'flex';
    if (text) text.textContent = count + ' RECORD' + (count > 1 ? 'S' : '') + ' PENDING SYNC';

    if (_isSyncing) {
        if (detail) detail.textContent = 'Syncing…';
        if (icon)   icon.style.animation = 'spin 0.8s linear infinite';
        if (btn)    { btn.disabled = true; btn.style.opacity = '0.5'; }
    } else {
        const online = state.isOnline;
        if (detail) detail.textContent = online ? 'Tap SYNC NOW to send to server' : 'Offline — will auto-sync when online';
        if (icon)   { icon.style.animation = 'none'; icon.style.borderTopColor = online ? '#28a745' : '#dc3545'; }
        if (btn)    { btn.disabled = !online; btn.style.opacity = online ? '1' : '0.5'; }
    }
}

// Add unique submission ID to each record before saving
function addSubmissionId(data) {
    if (!data._submission_id) {
        data._submission_id = 'SUB-' + Date.now() + '-' + Math.floor(Math.random() * 9999);
    }
    return data;
}

// Save offline with ID
var _origSaveOffline = typeof saveOffline === 'function' ? saveOffline : null;
function saveOffline(data) {
    addSubmissionId(data);
    state.pendingSubmissions.push(data);
    markSchoolSubmitted(data);
    clearDraft();
    saveToStorage(); updateCounts(); updateSummaryBadge();
    updateSyncBar();
    showThankYouModal(data, true);
}

// Main sync function — with lock, dedup, status
async function syncPending() {
    if (_isSyncing)                           return;  // already running
    if (state.pendingSubmissions.length === 0) return;  // nothing to sync
    if (!state.isOnline)                      return;  // offline

    _isSyncing = true;
    updateSyncBar();
    showNotification('Syncing ' + state.pendingSubmissions.length + ' record(s)…', 'info');

    const toSync  = [...state.pendingSubmissions];  // snapshot
    const synced  = [];
    const failed  = [];

    for (let i = 0; i < toSync.length; i++) {
        const record = toSync[i];
        addSubmissionId(record);  // ensure ID exists

        try {
            // Use regular CORS fetch with timeout so we can detect failures
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 12000);

            const res = await fetch(CONFIG.SCRIPT_URL, {
                method:  'POST',
                mode:    'cors',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body:    JSON.stringify(record),
                signal:  ctrl.signal
            });
            clearTimeout(timer);

            // GAS returns JSON — check success
            const json = await res.json().catch(() => null);
            if (json && json.success !== false) {
                synced.push(record._submission_id || i);
            } else {
                console.warn('[Sync] GAS rejected record:', json);
                failed.push(i);
            }
        } catch(e) {
            // Network error or timeout — keep in pending
            console.warn('[Sync] Failed:', e.message);
            failed.push(i);
        }
    }

    // Remove successfully synced records from pending
    // Match by _submission_id so order doesn't matter
    state.pendingSubmissions = state.pendingSubmissions.filter(function(r) {
        return !synced.includes(r._submission_id);
    });

    saveToStorage();
    updateCounts();
    updateSyncBar();
    _isSyncing = false;

    if (synced.length > 0 && failed.length === 0) {
        showNotification('✓ All ' + synced.length + ' record(s) synced successfully!', 'success');
    } else if (synced.length > 0 && failed.length > 0) {
        showNotification(synced.length + ' synced, ' + failed.length + ' failed — tap SYNC NOW to retry.', 'warning');
    } else if (failed.length > 0) {
        showNotification('Sync failed — ' + failed.length + ' record(s) pending. Check connection.', 'error');
    }
}

// Manual sync button handler
window.manualSync = async function() {
    if (_isSyncing) { showNotification('Sync already in progress…', 'info'); return; }
    if (!state.isOnline) { showNotification('You are offline — cannot sync now.', 'error'); return; }
    if (state.pendingSubmissions.length === 0) { showNotification('Nothing to sync.', 'success'); return; }
    await syncPending();
};

// Show sync bar on load if there are pending items
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
        injectSyncBar();
        updateSyncBar();
        // Auto-sync on load if online and pending
        if (state.isOnline && state.pendingSubmissions.length > 0) {
            setTimeout(syncPending, 2000);
        }
    }, 1000);
});

// Override the online event listener to use new syncPending
window.addEventListener('online', function() {
    state.isOnline = true;
    updateOnlineStatus();
    updateSyncBar();
    setTimeout(syncPending, 1500);  // slight delay after reconnect
});

window.addEventListener('offline', function() {
    state.isOnline = false;
    updateOnlineStatus();
    updateSyncBar();
});
