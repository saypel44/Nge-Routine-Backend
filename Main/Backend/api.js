'use strict';

/* ═══════════════════════════════════════
   CONFIGURATION
═══════════════════════════════════════ */
// Change this if your server runs on a different port
const API_BASE = 'http://localhost:3000';

/* ═══════════════════════════════════════
   GLOBAL STATE
═══════════════════════════════════════ */
let currentUser       = null;
let currentAlarmHabit = null;
let _authToken        = null;

let _currentData = {
  logs:           [],
  alarms:         {},
  habitEnabled:   {},
  selectedSounds: {},
  customSounds:   {},
  checkInHistory: [],
  quickAlarms:    [],
  schedules:      []
};

/* ═══════════════════════════════════════
   CORE API HELPER  ← THE MISSING PIECE
═══════════════════════════════════════ */
async function _apiRequest(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };

  if (_authToken) {
    opts.headers['Authorization'] = 'Bearer ' + _authToken;
  }

  if (body && method !== 'GET') {
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(API_BASE + path, opts);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }

  return data;
}

/* ═══════════════════════════════════════
   USER DATA — SYNC WITH BACKEND
═══════════════════════════════════════ */
async function getUserData() {
  if (!currentUser) return null;

  try {
    const data = await _apiRequest('/api/user-data');
    _currentData = {
      logs:           data.logs           || [],
      alarms:         data.alarms         || {},
      habitEnabled:   data.habitEnabled   || {},
      selectedSounds: data.selectedSounds || {},
      customSounds:   data.customSounds   || {},
      checkInHistory: data.checkInHistory || [],
      quickAlarms:    data.quickAlarms    || [],
      schedules:      data.schedules      || []
    };
  } catch (e) {
    console.error('getUserData failed:', e.message);
  }

  return _currentData;
}

async function saveUserData() {
  if (!currentUser) return;
  try {
    await _apiRequest('/api/user-data', 'POST', _currentData);
    console.log('✅ User data synced');
  } catch (e) {
    console.error('saveUserData failed:', e.message);
  }
}

/* ═══════════════════════════════════════
   AUTH — TAB SWITCHING
═══════════════════════════════════════ */
function switchTab(t) {
  const loginTab  = document.getElementById('tab-login');
  const signupTab = document.getElementById('tab-signup');

  if (loginTab)  loginTab.style.display  = (t === 'login'  ? 'block' : 'none');
  if (signupTab) signupTab.style.display = (t === 'signup' ? 'block' : 'none');

  document.querySelectorAll('.auth-tab').forEach((el, i) => {
    el.classList.toggle('active',
      (i === 0 && t === 'login') || (i === 1 && t === 'signup')
    );
  });

  clearAuthMsgs();
}

function clearAuthMsgs() {
  ['li-msg', 'su-msg', 'fp-msg'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = ''; el.className = 'auth-msg'; }
  });
}

function showMsg(id, text, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className   = 'auth-msg ' + type;
}

function togglePw(id, btn) {
  const inp = document.getElementById(id);
  inp.type     = inp.type === 'password' ? 'text' : 'password';
  btn.textContent = inp.type === 'password' ? '👁' : '🙈';
}

/* ═══════════════════════════════════════
   SIGNUP
═══════════════════════════════════════ */
async function doSignup() {
  const name = document.getElementById('su-name')?.value.trim();
  const user = document.getElementById('su-user')?.value.trim();
  const pass = document.getElementById('su-pass')?.value;

  if (!name || !user || !pass) return showMsg('su-msg', 'Fill all fields', 'err');

  try {
    const res = await _apiRequest('/api/signup', 'POST', {
      name, username: user, password: pass
    });
    showMsg('su-msg', 'Account created!', 'ok');
    setupSession(res);
  } catch (err) {
    showMsg('su-msg', err.message, 'err');
  }
}

/* ═══════════════════════════════════════
   LOGIN
═══════════════════════════════════════ */
async function doLogin() {
  const user = document.getElementById('li-user')?.value.trim();
  const pass = document.getElementById('li-pass')?.value;

  if (!user || !pass) return showMsg('li-msg', 'Enter username and password', 'err');

  try {
    const res = await _apiRequest('/api/login', 'POST', {
      username: user, password: pass
    });
    setupSession(res);
  } catch (err) {
    showMsg('li-msg', err.message, 'err');
  }
}

/* ═══════════════════════════════════════
   SESSION SETUP
═══════════════════════════════════════ */
function setupSession(res) {
  _authToken  = res.token;
  currentUser = { username: res.username, name: res.name };

  // Persist so page refresh keeps you logged in
  sessionStorage.setItem('qt_token', _authToken);
  sessionStorage.setItem('qt_user',  JSON.stringify(currentUser));

  launchApp();
}

/* ═══════════════════════════════════════
   LAUNCH APP
═══════════════════════════════════════ */
async function launchApp() {
  if (!currentUser || !currentUser.name) { doLogout(); return; }

  // Sync all data from server first
  try { await syncData(); } catch (e) { console.error('Sync failed:', e); }

  // Update header
  const firstName = currentUser.name.split(' ')[0];
  const el = id => document.getElementById(id);

  if (el('greeting-name'))  el('greeting-name').textContent = firstName;
  if (el('hdr-avatar'))     el('hdr-avatar').textContent    = currentUser.name.charAt(0).toUpperCase();
  if (el('hdr-name'))       el('hdr-name').textContent      = currentUser.name;

  // Switch screens
  el('auth-screen')?.classList.remove('active');
  el('app-screen')?.classList.add('active');

  // Render all sections
  buildHabitCards();
  renderCalendar();
  renderCalendar2();
  renderTrends();
  renderHistory();
  renderTrackerSchedules();
  startAlarmWatcher();

  window.scrollTo(0, 0);
  console.log('🚀 App launched');
}

async function syncData() {
  const [userData] = await Promise.all([
    _apiRequest('/api/user-data')
  ]);

  _currentData.logs           = userData.logs           || [];
  _currentData.alarms         = userData.alarms         || {};
  _currentData.habitEnabled   = userData.habitEnabled   || {};
  _currentData.selectedSounds = userData.selectedSounds || {};
  _currentData.customSounds   = userData.customSounds   || {};
  _currentData.checkInHistory = userData.checkInHistory || [];
  _currentData.quickAlarms    = userData.quickAlarms    || [];
  _currentData.schedules      = userData.schedules      || [];
}

/* ═══════════════════════════════════════
   LOGOUT
═══════════════════════════════════════ */
async function doLogout() {
  stopAlarmWatcher();

  try {
    if (_authToken) await saveUserData();
  } catch (e) { /* swallow */ }

  sessionStorage.clear();

  currentUser   = null;
  _authToken    = null;
  _currentData  = {
    logs: [], alarms: {}, habitEnabled: {}, selectedSounds: {},
    customSounds: {}, checkInHistory: [], quickAlarms: [], schedules: []
  };

  restartForm();
  document.getElementById('settings-modal')?.style && (document.getElementById('settings-modal').style.display = 'none');
  document.getElementById('app-screen')?.classList.remove('active');
  document.getElementById('auth-screen')?.classList.add('active');

  clearAuthMsgs();
  if (document.getElementById('li-user')) document.getElementById('li-user').value = '';
  if (document.getElementById('li-pass')) document.getElementById('li-pass').value = '';

  switchTab('login');
  window.scrollTo(0, 0);
}

/* ═══════════════════════════════════════
   AUTO LOGIN ON PAGE LOAD  (single listener)
═══════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {

  /* keyboard shortcuts */
  const liUser = document.getElementById('li-user');
  const liPass = document.getElementById('li-pass');
  const suPass = document.getElementById('su-pass');

  liUser?.addEventListener('keydown', e => { if (e.key === 'Enter') liPass?.focus(); });
  liPass?.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  suPass?.addEventListener('keydown', e => { if (e.key === 'Enter') doSignup(); });

  /* check-in form setup */
  initCheckInUI();

  /* log form setup */
  lfInit();

  /* restore session */
  try {
    const token = sessionStorage.getItem('qt_token');
    const user  = sessionStorage.getItem('qt_user');
    if (!token || !user) return;

    _authToken  = token;
    currentUser = JSON.parse(user);

    // Verify token is still valid with server
    const me = await _apiRequest('/api/me');
    currentUser = { username: me.username, name: me.name };

    await getUserData();
    launchApp();
  } catch (e) {
    console.warn('Auto-login failed:', e.message);
    sessionStorage.removeItem('qt_token');
    sessionStorage.removeItem('qt_user');
  }
});

/* ═══════════════════════════════════════
   NAV TABS
═══════════════════════════════════════ */
function showTab(t) {
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));

  document.getElementById('tab-' + t)?.classList.add('active');

  document.querySelectorAll('.nav-tab').forEach(b => {
    if (b.dataset.tab === t) b.classList.add('active');
  });

  if (t === 'trends')  renderTrends();
  if (t === 'history') { renderCalendar(); renderHistory(); }
}

/* ═══════════════════════════════════════
   SETTINGS MODAL
═══════════════════════════════════════ */
function openSettings() {
  if (!currentUser) return;

  const el = id => document.getElementById(id);

  el('st-avatar')?.textContent && (el('st-avatar').textContent = currentUser.name.charAt(0).toUpperCase());
  if (el('st-avatar'))       el('st-avatar').textContent       = currentUser.name.charAt(0).toUpperCase();
  if (el('st-display-name')) el('st-display-name').textContent = currentUser.name;
  if (el('st-display-user')) el('st-display-user').textContent = '#' + currentUser.username;
  if (el('st-name'))         el('st-name').value               = currentUser.name;
  if (el('st-userid'))       el('st-userid').value             = currentUser.username;

  const msg = el('st-msg');
  if (msg) { msg.className = 'auth-msg'; msg.textContent = ''; }

  el('settings-modal').style.display = 'flex';
}

function closeSettings() {
  document.getElementById('settings-modal').style.display = 'none';
}

function settingsOverlayClick(e) {
  if (e.target === document.getElementById('settings-modal')) closeSettings();
}

async function saveSettings() {
  const newName   = document.getElementById('st-name')?.value.trim();
  const newUserId = document.getElementById('st-userid')?.value.trim().toLowerCase();
  const msg       = document.getElementById('st-msg');

  if (!newName)    return _stMsg(msg, 'Name cannot be empty.', 'err');
  if (!newUserId)  return _stMsg(msg, 'User ID cannot be empty.', 'err');
  if (newUserId.length < 3) return _stMsg(msg, 'User ID must be at least 3 characters.', 'err');
  if (!/^[a-z0-9_]+$/.test(newUserId)) return _stMsg(msg, 'Only letters, numbers and underscores allowed.', 'err');

  try {
    const res = await _apiRequest('/api/settings', 'PUT', { name: newName, username: newUserId });

    currentUser.name     = res.name;
    currentUser.username = res.username;
    sessionStorage.setItem('qt_user', JSON.stringify(currentUser));

    const firstName = currentUser.name.split(' ')[0];
    const el = id => document.getElementById(id);

    if (el('hdr-avatar'))       el('hdr-avatar').textContent       = currentUser.name.charAt(0).toUpperCase();
    if (el('hdr-name'))         el('hdr-name').textContent         = currentUser.name;
    if (el('greeting-name'))    el('greeting-name').textContent    = firstName;
    if (el('st-avatar'))        el('st-avatar').textContent        = currentUser.name.charAt(0).toUpperCase();
    if (el('st-display-name'))  el('st-display-name').textContent  = currentUser.name;
    if (el('st-display-user'))  el('st-display-user').textContent  = '#' + currentUser.username;
    if (el('st-userid'))        el('st-userid').value              = currentUser.username;

    _stMsg(msg, '✓ Settings updated successfully', 'ok');
    setTimeout(() => { msg.className = 'auth-msg'; msg.textContent = ''; }, 3000);
  } catch (err) {
    _stMsg(msg, err.message, 'err');
  }
}

function _stMsg(el, text, type) {
  if (!el) return;
  el.textContent = text;
  el.className   = 'auth-msg ' + type;
}

/* ═══════════════════════════════════════
   FORGOT / RESET PASSWORD
═══════════════════════════════════════ */
function toggleForgotPanel() {
  const panel = document.getElementById('forgot-panel');
  const isHidden = panel.style.display === 'none' || !panel.style.display;
  panel.style.display = isHidden ? 'block' : 'none';

  if (isHidden) {
    const uid = document.getElementById('li-user')?.value.trim();
    if (uid && document.getElementById('fp-user'))
      document.getElementById('fp-user').value = uid;

    if (document.getElementById('fp-new-pass'))     document.getElementById('fp-new-pass').value = '';
    if (document.getElementById('fp-confirm-pass')) document.getElementById('fp-confirm-pass').value = '';

    const fpMsg = document.getElementById('fp-msg');
    if (fpMsg) { fpMsg.className = 'auth-msg'; fpMsg.textContent = ''; }
  }
}

async function doResetPassword() {
  const userId  = document.getElementById('fp-user')?.value.trim().toLowerCase();
  const newPass = document.getElementById('fp-new-pass')?.value;
  const confirm = document.getElementById('fp-confirm-pass')?.value;
  const msg     = document.getElementById('fp-msg');

  if (!userId)              return showMsg('fp-msg', 'Please enter your User ID.', 'err');
  if (!newPass)             return showMsg('fp-msg', 'Please enter a new password.', 'err');
  if (newPass.length < 6)   return showMsg('fp-msg', 'Password must be at least 6 characters.', 'err');
  if (newPass !== confirm)  return showMsg('fp-msg', 'Passwords do not match.', 'err');

  try {
    await _apiRequest('/api/reset-password', 'POST', { username: userId, password: newPass });
    showMsg('fp-msg', '✓ Password reset successful!', 'ok');

    setTimeout(() => {
      if (document.getElementById('li-user'))  document.getElementById('li-user').value  = userId;
      if (document.getElementById('li-pass'))  document.getElementById('li-pass').value  = '';
      if (document.getElementById('forgot-panel')) document.getElementById('forgot-panel').style.display = 'none';
      clearAuthMsgs();
    }, 1800);
  } catch (err) {
    showMsg('fp-msg', err.message, 'err');
  }
}

/* ═══════════════════════════════════════
   CHECK-IN LOGIC
═══════════════════════════════════════ */
const likertQs = [
  { id: 'l1', text: 'I can fall asleep easily.' },
  { id: 'l2', text: 'I sleep well most nights.' },
  { id: 'l3', text: 'I wake up feeling rested.' },
  { id: 'l4', text: 'I stay alert during the day.' },
  { id: 'l5', text: 'I have good energy during the day.' }
];

const likertOpts = ['Yes, always', 'Most of the time', 'Sometimes', 'Not really', 'No, never'];

const answers  = {};
const lAnswers = {};

function initCheckInUI() {
  const lc = document.getElementById('lik-container');
  if (!lc) return;

  likertQs.forEach((q, i) => {
    const row = document.createElement('div');
    row.className = 'lik-item';
    row.innerHTML = `
      <span class="lik-label">Q${i + 1}. ${q.text}</span>
      <div class="lik-btns">
        ${likertOpts.map(o => `
          <button type="button" class="lbtn" data-lq="${q.id}" data-v="${o}">${o}</button>
        `).join('')}
      </div>
    `;
    lc.appendChild(row);
  });

  document.querySelectorAll('.opts').forEach(grp => {
    grp.querySelectorAll('.opt').forEach(btn => {
      btn.addEventListener('click', () => {
        grp.querySelectorAll('.opt').forEach(b => b.classList.remove('sel'));
        btn.classList.add('sel');
        answers[grp.dataset.q] = btn.dataset.v;
        updateProg();
      });
    });
  });

  document.querySelectorAll('.lbtn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll(`.lbtn[data-lq="${btn.dataset.lq}"]`)
        .forEach(b => b.classList.remove('sel'));
      btn.classList.add('sel');
      lAnswers[btn.dataset.lq] = btn.dataset.v;
      updateProg();
    });
  });
}

function updateProg() {
  const done = Object.keys(answers).length + Object.keys(lAnswers).length;
  const pct  = Math.round((done / 12) * 100);

  const bar = document.getElementById('prog-bar');
  const txt = document.getElementById('prog-txt');
  const btn = document.getElementById('submit-btn');

  if (bar) bar.style.width = pct + '%';
  if (txt) txt.textContent = `${done} of 12`;
  if (btn) btn.disabled    = (done < 12);
}

/* ── SCORING ── */
function lScore(v) {
  return { 'Yes, always': 5, 'Most of the time': 4, 'Sometimes': 3, 'Not really': 2, 'No, never': 1 }[v] || 3;
}

function sleepScore() {
  let sum = 0;
  likertQs.forEach(q => { sum += lScore(lAnswers[q.id]); });
  return Math.round((sum / likertQs.length) * 10);
}

function phoneRisk() {
  return { 'no phone before bed': 0, 'less than 30 minutes': 1, '30 min–1 hour': 2,
           '1–2 hours': 3, '2–3 hours': 4, 'more than 3 hours': 5 }[answers.phonetime] || 0;
}

/* ── SHOW RESULTS ── */
async function showResults() {
  const form = document.getElementById('tracker-form');
  const rd   = document.getElementById('results');

  if (form) form.style.display = 'none';
  if (rd)   rd.style.display   = 'block';

  window.scrollTo(0, 0);

  // Save check-in to server
  const sc = sleepScore();

  try {
    const today = new Date().toISOString().split('T')[0];
    await _apiRequest('/api/checkins', 'POST', { score: sc, date: today });

    // Also save to local blob for trend chart
    _currentData.checkInHistory.push({
      date: today,
      score: sc,
      answers:  { ...answers },
      lAnswers: { ...lAnswers }
    });
    await saveUserData();
  } catch (e) {
    console.error('Check-in save failed:', e.message);
  }

  // Build results UI
  const sc2 = sleepScore();
  const pr  = phoneRisk();
  const fb  = buildLocalFeedback(answers, lAnswers, sc2);
  renderResultsUI(rd, fb, sc2, pr);
}

function renderResultsUI(container, fb, sc, pr) {
  const scoreLabel =
    sc >= 40 ? '🌟 Excellent' :
    sc >= 30 ? '✅ Good'       :
    sc >= 20 ? '⚠️ Fair'      : '🔴 Needs work';

  container.innerHTML = `
    <div class="result-score-card">
      <div class="score-circle">${sc}/50</div>
      <div class="score-label">${scoreLabel}</div>
    </div>

    <div class="result-section">
      <h3>✅ What's going well</h3>
      <p>${fb.whatsGoingWell}</p>
    </div>

    <div class="result-section">
      <h3>🎯 One thing to work on</h3>
      <p>${fb.areaOfImprovement}</p>
    </div>

    <div class="result-section">
      <h3>📋 Your 3 steps</h3>
      <ol>${fb.actions.map(a => `<li>${a}</li>`).join('')}</ol>
    </div>

    <div class="result-section hint-box">
      <p>${fb.gentleReminder}</p>
    </div>

    <button class="btn-primary" onclick="restartForm()">↩ Retake Check-in</button>
  `;
}

function restartForm() {
  const results = document.getElementById('results');
  const form    = document.getElementById('tracker-form');

  if (results) { results.innerHTML = ''; results.style.display = 'none'; }
  if (form)    form.style.display = 'block';

  document.querySelectorAll('.opt,.lbtn').forEach(b => b.classList.remove('sel'));
  Object.keys(answers).forEach(k  => delete answers[k]);
  Object.keys(lAnswers).forEach(k => delete lAnswers[k]);

  const bar = document.getElementById('prog-bar');
  const txt = document.getElementById('prog-txt');
  const btn = document.getElementById('submit-btn');

  if (bar) bar.style.width  = '0%';
  if (txt) txt.textContent  = '0 of 12';
  if (btn) btn.disabled     = true;

  window.scrollTo(0, 0);
}

/* ── LOCAL FEEDBACK ENGINE ── */
function buildLocalFeedback(a, la, sc) {
  const sleep     = a.sleep     || '';
  const phone     = a.phonetime || '';
  const workhours = a.workhours || '';
  const bedtime   = a.bedtime   || '';

  const goodSleep  = sleep === '7–8 hours';
  const shortSleep = sleep === '0–4 hours' || sleep === '5–6 hours';
  const longSleep  = sleep === '9 or more hours';
  const highPhone  = phone === '2–3 hours' || phone === 'more than 3 hours';
  const medPhone   = phone === '30 min–1 hour' || phone === '1–2 hours';
  const noPhone    = phone === 'no phone before bed';
  const overwork   = workhours === '9 or more hours';
  const lateNight  = bedtime === 'after 12 AM' || bedtime === '11 PM–12 AM';
  const earlyBed   = bedtime === 'before 9 PM'  || bedtime === '9 PM–10 PM';

  const feelRested  = la.l3 === 'Yes, always' || la.l3 === 'Most of the time';
  const poorRested  = la.l3 === 'Not really'  || la.l3 === 'No, never';
  const feelEnergy  = la.l5 === 'Yes, always' || la.l5 === 'Most of the time';
  const lowEnergy   = la.l5 === 'Not really'  || la.l5 === 'No, never';
  const sleepyDay   = la.l4 === 'Not really'  || la.l4 === 'No, never';
  const hardSleep   = la.l1 === 'Not really'  || la.l1 === 'No, never';
  const outcomeGood = feelRested && feelEnergy && !sleepyDay;
  const outcomePoor = poorRested || lowEnergy  || sleepyDay;

  /* What's going well */
  let whatsGoingWell =
    goodSleep  && outcomeGood ? `You sleep ${sleep} and feel rested all day. That's exactly what healthy sleep looks like! 🎉` :
    goodSleep  && !outcomeGood? `You sleep ${sleep}, a healthy amount. Focus on improving sleep quality.` :
    longSleep  && outcomeGood ? `You prioritise sleep and it shows in your energy and recovery.` :
    shortSleep && feelEnergy  ? `You maintain good energy even with ${sleep}. A bit more sleep could help further.` :
    noPhone                   ? `Avoiding phone before bed is one of the strongest sleep habits. Keep it up!` :
    earlyBed                  ? `Your early bedtime supports strong recovery and long-term health.` :
    !overwork  && !shortSleep ? `You maintain a balanced lifestyle with enough rest and manageable workload.` :
                                `You're actively tracking your habits — awareness is the first step.`;

  /* One thing to work on */
  let areaOfImprovement =
    highPhone && (outcomePoor || !feelRested) ? `You use your phone ${phone} before bed. Screen exposure delays deep sleep.` :
    medPhone  &&  outcomePoor                 ? `Phone use (${phone}) before bed is likely reducing sleep quality.` :
    shortSleep && outcomePoor                 ? `You sleep ${sleep}. Even an extra hour can improve energy and mood.` :
    overwork  &&  outcomePoor                 ? `Working ${workhours}/day keeps your mind active late. Try stopping 1hr before bed.` :
    lateNight &&  outcomePoor                 ? `Going to bed ${bedtime} is quite late. Shift earlier by 15 min each week.` :
    hardSleep                                 ? `You find it hard to sleep. A calm, screen-free wind-down routine helps.` :
    highPhone &&  outcomeGood                 ? `Even though you feel okay, ${phone} of phone use may slowly reduce deep sleep.` :
    longSleep && !feelEnergy                  ? `You sleep ${sleep} but feel low energy — focus on sleep quality, not just duration.` :
                                                `Try keeping a consistent sleep and wake time every day.`;

  /* 3 action steps */
  const actions = [];

  actions.push(
    goodSleep  ? `🛌 Keep sleeping ${sleep} — you're in a healthy range` :
    shortSleep ? `🛌 Go to bed 15 minutes earlier each week until you reach 7–8 hours` :
    longSleep  ? `🛌 Aim for a consistent 7–8 hours — quality matters more than length` :
                 `🛌 Aim for 7–8 hours of sleep each night`
  );

  actions.push(
    noPhone   ? `📵 Your no-phone-before-bed habit is excellent — keep it` :
    highPhone || medPhone ? `📵 Avoid screens in the last 30 minutes before sleep` :
                 `📵 Put your phone away 30 minutes before sleep`
  );

  actions.push(
    lateNight ? `🌙 Shift bedtime 15 minutes earlier each week` :
    overwork  ? `💼 Stop work at least 1 hour before bed` :
    hardSleep ? `🌙 Do something calm and screen-free for 20–30 minutes before bed` :
                `🌙 Keep a consistent wake-up time even on weekends`
  );

  /* Gentle reminder */
  const gentleReminder =
    outcomeGood ? `You're already doing the right things — consistency will keep your energy stable.` :
    highPhone   ? `You don't need to stop using your phone — just shift it earlier in the evening.` :
    shortSleep  ? `Small gradual changes are more effective than sudden big changes.` :
    overwork    ? `Rest is part of productivity — protecting your wind-down time matters.` :
    lateNight   ? `Small bedtime shifts work best — you don't need a drastic change.` :
                  `Small consistent changes create the biggest long-term improvements.`;

  return { whatsGoingWell, areaOfImprovement, actions, gentleReminder, outcomeGood, outcomePoor };
}

/* tracker nudge helper (used by recommendations) */
const trackerNudge = (habitId, habitLabel) => {
  const habitLogs = _currentData.logs.filter(l => l.habitId === habitId);
  if (habitLogs.length >= 3)
    return `<strong>📊 Your tracker data:</strong> You've logged ${habitLabel} ${habitLogs.length} times! Keep that streak going.`;
  if (habitLogs.length > 0)
    return `<strong>📊 Track it:</strong> Great start! Keep logging your ${habitLabel} daily.`;
  return `<strong>📊 Start tracking:</strong> Open the Habit Tracker tab and log your ${habitLabel}.`;
};

/* ═══════════════════════════════════════
   HABIT TRACKER
═══════════════════════════════════════ */
const HABITS = [
  { id: 'sleep',      name: 'Sleep',       icon: '🌙', unit: 'hrs',  color: '#534AB7' },
  { id: 'work',       name: 'Work',        icon: '💻', unit: 'hrs',  color: '#1D9E75' },
  { id: 'exercise',   name: 'Exercise',    icon: '🏃', unit: 'mins', color: '#BA7517' },
  { id: 'screen',     name: 'Screen time', icon: '📱', unit: 'hrs',  color: '#C0392B' },
  { id: 'reading',    name: 'Reading',     icon: '📚', unit: 'mins', color: '#0F6E56' },
  { id: 'meditation', name: 'Meditation',  icon: '🧘', unit: 'mins', color: '#2EBF8E' }
];

const SOUNDS = [
  { id: 'bell',   name: '🔔 Bell'      },
  { id: 'chime',  name: '🎵 Chime'     },
  { id: 'nature', name: '🌿 Nature'    },
  { id: 'soft',   name: '🎶 Soft tone' }
];

let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playSound(soundId, customDataUrl) {
  if (customDataUrl) { new Audio(customDataUrl).play(); return; }
  const ctx  = getAudioCtx();
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  const freqs = { bell: [523,659,784], chime: [880,1047,1319], nature: [440,554,659], soft: [349,440,523] };
  const f = freqs[soundId] || freqs.bell;
  osc.frequency.setValueAtTime(f[0], ctx.currentTime);
  osc.frequency.setValueAtTime(f[1], ctx.currentTime + 0.15);
  osc.frequency.setValueAtTime(f[2], ctx.currentTime + 0.30);
  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
  osc.start(); osc.stop(ctx.currentTime + 0.8);
}

/* ── TIME HELPERS ── */
function fmt12(time24) {
  if (!time24 || !time24.includes(':')) return { h: '12', m: '00', ampm: 'AM' };
  let [h, m] = time24.split(':').map(Number);
  const ampm = h < 12 ? 'AM' : 'PM';
  h = h % 12 || 12;
  return { h: String(h), m: String(m).padStart(2, '0'), ampm };
}

function to24(h, m, ampm) {
  let hour = parseInt(h) || 0;
  const min = parseInt(m) || 0;
  if (ampm === 'PM' && hour !== 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;
  return `${String(hour).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
}

function calcDiff(from, to) {
  if (!from || !to) return '';
  const [h1, m1] = from.split(':').map(Number);
  const [h2, m2] = to.split(':').map(Number);
  let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (mins <= 0) mins += 1440;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}

function formatTime12(time24) {
  if (!time24) return '';
  const f = fmt12(time24);
  return `${f.h}:${f.m} ${f.ampm}`;
}

function getAmPmVal(prefix) {
  const h    = document.getElementById(prefix + '-h')?.value  || '12';
  const m    = document.getElementById(prefix + '-m')?.value  || '00';
  const isAM = document.getElementById(prefix + '-am')?.classList.contains('sel');
  return to24(h, m, isAM ? 'AM' : 'PM');
}

function setAmPm(prefix, val) {
  document.getElementById(prefix + '-am')?.classList.toggle('sel', val === 'AM');
  document.getElementById(prefix + '-pm')?.classList.toggle('sel', val === 'PM');
  const hId = prefix.replace('log-', '').replace('alarm-', '').split('-')[0];
  if (prefix.startsWith('log-')) updateDiff(hId);
}

function updateDiff(hId) {
  const start = getAmPmVal(`log-${hId}-start`);
  const end   = getAmPmVal(`log-${hId}-end`);
  const diff  = calcDiff(start, end);
  const el    = document.getElementById(`diff-${hId}`);
  if (el) el.textContent = diff ? `⏱ Duration: ${diff}` : '';

  if (diff) {
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (mins < 0) mins += 1440;
    const habit  = HABITS.find(h => h.id === hId);
    const durEl  = document.getElementById('dur-' + hId);
    if (durEl && habit) durEl.value = habit.unit === 'hrs' ? (mins / 60).toFixed(1) : mins;
  }
}

function ampmPicker(prefix, label, defaultVal) {
  const f = fmt12(defaultVal);
  return `<div class="ampm-field">
    <label>${label}</label>
    <div class="ampm-wrap">
      <input class="ampm-hour" id="${prefix}-h" type="number" min="1" max="12" value="${f.h}" placeholder="12">
      <span class="ampm-sep">:</span>
      <input class="ampm-min" id="${prefix}-m" type="number" min="0" max="59" value="${f.m}" placeholder="00">
      <div class="ampm-toggle">
        <button type="button" class="ampm-btn${f.ampm==='AM'?' sel':''}" id="${prefix}-am" onclick="setAmPm('${prefix}','AM')" tabindex="-1">AM</button>
        <button type="button" class="ampm-btn${f.ampm==='PM'?' sel':''}" id="${prefix}-pm" onclick="setAmPm('${prefix}','PM')" tabindex="-1">PM</button>
      </div>
    </div>
  </div>`;
}

/* ── BUILD HABIT CARDS ── */
async function buildHabitCards() {
  const wrap = document.getElementById('habit-cards-wrap');
  if (!wrap) return;
  wrap.innerHTML = '<div class="loading">Syncing habits...</div>';

  const ud = await getUserData();
  if (!ud) return;
  wrap.innerHTML = '';

  HABITS.forEach(h => {
    const enabled  = !!ud.habitEnabled[h.id];
    const alarm    = ud.alarms[h.id] || {};
    const selSound = ud.selectedSounds[h.id] || 'bell';

    const card = document.createElement('div');
    card.className = 'habit-card';
    card.id = 'habit-card-' + h.id;
    card.innerHTML = `
      <div class="habit-card-head">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="habit-icon-btn" style="background:${h.color}18;border-color:${h.color}40" onclick="toggleHabit('${h.id}')">${h.icon}</div>
          <div>
            <div class="habit-name">${h.name}</div>
            ${alarm.active
              ? `<div class="alarm-mini-badge">⏰ ${fmt12(alarm.from).h}:${fmt12(alarm.from).m} ${fmt12(alarm.from).ampm} – ${fmt12(alarm.to).h}:${fmt12(alarm.to).m} ${fmt12(alarm.to).ampm}</div>`
              : '<div class="alarm-mini-badge muted">No alarm set</div>'}
          </div>
        </div>
        <div class="habit-card-actions">
          <button class="icon-action-btn ${alarm.active ? 'alarm-on' : ''}" onclick="toggleAlarmPanel('${h.id}')">⏰</button>
          <button class="icon-action-btn log-action-btn" onclick="toggleLogPanel('${h.id}')">✏️</button>
          <div class="habit-toggle" onclick="toggleHabit('${h.id}')">
            <div class="toggle-track ${enabled ? 'on' : ''}" id="toggle-${h.id}"><div class="toggle-knob"></div></div>
          </div>
        </div>
      </div>

      <div class="alarm-panel" id="alarm-panel-${h.id}" style="display:none">
        <div class="panel-section-lbl">⏰ Set alarm window</div>
        <div class="alarm-ampm-row">
          ${ampmPicker(`alarm-${h.id}-from`, 'From', alarm.from || '08:00')}
          <div class="ampm-arrow">→</div>
          ${ampmPicker(`alarm-${h.id}-to`, 'Until', alarm.to || '22:00')}
        </div>
        <div class="sound-row" style="margin-top:10px">
          <div class="sound-opts">
            ${SOUNDS.map(s => `<button class="sound-btn ${selSound===s.id?'sel':''}" onclick="selectSound('${h.id}','${s.id}',this)">${s.name}</button>`).join('')}
          </div>
        </div>
        <button class="set-alarm-btn" onclick="setAlarmAmPm('${h.id}')">${alarm.active ? 'Update Alarm' : 'Set Alarm'}</button>
      </div>

      <div class="log-panel" id="log-panel-${h.id}" style="display:none">
        <div class="log-ampm-row">
          ${ampmPicker(`log-${h.id}-start`, 'Start', '09:00')}
          <div class="ampm-arrow">→</div>
          ${ampmPicker(`log-${h.id}-end`, 'End', '10:00')}
        </div>
        <div class="diff-display" id="diff-${h.id}"></div>
        <div class="dur-manual-row">
          <input type="number" id="dur-${h.id}" step="0.5" placeholder="Duration (${h.unit})" class="dur-input">
        </div>
        <textarea class="log-note" id="note-${h.id}" placeholder="Note (optional)..."></textarea>
        <button class="log-btn" onclick="logHabit('${h.id}')">Save Log ✓</button>
      </div>`;

    wrap.appendChild(card);

    // Bind live diff listeners after DOM is ready
    setTimeout(() => {
      ['h', 'm'].forEach(sub => {
        ['input', 'change'].forEach(ev => {
          document.getElementById(`log-${h.id}-start-${sub}`)?.addEventListener(ev, () => updateDiff(h.id));
          document.getElementById(`log-${h.id}-end-${sub}`)?.addEventListener(ev, () => updateDiff(h.id));
        });
      });
    }, 0);
  });
}

/* ── HABIT INTERACTIONS ── */
function toggleAlarmPanel(id) {
  const p = document.getElementById('alarm-panel-' + id);
  const l = document.getElementById('log-panel-'   + id);
  if (l) l.style.display = 'none';
  if (p) p.style.display = p.style.display === 'none' ? 'block' : 'none';
}

function toggleLogPanel(id) {
  const p = document.getElementById('log-panel-'   + id);
  const a = document.getElementById('alarm-panel-' + id);
  if (a) a.style.display = 'none';
  if (p) {
    p.style.display = p.style.display === 'none' ? 'block' : 'none';
    if (p.style.display === 'block') updateDiff(id);
  }
}

async function setAlarmAmPm(id) {
  const ud = await getUserData();
  if (!ud) return;

  const from = getAmPmVal(`alarm-${id}-from`);
  const to   = getAmPmVal(`alarm-${id}-to`);

  ud.alarms[id] = { from, to, active: true };
  await saveUserData();
  await buildHabitCards();

  setTimeout(() => {
    const p = document.getElementById('alarm-panel-' + id);
    if (p) p.style.display = 'block';
  }, 50);
}

async function clearAlarm(id) {
  const ud = await getUserData();
  if (!ud) return;
  ud.alarms[id] = { active: false };
  await saveUserData();
  buildHabitCards();
}

async function toggleHabit(id) {
  const ud = await getUserData();
  if (!ud) return;
  ud.habitEnabled[id] = !ud.habitEnabled[id];
  await saveUserData();
  buildHabitCards();
}

async function selectSound(habitId, soundId, btn) {
  const ud = await getUserData();
  if (!ud) return;
  ud.selectedSounds[habitId] = soundId;

  btn.closest('.sound-opts')?.querySelectorAll('.sound-btn').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');

  playSound(soundId, ud.customSounds[habitId]);
  await saveUserData();
}

async function uploadSound(habitId, input) {
  const ud   = await getUserData();
  const file = input.files[0];
  if (!ud || !file) return;

  const reader    = new FileReader();
  reader.onload   = async (e) => {
    ud.customSounds[habitId]   = e.target.result;
    ud.selectedSounds[habitId] = 'custom';
    await saveUserData();
    const upBtn = input.previousElementSibling;
    if (upBtn) upBtn.textContent = '✅ ' + file.name.substring(0, 16);
    playSound('custom', e.target.result);
  };
  reader.readAsDataURL(file);
}

/* ── LOG HABIT ── */
async function logHabit(id) {
  const ud = await getUserData();
  if (!ud) return;

  const durInput  = document.getElementById('dur-' + id);
  const noteInput = document.getElementById('note-' + id);
  const dur       = parseFloat(durInput?.value) || 0;
  const startT    = getAmPmVal(`log-${id}-start`);
  const endT      = getAmPmVal(`log-${id}-end`);
  const habit     = HABITS.find(h => h.id === id);

  if (!dur && !startT) { alert('Please enter a duration or start/end time.'); return; }

  const entry = {
    id:        Date.now(),
    habitId:   id,
    habitName: habit.name,
    habitIcon: habit.icon,
    date:      new Date().toISOString().split('T')[0],
    duration:  dur,
    unit:      habit.unit,
    startTime: formatTime12(startT),
    endTime:   formatTime12(endT),
    note:      noteInput?.value || ''
  };

  ud.logs.push(entry);

  try {
    await saveUserData();

    if (durInput)  durInput.value  = '';
    if (noteInput) noteInput.value = '';

    const btn = document.querySelector(`#habit-card-${id} .log-btn`);
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = '✅ Saved!'; btn.style.background = '#27ae60';
      setTimeout(() => { btn.textContent = orig; btn.style.background = ''; }, 1500);
    }

    renderCalendar(); renderCalendar2(); renderTrends(); renderHistory();
  } catch (err) {
    alert('Failed to save log. Please check your connection.');
  }
}

/* ═══════════════════════════════════════
   ALARM WATCHER
═══════════════════════════════════════ */
let alarmInterval = null;
let firedToday    = {};

function startAlarmWatcher() {
  alarmInterval = setInterval(checkAlarms, 30000);
  checkAlarms();
}

function stopAlarmWatcher() {
  if (alarmInterval) clearInterval(alarmInterval);
  alarmInterval = null;
  firedToday    = {};
}

async function checkAlarms() {
  const ud = await getUserData();
  if (!ud) return;

  const now     = new Date();
  const hm      = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
  const dayKey  = now.toDateString();

  HABITS.forEach(h => {
    const alarm = ud.alarms[h.id];
    if (!alarm || !alarm.active) return;
    const key = h.id + '_' + dayKey;
    if (firedToday[key]) return;
    if (hm >= alarm.from && hm <= alarm.to) {
      firedToday[key] = true;
      triggerAlarm(h, ud.selectedSounds[h.id] || 'bell', ud.customSounds[h.id]);
    }
  });
}

function triggerAlarm(habit, soundId, customData) {
  playSound(soundId, customData);
  currentAlarmHabit = habit;
  const el = id => document.getElementById(id);
  if (el('alarm-modal-icon'))  el('alarm-modal-icon').textContent  = habit.icon;
  if (el('alarm-modal-title')) el('alarm-modal-title').textContent = `Time to log ${habit.name}!`;
  if (el('alarm-modal-sub'))   el('alarm-modal-sub').textContent   = `Your ${habit.name.toLowerCase()} reminder is here. Ready to record?`;
  if (el('alarm-modal'))       el('alarm-modal').style.display     = 'flex';
}

function dismissAlarm() {
  document.getElementById('alarm-modal').style.display = 'none';
  currentAlarmHabit = null;
}

function goLogFromAlarm() {
  document.getElementById('alarm-modal').style.display = 'none';
  if (currentAlarmHabit) {
    showTab('tracker');
    setTimeout(() => {
      document.getElementById('dur-' + currentAlarmHabit.id)?.focus();
    }, 300);
  }
  currentAlarmHabit = null;
}

/* ═══════════════════════════════════════
   CALENDAR (History tab)
═══════════════════════════════════════ */
let calYear   = new Date().getFullYear();
let calMonth  = new Date().getMonth();
let selectedDay = null;

function changeMonth(delta) {
  calMonth += delta;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth < 0)  { calMonth = 11; calYear--; }
  renderCalendar();
}

async function renderCalendar() {
  const label = document.getElementById('cal-month-label');
  const grid  = document.getElementById('cal-grid');
  if (!label || !grid) return;

  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  label.textContent = months[calMonth] + ' ' + calYear;
  grid.innerHTML    = '';

  ['Su','Mo','Tu','We','Th','Fr','Sa'].forEach(d => {
    const el = document.createElement('div');
    el.className = 'cal-day-name'; el.textContent = d; grid.appendChild(el);
  });

  const first       = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const today       = new Date();
  const todayStr    = today.toISOString().split('T')[0];

  const ud       = await getUserData();
  const logDates = new Set((ud?.logs || []).map(l => l.date));

  for (let i = 0; i < first; i++) {
    const el = document.createElement('div');
    el.className = 'cal-day other-month';
    el.textContent = new Date(calYear, calMonth, -(first - i - 1)).getDate();
    grid.appendChild(el);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const el = document.createElement('div');
    el.className = 'cal-day';
    el.textContent = d;
    if (today.getFullYear()===calYear && today.getMonth()===calMonth && today.getDate()===d) el.classList.add('today');
    if (logDates.has(dateStr)) el.classList.add('has-log');
    if (selectedDay === dateStr) el.classList.add('selected');
    el.onclick = () => { selectedDay = dateStr; renderCalendar(); showDayLogs(dateStr); };
    grid.appendChild(el);
  }

  if (selectedDay) showDayLogs(selectedDay);
}

async function showDayLogs(dateStr) {
  const entries = document.getElementById('day-log-entries');
  const title   = document.getElementById('day-log-title');
  if (!entries || !title) return;

  const ud      = await getUserData();
  const isFuture = dateStr > new Date().toISOString().split('T')[0];
  const d        = new Date(dateStr + 'T12:00:00');
  title.textContent = d.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' }) + (isFuture ? ' 🔮' : '');

  entries.innerHTML = '';
  const dayLogs = (ud?.logs || []).filter(l => l.date === dateStr);

  if (!dayLogs.length) {
    entries.innerHTML = `<div class="empty-msg">No entries for this day.</div>`;
    return;
  }

  dayLogs.forEach(l => {
    const item = document.createElement('div');
    item.className = 'log-entry-item';
    item.innerHTML = `
      <div class="log-entry-icon">${l.habitIcon}</div>
      <div class="log-entry-meta">
        <div class="log-entry-habit">${l.habitName}</div>
        <div class="log-entry-dur">${l.startTime || ''} ${l.duration} ${l.unit}</div>
      </div>
      <button class="delete-log-btn" onclick="deleteLog('${l.id}')">🗑</button>`;
    entries.appendChild(item);
  });
}

/* ── DELETE LOG ── */
async function deleteLog(logId) {
  if (!confirm('Delete this log entry?')) return;

  const ud = await getUserData();
  ud.logs  = ud.logs.filter(l => String(l.id) !== String(logId));

  try {
    await saveUserData();
    renderCalendar(); renderCalendar2(); renderHistory(); renderTrends();
  } catch (err) {
    alert('Failed to delete log from server.');
  }
}

/* ═══════════════════════════════════════
   CALENDAR 2 (Tracker tab mini-calendar)
═══════════════════════════════════════ */
let cal2Year  = new Date().getFullYear();
let cal2Month = new Date().getMonth();
let selectedDay2 = null;

function changeMonth2(delta) {
  cal2Month += delta;
  if (cal2Month > 11) { cal2Month = 0; cal2Year++; }
  if (cal2Month < 0)  { cal2Month = 11; cal2Year--; }
  renderCalendar2();
}

async function renderCalendar2() {
  const label = document.getElementById('cal2-month-label');
  const grid  = document.getElementById('cal2-grid');
  if (!label || !grid) return;

  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  label.textContent = months[cal2Month] + ' ' + cal2Year;
  grid.innerHTML    = '';

  ['Su','Mo','Tu','We','Th','Fr','Sa'].forEach(d => {
    const el = document.createElement('div');
    el.className = 'cal-day-name'; el.textContent = d; grid.appendChild(el);
  });

  const first       = new Date(cal2Year, cal2Month, 1).getDay();
  const daysInMonth = new Date(cal2Year, cal2Month + 1, 0).getDate();
  const today       = new Date();

  const ud       = await getUserData();
  const logDates = new Set((ud?.logs || []).map(l => l.date));

  for (let i = 0; i < first; i++) {
    const el = document.createElement('div');
    el.className = 'cal-day other-month';
    el.textContent = new Date(cal2Year, cal2Month, -(first - i - 1)).getDate();
    grid.appendChild(el);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${cal2Year}-${String(cal2Month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const el = document.createElement('div');
    el.className = 'cal-day';
    el.textContent = d;
    if (today.getFullYear()===cal2Year && today.getMonth()===cal2Month && today.getDate()===d) el.classList.add('today');
    if (logDates.has(dateStr)) el.classList.add('has-log');
    if (selectedDay2 === dateStr) el.classList.add('selected');
    el.onclick = () => { selectedDay2 = dateStr; renderCalendar2(); showDayLogs2(dateStr); };
    grid.appendChild(el);
  }

  if (selectedDay2) showDayLogs2(selectedDay2);
}

async function showDayLogs2(dateStr) {
  const panel   = document.getElementById('day2-log-panel');
  const title   = document.getElementById('day2-log-title');
  const entries = document.getElementById('day2-log-entries');
  if (!panel || !title || !entries) return;

  panel.style.display = 'block';
  const ud       = await getUserData();
  const isFuture = dateStr > new Date().toISOString().split('T')[0];
  const d        = new Date(dateStr + 'T12:00:00');

  title.textContent = d.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' }) + (isFuture ? ' 🔮' : '');
  entries.innerHTML = '';

  const dayLogs = (ud?.logs || []).filter(l => l.date === dateStr);

  if (!dayLogs.length) {
    entries.innerHTML = `<div style="font-size:13px;color:var(--hint);padding:8px 0">${isFuture ? 'No plans yet.' : 'Nothing logged for this day.'}</div>`;
    return;
  }

  dayLogs.forEach(l => {
    const item = document.createElement('div');
    item.className = 'log-entry-item';
    const dispUnit = l.displayUnit || l.unit || 'hrs';
    const dispDur  = dispUnit === 'mins' && l.unit === 'hrs' ? Math.round(l.duration * 60) : l.duration;
    item.innerHTML = `
      <div class="log-entry-icon">${l.habitIcon}</div>
      <div class="log-entry-meta">
        <div class="log-entry-habit">${l.habitName}</div>
        <div class="log-entry-dur">${l.startTime ? `${l.startTime}–${l.endTime || '?'} · ` : ''}${dispDur} ${dispUnit}</div>
        ${l.note ? `<div class="log-entry-note">💬 ${l.note}</div>` : ''}
      </div>
      <button onclick="deleteLog('${l.id}')" class="delete-btn">🗑</button>`;
    entries.appendChild(item);
  });
}

/* ═══════════════════════════════════════
   NEW LOG FORM (Tracker quick-add)
═══════════════════════════════════════ */
let _lfCat   = '';
let _lfIcon  = '📋';

const LF_CAT_HABIT_MAP = {
  'Sleep':'sleep','Work':'work','Exercise':'exercise','Screen Use':'screen',
  'Reading':'reading','Meditation':'meditation','Meals':'meals','Studies':'studies'
};
const LF_CAT_UNIT_MAP = {
  'Sleep':'hrs','Work':'hrs','Screen Use':'hrs','Meals':'hrs',
  'Exercise':'mins','Reading':'mins','Meditation':'mins','Studies':'mins'
};

function lfInit() {
  const dateEl = document.getElementById('lf-date');
  if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];

  ['lf-start-h','lf-start-m','lf-end-h','lf-end-m'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', lfUpdateDiff);
  });
  lfUpdateDiff();
}

function lfSetAmPm(side, val) {
  document.getElementById(`lf-${side}-am`)?.classList.toggle('sel', val === 'AM');
  document.getElementById(`lf-${side}-pm`)?.classList.toggle('sel', val === 'PM');
  lfUpdateDiff();
}

function _lfGetTime(side) {
  const h    = document.getElementById(`lf-${side}-h`)?.value  || '8';
  const m    = document.getElementById(`lf-${side}-m`)?.value  || '00';
  const isAM = document.getElementById(`lf-${side}-am`)?.classList.contains('sel');
  return to24(h, m, isAM ? 'AM' : 'PM');
}

function lfUpdateDiff() {
  const from = _lfGetTime('start');
  const to   = _lfGetTime('end');
  const diff = calcDiff(from, to);
  const el   = document.getElementById('lf-diff');
  if (el) el.textContent = diff ? `⏱ Duration: ${diff}` : '';
}

function lfSelectCat(cat, icon, btn) {
  _lfCat  = cat;
  _lfIcon = icon;
  document.querySelectorAll('.lf-cat-btn').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');
}

async function lfSaveLog() {
  const customText = document.getElementById('lf-custom')?.value.trim();
  const cat        = customText || _lfCat;
  const icon       = customText ? '✍' : _lfIcon;
  const msg        = document.getElementById('lf-msg');
  const dateVal    = document.getElementById('lf-date')?.value;

  if (!cat || !dateVal) {
    if (msg) { msg.textContent = 'Pick a category and date.'; msg.className = 'auth-msg err'; }
    return;
  }

  const from  = _lfGetTime('start');
  const to    = _lfGetTime('end');
  const [h1, m1] = from.split(':').map(Number);
  const [h2, m2] = to.split(':').map(Number);
  let durationMins = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (durationMins < 0) durationMins += 1440;

  const unit    = LF_CAT_UNIT_MAP[cat] || 'hrs';
  const habitId = LF_CAT_HABIT_MAP[cat] || cat.toLowerCase().replace(/\s+/g, '-');
  const ud      = await getUserData();
  if (!ud) return;

  const entry = {
    id:          Date.now(),
    habitId,
    habitName:   cat,
    habitIcon:   icon,
    date:        dateVal,
    duration:    +(durationMins / 60).toFixed(4),
    unit:        'hrs',
    displayUnit: unit,
    startTime:   from,
    endTime:     to,
    note:        document.getElementById('lf-note')?.value.trim() || ''
  };

  if (document.getElementById('lf-reminder-check')?.checked) {
    if (!ud.quickAlarms) ud.quickAlarms = [];
    ud.quickAlarms.push({ id: entry.id, date: dateVal, fromTime: from, toTime: to, category: cat });
  }

  ud.logs.push(entry);

  try {
    await saveUserData();
    if (msg) { msg.textContent = `✅ Logged! ${cat}`; msg.className = 'auth-msg ok'; }
    if (document.getElementById('lf-note')) document.getElementById('lf-note').value = '';
    renderCalendar2(); renderCalendar(); renderTrends(); renderHistory();
  } catch (e) {
    if (msg) { msg.textContent = 'Error saving to database.'; msg.className = 'auth-msg err'; }
  }

  setTimeout(() => { if (msg) { msg.textContent = ''; msg.className = 'auth-msg'; } }, 3000);
}

/* ═══════════════════════════════════════
   SCHEDULE (Tracker schedule view)
═══════════════════════════════════════ */
async function renderTrackerSchedules() {
  const container = document.getElementById('tracker-schedules');
  if (!container) return;

  const ud = await getUserData();
  const schedules = ud?.schedules || [];

  if (!schedules.length) {
    container.innerHTML = `<div class="empty-msg">No schedules yet. Add a log above to get started!</div>`;
    return;
  }

  container.innerHTML = schedules.map(s => `
    <div class="schedule-item">
      <div class="schedule-cat">${s.category}</div>
      <div class="schedule-time">${formatTime12(s.fromTime)} – ${formatTime12(s.toTime)}</div>
      <div class="schedule-date">${s.date}</div>
    </div>
  `).join('');
}

async function convertCalEventToSchedule(title, date) {
  const ud = await getUserData();
  if (!ud) return;
  if (!ud.schedules) ud.schedules = [];

  const titleLower = title.toLowerCase();
  let category     = 'Other';
  const catMap     = {
    sleep:'Sleep', meeting:'Work', work:'Work', class:'Studies',
    study:'Studies', exercise:'Exercise', gym:'Exercise', run:'Exercise',
    meal:'Meals', lunch:'Meals', dinner:'Meals', breakfast:'Meals',
    reading:'Reading', book:'Reading', meditation:'Meditation', yoga:'Meditation'
  };

  for (const [key, val] of Object.entries(catMap)) {
    if (titleLower.includes(key)) { category = val; break; }
  }

  const entry = {
    id: Date.now(), category, date,
    fromTime: '09:00', toTime: '10:00', durationMins: 60,
    createdAt: new Date().toISOString(), fromCal: true, calTitle: title
  };

  ud.schedules.push(entry);

  try {
    await saveUserData();
    renderTrackerSchedules();
    alert(`✅ Added "${title}" to your Tracker schedules!`);
  } catch (err) {
    alert('Error saving schedule to server.');
  }
}

/* ═══════════════════════════════════════
   RENDER HISTORY (All logs list)
═══════════════════════════════════════ */
async function renderHistory() {
  const container = document.getElementById('history-list');
  if (!container) return;

  const ud   = await getUserData();
  const logs = ud?.logs || [];

  if (!logs.length) {
    container.innerHTML = `<div class="empty-msg">No activity logs yet. Start tracking!</div>`;
    return;
  }

  // Group by date
  const byDate = {};
  logs.forEach(l => {
    if (!byDate[l.date]) byDate[l.date] = [];
    byDate[l.date].push(l);
  });

  const sortedDates = Object.keys(byDate).sort().reverse();

  container.innerHTML = sortedDates.map(date => {
    const d     = new Date(date + 'T12:00:00');
    const label = d.toLocaleDateString('en-US', { weekday:'long', month:'short', day:'numeric' });
    const items = byDate[date].map(l => `
      <div class="log-entry-item">
        <div class="log-entry-icon">${l.habitIcon}</div>
        <div class="log-entry-meta">
          <div class="log-entry-habit">${l.habitName}</div>
          <div class="log-entry-dur">${l.startTime ? l.startTime + ' · ' : ''}${_fmtLogDuration(l)}</div>
          ${l.note ? `<div class="log-entry-note">💬 ${l.note}</div>` : ''}
        </div>
        <button class="delete-log-btn" onclick="deleteLog('${l.id}')">🗑</button>
      </div>
    `).join('');

    return `<div class="history-day-group"><div class="history-date-label">${label}</div>${items}</div>`;
  }).join('');
}

function _fmtLogDuration(l) {
  const hrs      = l.unit === 'mins' ? l.duration / 60 : Number(l.duration) || 0;
  const totalMins = Math.round(hrs * 60);
  if (totalMins < 1)  return '< 1m';
  if (totalMins < 60) return totalMins + 'min';
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}

/* ═══════════════════════════════════════
   TRENDS & CHARTS
═══════════════════════════════════════ */
let chartInstances = {};
const TREND_PALETTE = ['#1D9E75','#534AB7','#BA7517','#C0392B','#2980B9'];
let _trendFocusKey = null;

async function renderTrends() {
  const content = document.getElementById('trends-content');
  if (!content) return;

  const ud = await getUserData();
  if (!ud || !ud.logs.length) {
    content.innerHTML = `<div class="no-data-msg">No logs found. Start tracking to see trends!</div>`;
    return;
  }

  Object.values(chartInstances).forEach(c => c.destroy());
  chartInstances = {};
  content.innerHTML = '';

  /* Aggregate data */
  const byActivity = {};
  ud.logs.forEach(l => {
    const key = l.habitId || 'misc';
    if (!byActivity[key]) byActivity[key] = { name: l.habitName, icon: l.habitIcon, byDate: {} };
    byActivity[key].byDate[l.date] = (byActivity[key].byDate[l.date] || 0) + l.duration;
  });

  const allDates = [...new Set(ud.logs.map(l => l.date))].sort();
  const datasets = Object.keys(byActivity).map((key, i) => {
    const act = byActivity[key];
    return {
      label: `${act.icon} ${act.name}`,
      data:  allDates.map(d => act.byDate[d] || 0),
      borderColor: TREND_PALETTE[i % TREND_PALETTE.length],
      backgroundColor: TREND_PALETTE[i % TREND_PALETTE.length] + '18',
      tension: 0.4,
      fill: false,
      _key: key
    };
  });

  content.innerHTML = `
    <div class="chart-card">
      <div class="chart-title">📈 Activity Trends</div>
      <div style="position:relative;width:100%;height:220px">
        <canvas id="chart-combined-trends"></canvas>
      </div>
      <div id="trend-badges" class="trend-acts-grid"></div>
    </div>`;

  // Check-in score chart
  if (ud.checkInHistory?.length > 1) {
    const scoreCard = buildScoreChart(ud.checkInHistory);
    content.appendChild(scoreCard);

    const insightCard = buildInsight(ud.logs, ud.checkInHistory);
    if (insightCard) content.appendChild(insightCard);
  }

  // Render main chart
  const ctx = document.getElementById('chart-combined-trends');
  if (ctx) {
    chartInstances['combined'] = new Chart(ctx, {
      type: 'line',
      data: { labels: allDates, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: 'bottom' },
          tooltip: {
            callbacks: {
              label: c => c.parsed.y !== null ? ` ${c.dataset.label}: ${c.parsed.y.toFixed(1)} hrs` : null
            }
          }
        },
        scales: {
          x: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 11 }, maxRotation: 45 } },
          y: { min: 0, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 11 }, callback: v => v + 'h' } }
        }
      }
    });
  }

  // Render activity badges
  const badges = document.getElementById('trend-badges');
  if (badges) {
    badges.innerHTML = datasets.map((ds, i) => `
      <button class="trend-badge-btn" style="border-color:${TREND_PALETTE[i%TREND_PALETTE.length]}"
        onclick="applyFocus('${ds._key}')">
        ${ds.label}
      </button>
    `).join('');
  }
}

function applyFocus(key) {
  _trendFocusKey = _trendFocusKey === key ? null : key;
  const chart    = chartInstances['combined'];
  if (!chart) return;

  chart.data.datasets.forEach(ds => {
    ds.hidden = _trendFocusKey ? ds._key !== _trendFocusKey : false;
  });
  chart.update();
}

function buildScoreChart(history) {
  const card   = document.createElement('div');
  card.className = 'chart-card';

  const labels = history.map(h => h.date ? new Date(h.date).toLocaleDateString('en-US', { month:'short', day:'numeric' }) : '?');
  const scores = history.map(h => h.score);
  const trend  = calcTrend(scores);

  card.innerHTML = `
    <div class="chart-title">Sleep score over time</div>
    <div class="chart-sub">Based on your mood & energy check-ins</div>
    <div style="position:relative;width:100%;height:180px">
      <canvas id="chart-score"></canvas>
    </div>
    <div class="trend-badge ${trend.dir}" style="margin-top:10px">
      ${trend.dir === 'up' ? '↑ Improving' : trend.dir === 'down' ? '↓ Declining' : '→ Stable'}
      (avg ${Math.round(trend.avg)}/50)
    </div>
    <div class="chart-rec">${getScoreRec(trend)}</div>`;

  setTimeout(() => {
    const ctx = document.getElementById('chart-score');
    if (!ctx) return;
    if (chartInstances['score']) chartInstances['score'].destroy();
    chartInstances['score'] = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Sleep score', data: scores,
          borderColor: '#1D9E75', backgroundColor: 'rgba(29,158,117,0.08)',
          pointBackgroundColor: '#1D9E75', tension: 0.35, fill: true
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { min: 0, max: 50, ticks: { stepSize: 10 } } }
      }
    });
  }, 50);

  return card;
}

function calcTrend(vals) {
  if (!vals || !vals.length) return { dir:'neutral', avg:0, slope:0 };
  const avg = vals.reduce((a,b) => a + b, 0) / vals.length;
  if (vals.length < 2) return { dir:'neutral', avg, slope:0 };
  const n   = vals.length;
  const sumX  = (n * (n-1)) / 2;
  const sumY  = vals.reduce((a,b) => a+b, 0);
  const sumXY = vals.reduce((p,c,i) => p + i*c, 0);
  const sumXX = (n*(n-1)*(2*n-1)) / 6;
  const slope = (n*sumXY - sumX*sumY) / (n*sumXX - sumX*sumX);
  const dir   = Math.abs(slope) < 0.05 ? 'neutral' : slope > 0 ? 'up' : 'down';
  return { dir, avg, slope };
}

function getScoreRec(trend) {
  const messages = {
    up:      `<strong>Great trajectory!</strong> Your sleep quality is improving. Keep your routine consistent.`,
    down:    `<strong>Your sleep score is declining.</strong> Check if work hours or screen time have increased.`,
    neutral: `<strong>Stable score.</strong> To move the needle, focus on limiting phone use 30 mins before bed.`
  };
  return messages[trend.dir] || messages.neutral;
}

function buildInsight(logs, checkIns) {
  if (checkIns.length < 2 || !logs.length) return null;
  const card = document.createElement('div');
  card.className = 'chart-card';

  const sleepLogs = logs.filter(l => l.habitId === 'sleep');
  if (sleepLogs.length < 2) {
    card.innerHTML = `<div class="chart-title">💡 Insight</div><div class="chart-sub">Log more sleep data to unlock correlations.</div>`;
    return card;
  }

  const lastScore = checkIns[checkIns.length - 1].score;
  const sleepAvg  = sleepLogs.reduce((a,b) => a + b.duration, 0) / sleepLogs.length;
  const insight   = lastScore > 35
    ? `Your recent score is strong (${lastScore}/50). Your average sleep of ${sleepAvg.toFixed(1)} hrs supports this.`
    : `Your score is ${lastScore}/50. With an average of ${sleepAvg.toFixed(1)} hrs, try increasing consistency.`;

  card.innerHTML = `<div class="chart-title">💡 Key Insight</div><div class="insight-text">${insight}</div>`;
  return card;
}

/* ═══════════════════════════════════════
   EXPORT
═══════════════════════════════════════ */
async function exportCSV() {
  const ud = await getUserData();
  if (!ud || !ud.logs.length) { alert('No logs to export yet.'); return; }

  const rows = [['Date','Habit','Duration','Unit','Start','End','Note']];
  ud.logs.forEach(l => rows.push([l.date, l.habitName, l.duration, l.unit, l.startTime||'', l.endTime||'', l.note||'']));

  const csv  = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'quick-tracker-logs.csv';
  a.click();
}

async function exportExcel() {
  const ud = await getUserData();
  if (!ud || !ud.logs.length) { alert('No logs to export yet.'); return; }

  const rows = [['Date','Habit','Duration','Unit','Start Time','End Time','Note']];
  ud.logs.forEach(l => rows.push([l.date, l.habitName, l.duration, l.unit, l.startTime||'', l.endTime||'', l.note||'']));

  const header = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
    xmlns:x="urn:schemas-microsoft-com:office:excel"
    xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="UTF-8">
    <style>td{font-family:Calibri;font-size:11pt;padding:4px;border:1px solid #ccc}th{background:#1D9E75;color:#fff;font-weight:600}</style>
    </head><body><table>`;

  const htmlRows = rows.map((r,i) =>
    `<tr>${r.map(c => `<${i===0?'th':'td'}>${c}</${i===0?'th':'td'}>`).join('')}</tr>`
  ).join('');

  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(new Blob([header + htmlRows + '</table></body></html>'], { type: 'application/vnd.ms-excel' }));
  a.download = 'quick-tracker-logs.xls';
  a.click();
}

/* ═══════════════════════════════════════
   SETTINGS (Profile modal — API version)
═══════════════════════════════════════ */

/* deleteAccount — needs server endpoint */
async function deleteAccount() {
  if (!currentUser) return;
  if (!confirm(`Delete account "@${currentUser.username}"? This cannot be undone.`)) return;

  try {
    await _apiRequest('/api/account', 'DELETE');
  } catch (e) { /* server may not have this endpoint yet — proceed client-side */ }

  sessionStorage.clear();
  currentUser  = null;
  _authToken   = null;
  location.reload();
}

/* ═══════════════════════════════════════
   ADD ALARM MODAL
═══════════════════════════════════════ */
const AA_CAT_ICONS = {
  'Studies':'📚','Sleep':'😴','Screen Use':'📱','Exercise':'🏃','Meals':'🍽','Other':'✍'
};

let _aaSound       = 'bell';
let _aaCustomSound = null;
let _aaSelectedCat = '';

function openAddAlarmModal() {
  _aaSound = 'bell'; _aaCustomSound = null; _aaSelectedCat = '';

  document.getElementById('aa-from-h').value = '8';
  document.getElementById('aa-from-m').value = '00';
  document.getElementById('aa-to-h').value   = '9';
  document.getElementById('aa-to-m').value   = '00';

  aaSetAmPm('from', 'AM');
  aaSetAmPm('to', 'AM');

  if (document.getElementById('aa-custom-activity'))
    document.getElementById('aa-custom-activity').value = '';

  document.querySelectorAll('#aa-categories .aa-cat-btn').forEach(b => b.classList.remove('sel'));
  document.querySelectorAll('#aa-sounds .sound-btn').forEach(b => b.classList.remove('sel'));

  const bellBtn = document.querySelector('#aa-sounds [data-sound="bell"]');
  if (bellBtn) bellBtn.classList.add('sel');

  const msg = document.getElementById('aa-msg');
  if (msg) { msg.textContent = ''; msg.className = 'auth-msg'; }

  _aaDurationUpdate();
  document.getElementById('add-alarm-modal').style.display = 'flex';
}

function closeAddAlarmModal() {
  document.getElementById('add-alarm-modal').style.display = 'none';
}

function aaSetAmPm(side, val) {
  document.getElementById(`aa-${side}-am`)?.classList.toggle('sel', val === 'AM');
  document.getElementById(`aa-${side}-pm`)?.classList.toggle('sel', val === 'PM');
  _aaDurationUpdate();
}

function _aaGetTime(side) {
  const h    = document.getElementById(`aa-${side}-h`)?.value || '8';
  const m    = document.getElementById(`aa-${side}-m`)?.value || '00';
  const isAM = document.getElementById(`aa-${side}-am`)?.classList.contains('sel');
  return to24(h, m, isAM ? 'AM' : 'PM');
}

function _aaDurationUpdate() {
  const from = _aaGetTime('from');
  const to   = _aaGetTime('to');
  const disp = document.getElementById('aa-duration-display');
  const diff = calcDiff(from, to);
  if (disp) disp.textContent = diff ? `Total Duration: ${diff}` : 'Total Duration: —';
}

/* ═══════════════════════════════════════
   SINGLE ALARM (Quick alarm tab)
═══════════════════════════════════════ */
let _saSound  = 'bell';
let _saTimers = [];

function saSetAmPm(val) {
  document.getElementById('sa-am')?.classList.toggle('sel', val === 'AM');
  document.getElementById('sa-pm')?.classList.toggle('sel', val === 'PM');
}

function _saGetTime() {
  const h    = parseInt(document.getElementById('sa-h')?.value)  || 12;
  const m    = parseInt(document.getElementById('sa-m')?.value)  || 0;
  const isAM = document.getElementById('sa-am')?.classList.contains('sel');
  return to24(h, m, isAM ? 'AM' : 'PM');
}

function setSingleAlarm() {
  const time24 = _saGetTime();
  const label  = document.getElementById('sa-label')?.value.trim() || 'Alarm';
  const now    = new Date();
  const [h, m] = time24.split(':').map(Number);

  let alarmTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
  let delay     = alarmTime - now;

  if (delay <= 0) { alert('Time already passed.'); return; }

  const id      = Date.now();
  const display = fmt12(time24);

  const t = setTimeout(() => {
    playSound(_saSound, null);
    const modal = document.getElementById('alarm-modal');
    if (modal) {
      document.getElementById('alarm-modal-title').textContent = label;
      document.getElementById('alarm-modal-sub').textContent   = `${display.h}:${display.m} ${display.ampm}`;
      modal.style.display = 'flex';
    }
  }, delay);

  _saTimers.push({ id, t, label, display });
  alert(`⏰ Alarm set for ${display.h}:${display.m} ${display.ampm}`);
}

/* ═══════════════════════════════════════
   STOPWATCH
═══════════════════════════════════════ */
let _swRunning  = false;
let _swStart    = 0;
let _swElapsed  = 0;
let _swInterval = null;
let _swCat      = '';
let _swFinalMs  = 0;

function swStartStop() {
  const btn = document.getElementById('sw-start-btn');
  if (!_swRunning) {
    _swStart    = Date.now();
    _swInterval = setInterval(swTick, 100);
    _swRunning  = true;
    if (btn) btn.textContent = '⏸ Pause';
  } else {
    _swElapsed += Date.now() - _swStart;
    clearInterval(_swInterval);
    _swRunning  = false;
    _swFinalMs  = _swElapsed;
    if (btn) btn.textContent = '▶ Resume';
  }
}

function swStop() {
  if (_swRunning) { _swElapsed += Date.now() - _swStart; clearInterval(_swInterval); _swRunning = false; }
  _swFinalMs = _swElapsed;
  const ls = document.getElementById('sw-log-section');
  if (ls) ls.style.display = 'block';
}

function swReset() {
  clearInterval(_swInterval);
  _swRunning = false; _swElapsed = 0; _swFinalMs = 0;
  const disp = document.getElementById('sw-display');
  if (disp) disp.textContent = '00:00:00';
  const ls = document.getElementById('sw-log-section');
  if (ls) ls.style.display = 'none';
}

function swTick() {
  const total = _swElapsed + (Date.now() - _swStart);
  const disp  = document.getElementById('sw-display');
  if (disp) disp.textContent = fmtTime(total);
}

function fmtTime(ms) {
  const s   = Math.floor(ms / 1000);
  const h   = Math.floor(s / 3600);
  const m   = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function swSelectCat(btn) {
  document.querySelectorAll('#sw-categories .sw-act-btn').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');
  _swCat = btn.dataset.cat;
}

async function swLogTime() {
  if (!_swCat) { alert('Select a category first.'); return; }
  const ms  = _swFinalMs || _swElapsed;
  const hrs = ms / 3600000;
  const ud  = await getUserData();
  if (!ud) return;

  ud.logs.push({
    id:        Date.now(),
    habitId:   _swCat.toLowerCase(),
    habitName: _swCat,
    habitIcon: '⏱',
    date:      new Date().toISOString().split('T')[0],
    duration:  +hrs.toFixed(4),
    unit:      'hrs',
    note:      `Stopwatch · ${fmtTime(ms)}`
  });

  await saveUserData();
  renderHistory?.();
  renderTrends?.();
  swReset();
}