/* ═══════════════════════════════════════════════════════════════
   api.js  —  Quick Tracker  •  Backend connector
   Drop this file next to index.html and spttool.js.
   In index.html make sure BOTH scripts are loaded:
     <script src="spttool.js" defer></script>
     <script src="api.js" defer></script>
   ═══════════════════════════════════════════════════════════════ */

// ── Change this to your Railway backend URL after deploying ──
const API_BASE = 'https://YOUR-RAILWAY-APP.up.railway.app';

// ── Token helpers ──
function _getToken()       { return localStorage.getItem('qt_token'); }
function _setToken(t)      { localStorage.setItem('qt_token', t); }
function _clearToken()     { localStorage.removeItem('qt_token'); }

async function _apiFetch(path, options = {}) {
  const token = _getToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const res = await fetch(API_BASE + path, { ...options, headers });
  if (!res.ok) {
    let msg = 'Request failed';
    try { const j = await res.json(); msg = j.error || msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

// ═══════════════════════════════════════════════════════════════
//  OVERRIDE AUTH FUNCTIONS
//  These replace the localStorage-only versions in spttool.js
// ═══════════════════════════════════════════════════════════════

async function doSignup() {
  const name = document.getElementById('su-name').value.trim();
  const user = document.getElementById('su-user').value.trim().toLowerCase();
  const pass = document.getElementById('su-pass').value;

  if (!name || !user || !pass) return showMsg('su-msg', 'Please fill in all fields.', 'err');
  if (user.length < 3)         return showMsg('su-msg', 'Username must be at least 3 characters.', 'err');
  if (pass.length < 6)         return showMsg('su-msg', 'Password must be at least 6 characters.', 'err');

  showMsg('su-msg', 'Creating account…', '');
  try {
    const data = await _apiFetch('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ username: user, name, password: pass })
    });
    _setToken(data.token);
    showMsg('su-msg', 'Account created! Signing you in…', 'ok');
    setTimeout(() => _afterLogin(data.user), 800);
  } catch (err) {
    showMsg('su-msg', err.message, 'err');
  }
}

async function doLogin() {
  const user = document.getElementById('li-user').value.trim().toLowerCase();
  const pass = document.getElementById('li-pass').value;

  if (!user || !pass) return showMsg('li-msg', 'Please enter your username and password.', 'err');

  showMsg('li-msg', 'Signing in…', '');
  try {
    const data = await _apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: user, password: pass })
    });
    _setToken(data.token);
    await _afterLogin(data.user);
  } catch (err) {
    showMsg('li-msg', err.message, 'err');
  }
}

async function _afterLogin(user) {
  currentUser = { username: user.username, name: user.name };
  _currentData = null;

  // Load all data from server
  try {
    const sync = await _apiFetch('/api/sync');
    _currentData = {
      logs:           sync.logs           || [],
      alarms:         sync.alarms         || {},
      habitEnabled:   sync.settings.habitEnabled   || {},
      selectedSounds: sync.settings.selectedSounds || {},
      customSounds:   sync.settings.customSounds   || {},
      checkInHistory: sync.settings.checkInHistory || [],
      quickAlarms:    sync.settings.quickAlarms    || []
    };
  } catch (e) {
    console.warn('Sync failed, starting with empty data:', e);
    _currentData = { logs:[], alarms:{}, habitEnabled:{}, selectedSounds:{}, customSounds:{}, checkInHistory:[], quickAlarms:[] };
  }

  // Kick off the UI (same as original launchApp)
  const firstName = user.name.split(' ')[0];
  document.getElementById('greeting-name').textContent   = firstName;
  document.getElementById('hdr-avatar').textContent      = user.name.charAt(0).toUpperCase();
  document.getElementById('hdr-name').textContent        = user.name;
  document.getElementById('auth-screen').classList.remove('active');
  document.getElementById('app-screen').classList.add('active');
  buildHabitCards();
  renderCalendar();
  renderTrends();
  renderHistory();
  renderTrackerSchedules();
  startAlarmWatcher();
  window.scrollTo(0, 0);
}

function doLogout() {
  stopAlarmWatcher();
  _syncToServer();          // best-effort save before leaving
  _clearToken();
  currentUser = null;
  _currentData = null;
  restartForm();
  document.getElementById('settings-modal').style.display = 'none';
  document.getElementById('app-screen').classList.remove('active');
  document.getElementById('auth-screen').classList.add('active');
  clearAuthMsgs();
  document.getElementById('li-user').value = '';
  document.getElementById('li-pass').value = '';
  switchTab('login');
  window.scrollTo(0, 0);
}

// ═══════════════════════════════════════════════════════════════
//  OVERRIDE saveUserData  — persist to server after every change
// ═══════════════════════════════════════════════════════════════

// Debounce so rapid changes don't spam the server
let _syncTimeout = null;
const _SYNC_DELAY = 1500; // ms

const _origSaveUserData = window.saveUserData;
window.saveUserData = function() {
  // Still keep localStorage as offline cache
  if (currentUser && _currentData)
    localStorage.setItem('qt_data_' + currentUser.username, JSON.stringify(_currentData));

  clearTimeout(_syncTimeout);
  _syncTimeout = setTimeout(_syncToServer, _SYNC_DELAY);
};

async function _syncToServer() {
  if (!currentUser || !_currentData) return;
  const ud = _currentData;
  try {
    await _apiFetch('/api/sync', {
      method: 'POST',
      body: JSON.stringify({
        logs:  ud.logs || [],
        alarms: ud.alarms || {},
        settings: {
          habitEnabled:   ud.habitEnabled   || {},
          selectedSounds: ud.selectedSounds || {},
          customSounds:   ud.customSounds   || {},
          checkInHistory: ud.checkInHistory || [],
          quickAlarms:    ud.quickAlarms    || []
        }
      })
    });
  } catch (e) {
    console.warn('Background sync failed (data safe in localStorage):', e);
  }
}

// ═══════════════════════════════════════════════════════════════
//  OVERRIDE Settings — update name/username via API
// ═══════════════════════════════════════════════════════════════

async function saveSettings() {
  const newName   = document.getElementById('st-name').value.trim();
  const newUserId = document.getElementById('st-userid').value.trim().toLowerCase();
  const msg       = document.getElementById('st-msg');

  if (!newName)   return _stMsg('Name cannot be empty.', 'err');
  if (!newUserId) return _stMsg('User ID cannot be empty.', 'err');
  if (newUserId.length < 3) return _stMsg('User ID must be at least 3 characters.', 'err');
  if (!/^[a-z0-9_]+$/.test(newUserId)) return _stMsg('User ID: letters, numbers and underscores only.', 'err');

  _stMsg('Saving…', '');
  try {
    const data = await _apiFetch('/api/auth/update', {
      method: 'PATCH',
      body: JSON.stringify({ name: newName, newUsername: newUserId })
    });
    _setToken(data.token);
    currentUser.name     = newName;
    currentUser.username = newUserId;

    document.getElementById('hdr-avatar').textContent      = newName.charAt(0).toUpperCase();
    document.getElementById('hdr-name').textContent        = newName;
    document.getElementById('greeting-name').textContent   = newName.split(' ')[0];
    document.getElementById('st-avatar').textContent       = newName.charAt(0).toUpperCase();
    document.getElementById('st-display-name').textContent = newName;
    document.getElementById('st-display-user').textContent = '#' + newUserId;
    document.getElementById('st-userid').value             = newUserId;
    _stMsg('✓ Changes saved!', 'ok');
    setTimeout(() => _stMsg('', ''), 3000);
  } catch (err) {
    _stMsg(err.message, 'err');
  }
}

function _stMsg(text, type) {
  const msg = document.getElementById('st-msg');
  msg.textContent = text;
  msg.className = 'auth-msg' + (type ? ' ' + type : '');
}

// ═══════════════════════════════════════════════════════════════
//  AUTO RESTORE SESSION on page load
// ═══════════════════════════════════════════════════════════════

window.addEventListener('DOMContentLoaded', async () => {
  const token = _getToken();
  if (!token) return; // show login screen

  try {
    const data = await _apiFetch('/api/auth/me');
    await _afterLogin(data.user);
  } catch {
    // Token expired or invalid — show login
    _clearToken();
  }
});