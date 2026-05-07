/* ═══════════════════════════════════════
   STATE  –  persisted via localStorage
═══════════════════════════════════════ */
let currentUser = null;
let currentAlarmHabit = null;

/* ── Storage helpers ── */
function _loadUsers() {
  try { return JSON.parse(localStorage.getItem('qt_users') || '{}'); } catch(e) { return {}; }
}
function _saveUsers(u) {
  localStorage.setItem('qt_users', JSON.stringify(u));
}

/* getUserData: always returns the live in-memory object for the current user.
   On first call per session it hydrates from localStorage.
   saveUserData() writes it back — call it after every mutation. */
let _currentData = null;

function getUserData() {
  if (!currentUser) return null;
  if (!_currentData) {
    try {
      _currentData = JSON.parse(localStorage.getItem('qt_data_' + currentUser.username) || 'null');
    } catch(e) { _currentData = null; }
    if (!_currentData) {
      _currentData = { logs:[], alarms:{}, habitEnabled:{}, selectedSounds:{}, customSounds:{}, checkInHistory:[], quickAlarms:[] };
    }
    if (!_currentData.quickAlarms) _currentData.quickAlarms = [];
  }
  return _currentData;
}

function saveUserData() {
  if (!currentUser || !_currentData) return;
  localStorage.setItem('qt_data_' + currentUser.username, JSON.stringify(_currentData));
}

/* ═══════════════════════════════════════
   AUTH
═══════════════════════════════════════ */
function switchTab(t) {
  document.getElementById('tab-login').style.display  = t === 'login' ? '' : 'none';
  document.getElementById('tab-signup').style.display = t === 'signup' ? '' : 'none';
  document.querySelectorAll('.auth-tab').forEach((el,i) => {
    el.classList.toggle('active', (i===0 && t==='login') || (i===1 && t==='signup'));
  });
  clearAuthMsgs();
}
function clearAuthMsgs() {
  ['li-msg','su-msg'].forEach(id => {
    const el = document.getElementById(id);
    el.className = 'auth-msg';
    el.textContent = '';
  });
}
function showMsg(id, text, type) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = 'auth-msg ' + type;
}
function togglePw(id, btn) {
  const inp = document.getElementById(id);
  inp.type = inp.type === 'password' ? 'text' : 'password';
  btn.textContent = inp.type === 'password' ? '👁' : '🙈';
}
function doSignup() {
  const name = document.getElementById('su-name').value.trim();
  const user = document.getElementById('su-user').value.trim().toLowerCase();
  const pass = document.getElementById('su-pass').value;
  if (!name || !user || !pass) return showMsg('su-msg', 'Please fill in all fields.', 'err');
  if (user.length < 3) return showMsg('su-msg', 'Username must be at least 3 characters.', 'err');
  if (pass.length < 6) return showMsg('su-msg', 'Password must be at least 6 characters.', 'err');
  const users = _loadUsers();
  if (users[user]) return showMsg('su-msg', 'That username is already taken.', 'err');
  users[user] = { name, pass, joinedAt: new Date().toISOString(), lastChanged: null };
  _saveUsers(users);
  showMsg('su-msg', 'Account created! Signing you in…', 'ok');
  setTimeout(() => launchApp({ username: user, name }), 900);
}
function doLogin() {
  const user = document.getElementById('li-user').value.trim().toLowerCase();
  const pass = document.getElementById('li-pass').value;
  if (!user || !pass) return showMsg('li-msg', 'Please enter your username and password.', 'err');
  const users = _loadUsers();
  if (!users[user] || users[user].pass !== pass) return showMsg('li-msg', 'Incorrect username or password.', 'err');
  launchApp({ username: user, name: users[user].name });
}
function launchApp(user) {
  currentUser = user;
  _currentData = null; // clear cache so getUserData() re-loads from storage fresh
  localStorage.setItem('qt_session', JSON.stringify({ username: user.username }));
  const firstName = user.name.split(' ')[0];
  document.getElementById('greeting-name').textContent = firstName;
  document.getElementById('hdr-avatar').textContent = user.name.charAt(0).toUpperCase();
  document.getElementById('hdr-name').textContent = user.name;
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
  saveUserData();
  localStorage.removeItem('qt_session');
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

/* ── Settings Modal ── */
function openSettings() {
  if (!currentUser) return;
  const users = _loadUsers();
  const u = users[currentUser.username] || {};
  document.getElementById('st-avatar').textContent = currentUser.name.charAt(0).toUpperCase();
  document.getElementById('st-display-name').textContent = currentUser.name;
  document.getElementById('st-display-user').textContent = '#' + currentUser.username;
  document.getElementById('st-name').value = currentUser.name;
  document.getElementById('st-userid').value = currentUser.username;
  document.getElementById('st-cur-pass').value = u.pass || '';
  const msg = document.getElementById('st-msg');
  msg.className = 'auth-msg';
  msg.textContent = '';
  document.getElementById('settings-modal').style.display = 'flex';
}
function closeSettings() {
  document.getElementById('settings-modal').style.display = 'none';
}
function settingsOverlayClick(e) {
  if (e.target === document.getElementById('settings-modal')) closeSettings();
}
function stCopyPassword() {
  const val = document.getElementById('st-cur-pass').value;
  if (!val) return;
  navigator.clipboard.writeText(val).then(() => {
    const btn = document.querySelector('.st-copy-btn');
    if (btn) { btn.textContent = '✓'; setTimeout(() => { btn.textContent = '📋'; }, 1500); }
  }).catch(() => {});
}
function saveSettings() {
  const newName   = document.getElementById('st-name').value.trim();
  const newUserId = document.getElementById('st-userid').value.trim().toLowerCase();
  const msg       = document.getElementById('st-msg');

  if (!newName)   { msg.textContent = 'Name cannot be empty.'; msg.className = 'auth-msg err'; return; }
  if (!newUserId) { msg.textContent = 'User ID cannot be empty.'; msg.className = 'auth-msg err'; return; }
  if (newUserId.length < 3) { msg.textContent = 'User ID must be at least 3 characters.'; msg.className = 'auth-msg err'; return; }
  if (!/^[a-z0-9_]+$/.test(newUserId)) { msg.textContent = 'User ID: letters, numbers and underscores only.'; msg.className = 'auth-msg err'; return; }

  const users = _loadUsers();
  const oldId = currentUser.username;
  const u = users[oldId];
  if (!u) { msg.textContent = 'Session error. Please sign in again.'; msg.className = 'auth-msg err'; return; }

  if (newUserId !== oldId && users[newUserId]) {
    msg.textContent = 'That User ID is already taken.'; msg.className = 'auth-msg err'; return;
  }

  u.name = newName;

  if (newUserId !== oldId) {
    users[newUserId] = u;
    delete users[oldId];
    const dataRaw = localStorage.getItem('qt_data_' + oldId);
    if (dataRaw) {
      localStorage.setItem('qt_data_' + newUserId, dataRaw);
      localStorage.removeItem('qt_data_' + oldId);
    }
  }

  _saveUsers(users);

  currentUser.name     = newName;
  currentUser.username = newUserId;
  localStorage.setItem('qt_session', JSON.stringify({ username: newUserId }));

  const firstName = newName.split(' ')[0];
  document.getElementById('hdr-avatar').textContent      = newName.charAt(0).toUpperCase();
  document.getElementById('hdr-name').textContent        = newName;
  document.getElementById('greeting-name').textContent   = firstName;
  document.getElementById('st-avatar').textContent       = newName.charAt(0).toUpperCase();
  document.getElementById('st-display-name').textContent = newName;
  document.getElementById('st-display-user').textContent = '#' + newUserId;
  document.getElementById('st-userid').value             = newUserId;

  msg.textContent = '✓ Changes saved!';
  msg.className   = 'auth-msg ok';
  setTimeout(() => { msg.className = 'auth-msg'; msg.textContent = ''; }, 3000);
}

/* ── Forgot Password ── */
function toggleForgotPanel() {
  const panel = document.getElementById('forgot-panel');
  const isHidden = panel.style.display === 'none';
  panel.style.display = isHidden ? 'block' : 'none';
  if (isHidden) {
    // Pre-fill User ID from the sign-in field if already typed
    const uid = document.getElementById('li-user').value.trim();
    if (uid) document.getElementById('fp-user').value = uid;
    document.getElementById('fp-new-pass').value = '';
    document.getElementById('fp-confirm-pass').value = '';
    const fpMsg = document.getElementById('fp-msg');
    fpMsg.className = 'auth-msg'; fpMsg.textContent = '';
  }
}
function doResetPassword() {
  const userId  = document.getElementById('fp-user').value.trim().toLowerCase();
  const newPass = document.getElementById('fp-new-pass').value;
  const confirm = document.getElementById('fp-confirm-pass').value;
  const msg     = document.getElementById('fp-msg');

  if (!userId)  { msg.textContent = 'Please enter your User ID.'; msg.className = 'auth-msg err'; return; }
  if (!newPass) { msg.textContent = 'Please enter a new password.'; msg.className = 'auth-msg err'; return; }
  if (newPass.length < 6) { msg.textContent = 'Password must be at least 6 characters.'; msg.className = 'auth-msg err'; return; }
  if (newPass !== confirm) { msg.textContent = 'Passwords do not match.'; msg.className = 'auth-msg err'; return; }

  const users = _loadUsers();
  if (!users[userId]) { msg.textContent = 'No account found with that User ID.'; msg.className = 'auth-msg err'; return; }

  users[userId].pass = newPass;
  _saveUsers(users);

  msg.textContent = '✓ Password reset! You can now sign in.';
  msg.className   = 'auth-msg ok';
  // Pre-fill sign-in and close panel after short delay
  setTimeout(() => {
    document.getElementById('li-user').value = userId;
    document.getElementById('li-pass').value = '';
    document.getElementById('forgot-panel').style.display = 'none';
    const fpMsg = document.getElementById('fp-msg');
    fpMsg.className = 'auth-msg'; fpMsg.textContent = '';
  }, 1800);
}


// Wire up keyboard shortcuts and auto-login after DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('li-user').addEventListener('keydown', e => { if(e.key==='Enter') document.getElementById('li-pass').focus(); });
  document.getElementById('li-pass').addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });
  document.getElementById('su-pass').addEventListener('keydown', e => { if(e.key==='Enter') doSignup(); });

  // Auto-login: if a session was saved, skip the login screen
  try {
    const saved = localStorage.getItem('qt_session');
    if (saved) {
      const session = JSON.parse(saved);
      const users = _loadUsers();
      if (session.username && users[session.username]) {
        launchApp({ username: session.username, name: users[session.username].name });
      }
    }
  } catch(e) {}
});

/* ═══════════════════════════════════════
   NAV TABS
═══════════════════════════════════════ */
function showTab(t) {
  document.querySelectorAll('.tab-pane').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(b=>b.classList.remove('active'));
  document.getElementById('tab-'+t).classList.add('active');
  document.querySelectorAll('.nav-tab').forEach(b=>{
    if((t==='check-in'&&b.textContent.includes('Check'))||
       (t==='tracker'&&b.textContent.includes('Tracker'))||
       (t==='history'&&b.textContent.includes('History'))||
       (t==='trends'&&b.textContent.includes('Trends'))||
       (t==='tools'&&b.textContent.includes('Tools'))) {
      b.classList.add('active');
    }
  });
  if(t==='trends') renderTrends();
  if(t==='history'){ renderCalendar(); renderHistory(); }
}

/* ═══════════════════════════════════════
   CHECK-IN LOGIC
═══════════════════════════════════════ */
const likertQs=[
  {id:'l1',text:'I can fall asleep easily.'},
  {id:'l2',text:'I sleep well most nights.'},
  {id:'l3',text:'I wake up feeling rested.'},
  {id:'l4',text:'I stay alert during the day.'},
  {id:'l5',text:'I have good energy during the day.'}
];
const likertOpts=['Yes, always','Most of the time','Sometimes','Not really','No, never'];
const answers={};
const lAnswers={};

// Build likert questions and wire up option clicks – run after DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  const lc=document.getElementById('lik-container');
  likertQs.forEach((q,i)=>{
    const row=document.createElement('div');
    row.className='lik-item';
    row.innerHTML=`<span class="lik-label">Q${i+8}. ${q.text}</span><div class="lik-btns">${likertOpts.map(o=>`<button type="button" class="lbtn" data-lq="${q.id}" data-v="${o}">${o}</button>`).join('')}</div>`;
    lc.appendChild(row);
  });

  document.querySelectorAll('.opts').forEach(grp=>{
    grp.querySelectorAll('.opt').forEach(btn=>{
      btn.addEventListener('click',()=>{
        grp.querySelectorAll('.opt').forEach(b=>b.classList.remove('sel'));
        btn.classList.add('sel');
        answers[grp.dataset.q]=btn.dataset.v;
        updateProg();
      });
    });
  });
  document.querySelectorAll('.lbtn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll(`.lbtn[data-lq="${btn.dataset.lq}"]`).forEach(b=>b.classList.remove('sel'));
      btn.classList.add('sel');
      lAnswers[btn.dataset.lq]=btn.dataset.v;
      updateProg();
    });
  });
});

function updateProg() {
  const done=Object.keys(answers).length+Object.keys(lAnswers).length;
  const pct=Math.round((done/12)*100);
  document.getElementById('prog-bar').style.width=pct+'%';
  document.getElementById('prog-txt').textContent=`${done} of 12`;
  document.getElementById('submit-btn').disabled=(done<12);
}

function lScore(v) {
  return{'Yes, always':5,'Most of the time':4,'Sometimes':3,'Not really':2,'No, never':1}[v]||3;
}
function sleepScore() {
  const s={};
  likertQs.forEach(q=>{s[q.id]=lScore(lAnswers[q.id]);});
  return Math.round(((s.l1+s.l2+s.l3+s.l4+s.l5)/5)*10);
}
function phoneRisk() {
  return{'no phone before bed':0,'less than 30 minutes':1,'30 min–1 hour':2,'1–2 hours':3,'2–3 hours':4,'more than 3 hours':5}[answers.phonetime]||0;
}
function isLateNight(){return answers.bedtime==='after 12 AM'||answers.bedtime==='11 PM–12 AM';}

/* ── CONTRADICTION DETECTOR ── */
function detectContradictions() {
  const contra=[];
  const feelGoodAll=
    (lAnswers.l3==='Yes, always'||lAnswers.l3==='Most of the time')&&
    (lAnswers.l5==='Yes, always'||lAnswers.l5==='Most of the time')&&
    (lAnswers.l4==='Yes, always'||lAnswers.l4==='Most of the time')&&
    (lAnswers.l1==='Yes, always'||lAnswers.l1==='Most of the time');

  const overwork=answers.workhours==='9 or more hours';
  const longsleep=answers.sleep==='9 or more hours';
  const highPhone=answers.phonetime==='2–3 hours'||answers.phonetime==='more than 3 hours';
  const lateBed=answers.bedtime==='after 12 AM'||answers.bedtime==='11 PM–12 AM';

  if(feelGoodAll&&overwork) {
    contra.push({
      t:'🔮 You feel great — but your workload is something to watch',
      b:[
        `<strong>What we see:</strong> You say you feel good — but you work ${answers.workhours} a day. That's a lot.`,
        `<strong>Why it matters:</strong> Stress from heavy work can build up slowly. Many people feel fine until they suddenly feel very tired or burned out.`,
        `<strong>What to watch for:</strong> If you start feeling more irritable, struggling to relax, or needing lots of coffee to get going, those are early signs. Even if you feel okay now, taking regular rest days is a good idea.`
      ]
    });
  }
  if(feelGoodAll&&longsleep) {
    contra.push({
      t:'🔮 You feel energetic — but you sleep 9+ hours every night',
      b:[
        `<strong>What we see:</strong> You say you have good energy, but you sleep ${answers.sleep} every night.`,
        `<strong>Why it matters:</strong> Sleeping that long while feeling fine can sometimes mean your body is more tired than you realise, or that you're not very active.`,
        `<strong>Try this:</strong> Experiment with 7–8 hours of sleep for 2 weeks. If you feel just as good, you were probably sleeping more than you need. If you feel worse, your body genuinely needs the extra sleep — and that's useful to know.`
      ]
    });
  }
  if(feelGoodAll&&highPhone) {
    contra.push({
      t:`🔮 You feel rested — but ${answers.phonetime} of phone use before bed is a risk`,
      b:[
        `<strong>What we see:</strong> You say you sleep well, but you use your phone ${answers.phonetime} before sleeping.`,
        `<strong>Why it matters:</strong> Phone screens affect your sleep even when you don't notice it. You might feel okay now — but this habit slowly makes sleep less deep over time.`,
        `<strong>Try this:</strong> Put your phone away 30 minutes before bed for just one week. Many people are surprised how much better they sleep. You might go from "feeling good" to "feeling great".`
      ]
    });
  }
  if(feelGoodAll&&lateBed) {
    contra.push({
      t:`🔮 Late bedtime + feeling fine — it's a balance worth watching`,
      b:[
        `<strong>What we see:</strong> You go to bed ${answers.bedtime} and say you feel rested and energised.`,
        `<strong>Why it matters:</strong> Some people naturally do fine going to bed late. But if you also work a lot or use your phone before bed, that balance can disappear quickly.`,
        `<strong>Keep an eye on it:</strong> If your energy drops during a stressful time, try going to bed 30–45 minutes earlier. That's usually the quickest fix.`
      ]
    });
  }
  return contra;
}

function showResults() {
  document.getElementById('tracker-form').style.display='none';
  const rd=document.getElementById('results');
  rd.style.display='block';
  window.scrollTo(0,0);

  const ud=getUserData();
  if(ud) {
    ud.checkInHistory.push({
      date:new Date().toISOString(),
      answers:{...answers},
      lAnswers:{...lAnswers},
      score:sleepScore()
    });
    saveUserData();
  }

  const sc=sleepScore();
  const pr=phoneRisk();
  const late=isLateNight();
  const overwork=answers.workhours==='9 or more hours';
  const sedentary=answers.worktype==='Sitting';
  const feelRested=lAnswers.l3==='Yes, always'||lAnswers.l3==='Most of the time';
  const poorRested=lAnswers.l3==='Not really'||lAnswers.l3==='No, never';
  const feelEnergetic=lAnswers.l5==='Yes, always'||lAnswers.l5==='Most of the time';
  const lowEnergy=lAnswers.l5==='Not really'||lAnswers.l5==='No, never';
  const daySleepy=lAnswers.l4==='Not really'||lAnswers.l4==='No, never';
  const hardToSleep=lAnswers.l1==='Not really'||lAnswers.l1==='No, never';
  const shortSleep=answers.sleep==='0–4 hours'||answers.sleep==='5–6 hours';
  const goodHours=answers.sleep==='7–8 hours'||answers.sleep==='9 or more hours';
  const outcomeGood=feelRested&&feelEnergetic&&!daySleepy;
  const outcomePoor=poorRested||lowEnergy||daySleepy;

  let intro='',emoji='✨';
  if(outcomeGood){intro="You feel rested and have good energy. You're doing great — keep it up!";emoji='🌟';}
  else if(outcomePoor&&goodHours){intro=`You sleep ${answers.sleep} but still don't feel your best. More hours in bed isn't always the answer — going to bed at the same time and using your phone less at night can help a lot.`;emoji='⚠️';}
  else if(outcomePoor&&shortSleep){intro=`You sleep ${answers.sleep} and it's affecting your energy. A few small changes to your bedtime can make a big difference quickly.`;emoji='💤';}
  else{intro='Some things are going well and some can get better. Your tips below are based on what you told us.';emoji='🔍';}

  // ── Helper: context-aware Habit Tracker nudge ──────────────────────────
  const ud_recs = getUserData();
  const hasLogs = ud_recs && ud_recs.logs && ud_recs.logs.length > 0;
  const trackerNudge = (habitId, habitLabel) => {
    if (hasLogs) {
      const habitLogs = ud_recs.logs.filter(l => l.habitId === habitId);
      if (habitLogs.length >= 3) {
        return `<strong>📊 Your tracker data:</strong> You've already logged ${habitLabel} ${habitLogs.length} time${habitLogs.length > 1 ? 's' : ''}! Keep that streak going — consistent logging helps you spot patterns and celebrate real progress.`;
      }
      return `<strong>📊 Track it:</strong> You've started logging in the Habit Tracker — amazing first step! Adding your ${habitLabel} daily will reveal patterns you can't see from memory alone.`;
    }
    return `<strong>📊 Start tracking:</strong> Head to the <em>Habit Tracker</em> tab and log your ${habitLabel} each day. Even one week of data will show you patterns that are impossible to see in your head.`;
  };

  // ── Recommendations ────────────────────────────────────────────────────
  // Format: { l: level, t: title, s: short summary + action sentence, b: [tracker nudge] }
  const recs=[];

  const phoneHigh  = answers.phonetime==='1–2 hours'||answers.phonetime==='2–3 hours'||answers.phonetime==='more than 3 hours';
  const phoneMed   = answers.phonetime==='30 min–1 hour';
  const phoneHours = {'no phone before bed':'none','30 min–1 hour':'30 min–1 hr','1–2 hours':'1–2 hrs','2–3 hours':'2–3 hrs','more than 3 hours':'3+ hrs'}[answers.phonetime]||'some';

  // ── Outcome-good cards ──
  if(outcomeGood&&late) recs.push({l:'',t:'✅ You feel great, your late-night routine is working for you',
    s:`You go to bed ${answers.bedtime} and still feel full of energy. That's great! Try to keep the same bedtime every day — even on weekends. That will help you keep feeling this good.`,
    b:[trackerNudge('sleep','sleep')]});
  else if(outcomeGood) recs.push({l:'',t:'✅ Your habits are working — you feel rested and full of energy',
    s:`You sleep well, wake up feeling good, and stay alert all day. That means your daily habits are working. Just keep doing what you're doing and check in again in a few weeks.`,
    b:[trackerNudge('sleep','sleep')]});

  // ── Sleep quality poor but hours are fine ──
  if(outcomePoor&&goodHours) recs.push({l:'warn',t:"⚠️ You sleep enough hours but the quality needs a small fix",
    s:`You already sleep ${answers.sleep}, which is good. To feel better, try putting your phone away 30–60 minutes before bed and waking up at the same time each day. This can make your sleep much more restful.`,
    b:[trackerNudge('sleep','sleep hours')]});

  // ── Short sleep + poor outcome ──
  if(outcomePoor&&shortSleep&&!overwork&&!phoneHigh) recs.push({l:'bad',t:"🔴 Your body needs a bit more sleep",
    s:`You're getting by on ${answers.sleep}, but your body needs more rest to feel its best. Try going to bed just 20 minutes earlier each week. Even a little more sleep can give you more energy and a better mood.`,
    b:[trackerNudge('sleep','sleep')]});

  // ── Hard to fall asleep ──
  if(hardToSleep) recs.push({l:'warn',t:"⚠️ You find it hard to fall asleep — a calm bedtime routine can help",
    s:`Your mind stays busy at bedtime, which makes it hard to sleep. Try a simple wind-down: turn off screens, dim the lights, and do something calm like reading for 20–30 minutes before bed. This tells your brain it's time to rest.`,
    b:[trackerNudge('sleep','sleep')]});

  // ── Daytime sleepiness ──
  if(daySleepy) recs.push({
    l:(daySleepy&&poorRested)?'bad':'warn',
    t:(daySleepy&&poorRested)?"🔴 You feel tired during the day — let's help you feel more awake":"⚠️ You're getting through the day — just a small sleep fix can help",
    s:(daySleepy&&poorRested)
      ?`Feeling drained every day is hard. Try going to bed and waking up at the same time each day, and put your phone away 30 minutes before bed. Most people notice a real difference in just a few days.`
      :`You're doing okay, but you feel sleepy during the day. The quickest fix is simple: wake up at the same time every day — even on weekends. This helps your body know when to feel awake and when to sleep.`,
    b:[trackerNudge('sleep','sleep quality')]});

  // ── Phone only (no short sleep) ──
  if(pr>=2&&outcomePoor&&!shortSleep) recs.push({l:'warn',t:"⚠️ You already know about your phone habit — that's the first step",
    s:`You use your phone ${answers.phonetime} before bed. That's actually quite common! Try putting your phone away 30 minutes earlier at night for just 5 days. Many people sleep much deeper with this one small change.`,
    b:[trackerNudge('screen','screen time')]});

  // ── Overwork only (no short sleep, no late) ──
  if(overwork&&outcomePoor&&!shortSleep&&!late) recs.push({l:'bad',t:"🔴 You work a lot — your body needs time to recover",
    s:`Working ${answers.workhours} a day takes a lot out of you. Try to stop all work at least 1 hour before bed. Even a short walk outside can help your body relax and get ready for sleep.`,
    b:[trackerNudge('work','work hours')]});

  // ── COMBINED-FACTORS ──

  // Scenario A: overwork + short sleep + high phone
  if(overwork&&shortSleep&&phoneHigh) recs.push({l:'bad',t:'🔴 Three things are hurting your sleep at the same time',
    s:`You work ${answers.workhours}, sleep only ${answers.sleep}, and use your phone ${phoneHours} before bed. Each one is okay on its own, but together they drain your energy every day. Start with two steps: sleep 1–2 hours more and put your phone away 30 minutes earlier at night. You'll likely feel better within a week.`,
    b:[`<strong>📊 Track it:</strong> Go to the <em>Habit Tracker</em> tab and log your sleep each night. One week of tracking will show you how much better you're doing.`]});

  // Scenario B: overwork + short sleep, phone is fine
  else if(overwork&&shortSleep&&!phoneHigh&&!phoneMed) recs.push({l:'bad',t:'🔴 Long work days are cutting into your sleep time',
    s:`You work ${answers.workhours} and sleep only ${answers.sleep}. That doesn't leave much time for your body to rest and recover. Try going to bed 45–60 minutes earlier on work nights. You'll likely feel more energy within just a few days.`,
    b:[trackerNudge('sleep','sleep')]});

  // Scenario C: short sleep + high phone, no overwork
  else if(!overwork&&shortSleep&&phoneHigh) recs.push({l:'warn',t:'⚠️ Your phone at night is taking time away from your sleep',
    s:`You sleep ${answers.sleep} and use your phone ${phoneHours} before bed. The two are connected — phone light makes your brain stay awake longer than you think. Try swapping the last 30 minutes of phone time for something screen-free. You might gain 20–40 more minutes of real sleep without even changing your bedtime.`,
    b:[trackerNudge('screen','screen time')]});

  // Scenario D: good hours + high phone + feeling poor
  if(!shortSleep&&goodHours&&phoneHigh&&outcomePoor) recs.push({l:'warn',t:'⚠️ You sleep enough hours — but your phone is making it less restful',
    s:`You sleep ${answers.sleep}, which should be enough to feel good. But you also use your phone ${phoneHours} before bed, which breaks up your deep sleep. Try keeping your phone away for the last 30 minutes before bed for just one week. You'll likely notice you wake up feeling much better.`,
    b:[trackerNudge('screen','screen time')]});

  // Scenario E: overwork + late bedtime + poor outcome
  if(overwork&&late&&outcomePoor) recs.push({l:'bad',t:'🔴 Long work days and a late bedtime leave little time to recover',
    s:`You work ${answers.workhours} and go to bed ${answers.bedtime}. That means your body barely has time to rest before morning. Try to finish all work at least 1 hour before you want to sleep. Even a short walk helps your body relax and makes sleep deeper.`,
    b:[trackerNudge('work','work hours')]});

  // Scenario F: sedentary + low energy
  if(sedentary&&lowEnergy) recs.push({l:'',t:"🪑 You do desk work — moving a little more can boost your energy",
    s:`Sitting most of the day can make you feel more tired, not less. Try standing up and moving for 2 minutes every hour, and go for a short walk after lunch. It sounds small, but many people feel much more alert and focused when they do this.`,
    b:[trackerNudge('exercise','movement')]});

  // Scenario G: night owl + poor outcome
  if(late&&outcomePoor) recs.push({l:'bad',t:"🔴 You stay up late — going to bed just a little earlier can help a lot",
    s:`You go to bed ${answers.bedtime} and it's affecting how you feel. You don't have to become a morning person! Just try going to bed 15 minutes earlier each week until you reach 11 pm. Small steps like this are easier to stick to and really work.`,
    b:[trackerNudge('sleep','sleep')]});

  // Contradictions
  const contras=detectContradictions();
  const contraHTML=contras.map(c=>`<div class="rec contra"><h4>${c.t}</h4><ul>${c.b.map(b=>`<li>${b}</li>`).join('')}</ul></div>`).join('');

  if(recs.length===0&&contras.length===0) recs.push({l:'',t:'✅ Everything looks good — keep going!',
    s:`Your habits and how you feel are both in a healthy place. That's great to see! Just keep doing what you're doing and check in again in a few weeks.`,
    b:[trackerNudge('sleep','sleep')]});

  rd.innerHTML=`
    <div class="res-hero">
      <div class="res-emoji">${emoji}</div>
      <h3>Here is what we found\u2026</h3>
      <p>${intro}</p>
    </div>
    <div class="stat-grid">
      <div class="stat"><div class="stat-val">${answers.workhours.replace(' hours','')}</div><div class="stat-sub">Work / day</div></div>
      <div class="stat"><div class="stat-val">${answers.sleep.replace(' hours','')}</div><div class="stat-sub">Sleep / night</div></div>
      <div class="stat"><div class="stat-val">${sc}<span style="font-size:12px;font-weight:400">/50</span></div><div class="stat-sub">Sleep score</div></div>
      <div class="stat"><div class="stat-val" style="font-size:13px">${answers.bedtime}</div><div class="stat-sub">Bedtime</div></div>
    </div>
    <div id="ai-feedback-section"></div>
    <button type="button" id="restart-btn" onclick="restartForm()">&#8617; Take the quiz again</button>
  `;

  // Trigger AI feedback asynchronously
  generateAIFeedback({ answers: {...answers}, lAnswers: {...lAnswers}, sc });
}


/* ═══════════════════════════════════════
   PERSONALISED TIPS ENGINE (local, no API)
═══════════════════════════════════════ */
function generateAIFeedback({ answers, lAnswers, sc }) {
  const section = document.getElementById('ai-feedback-section');
  if (!section) return;
  const fb = buildLocalFeedback(answers, lAnswers, sc);
  renderAIFeedback(section, fb);
}

/* ── Sources reference table ── */
const SOURCES_DB = {
  aasm:    { short:'AASM, 2015',             full:'American Academy of Sleep Medicine. (2015). Recommended amount of sleep for a healthy adult. Sleep Health, 1(1), 40–43.',                                                   url:'https://doi.org/10.1016/j.sleh.2014.12.010' },
  bmc:     { short:'BMC Public Health, 2024', full:'BMC Public Health. (2024). Sleep duration and mental health outcomes in adolescents: A population-based study.',                                                             url:'https://bmcpublichealth.biomedcentral.com/articles/10.1186/s12889-024-18725-1' },
  statcan: { short:'Statistics Canada, 2022', full:'Statistics Canada. (2022). Sleep duration and health in Canada. Health Reports.',                                                                                           url:'https://www150.statcan.gc.ca/n1/pub/82-003-x/2022003/article/00001-eng.htm' },
  springer:{ short:'Springer, 2024',          full:'Springer. (2024). Sleep duration and cognitive/health outcomes in adults: A systematic review.',                                                                            url:'https://link.springer.com/article/10.1186/s41606-024-00109-4' },
  guardian:{ short:'The Guardian, 2024',      full:'The Guardian. (2024, November 26). Irregular sleep patterns raise risk of stroke and heart attack, study finds.',                                                          url:'https://www.theguardian.com/society/2024/nov/26/irregular-sleep-pattern-raises-risk-of-stroke-and-heart-attack-uk-study-finds' }
};

function cite(key){ return ''; } // kept for safety; inline citations removed

function buildLocalFeedback(a, la, sc) {
  /* ── Flags ── */
  const sleep       = a.sleep       || '';
  const phone       = a.phonetime   || '';
  const workhours   = a.workhours   || '';
  const bedtime     = a.bedtime     || '';
  const worktype    = a.worktype    || '';

  const goodSleep   = sleep === '7–8 hours';
  const shortSleep  = sleep === '0–4 hours' || sleep === '5–6 hours';
  const longSleep   = sleep === '9 or more hours';
  const noPhone     = phone === 'no phone before bed';
  const lowPhone    = phone === '30 min–1 hour';
  const medPhone    = phone === '1–2 hours';
  const highPhone   = phone === '2–3 hours' || phone === 'more than 3 hours';
  const overwork    = workhours === '9 or more hours';
  const longWork    = workhours === '7–8 hours';
  const lateNight   = bedtime === 'after 12 AM' || bedtime === '11 PM–12 AM';
  const earlyBed    = bedtime === '9–10 PM';
  const sitting     = worktype === 'Sitting';

  const feelRested    = la.l3 === 'Yes, always' || la.l3 === 'Most of the time';
  const poorRested    = la.l3 === 'Not really'  || la.l3 === 'No, never';
  const feelEnergy    = la.l5 === 'Yes, always' || la.l5 === 'Most of the time';
  const lowEnergy     = la.l5 === 'Not really'  || la.l5 === 'No, never';
  const alertDay      = la.l4 === 'Yes, always' || la.l4 === 'Most of the time';
  const sleepyDay     = la.l4 === 'Not really'  || la.l4 === 'No, never';
  const fallsAsleep   = la.l1 === 'Yes, always' || la.l1 === 'Most of the time';
  const hardSleep     = la.l1 === 'Not really'  || la.l1 === 'No, never';

  const outcomeGood = feelRested && feelEnergy && !sleepyDay;
  const outcomePoor = poorRested || lowEnergy || sleepyDay;

  const usedSources = new Set();
  function track(key){ usedSources.add(key); }

  /* ══════════════════════════════════
     1. WHAT'S GOING WELL
     — one friendly sentence, no inline citation
  ══════════════════════════════════ */
  let whatsGoingWell = '';
  if (goodSleep && outcomeGood) {
    track('aasm');
    whatsGoingWell = `You sleep ${sleep} every night and feel rested and alert all day. That's exactly what healthy sleep looks like. Keep it up! 🎉`;
  } else if (goodSleep && !outcomeGood) {
    track('aasm');
    whatsGoingWell = `You sleep ${sleep} every night, that's the healthy amount. You've got the foundation right. Now let's make that sleep feel more restful.`;
  } else if (longSleep && outcomeGood) {
    track('springer');
    whatsGoingWell = `You make time for sleep, and it shows that you feel rested and full of energy. That's a great habit to protect.`;
  } else if (shortSleep && feelEnergy) {
    track('aasm');
    whatsGoingWell = `You manage to keep your energy up even on ${sleep}. Getting just a little more rest will help you feel even better.`;
  } else if (noPhone) {
    track('statcan');
    whatsGoingWell = `You keep your phone away before bed, that's one of the best things you can do for sleep. Well done!`;
  } else if (earlyBed) {
    track('guardian');
    whatsGoingWell = `Going to bed at ${bedtime} gives your body great recovery time. Early bedtimes are really good for your health.`;
  } else if (!overwork && !shortSleep) {
    track('aasm');
    whatsGoingWell = `You're not overworking and you get enough sleep, that's a healthy balance. Your body has time to rest and recover.`;
  } else {
    track('bmc');
    whatsGoingWell = `You're tracking your habits, and that's the first step. Awareness is how real change starts.`;
  }

  /* ══════════════════════════════════
     2. ONE THING TO WORK ON
     — specific, kind, no inline citation
  ══════════════════════════════════ */
  let areaOfImprovement = '';
  if (highPhone && (outcomePoor || !feelRested)) {
    track('statcan');
    areaOfImprovement = `You use your phone ${phone} before bed. Phone screens trick your brain into thinking it's still daytime  making it harder to fall into deep sleep, even if you don't notice it.`;
  } else if (medPhone && outcomePoor) {
    track('statcan');
    areaOfImprovement = `Using your phone ${phone} before bed is likely making your sleep lighter. Cutting that down even by 30 minutes can make a real difference to how rested you feel.`;
  } else if (shortSleep && outcomePoor) {
    track('aasm');
    areaOfImprovement = `You sleep ${sleep} most nights. Your body needs more time to repair and recharge. Even one extra hour of sleep can noticeably improve your energy and mood.`;
  } else if (overwork && outcomePoor) {
    track('springer');
    areaOfImprovement = `Working ${workhours} a day makes it hard for your body to switch off at night. Try stopping all work at least 1 hour before bed even a short walk helps your body wind down.`;
  } else if (lateNight && outcomePoor) {
    track('guardian');
    areaOfImprovement = `Going to bed ${bedtime} is quite late. Your body sleeps best within a regular window. Try shifting your bedtime just 15 minutes earlier each week.`;
  } else if (hardSleep) {
    track('statcan');
    areaOfImprovement = `You find it hard to fall asleep. Your brain needs a signal that it's time to rest. Try a calm, screen-free wind-down for 20 minutes before bed do reading, stretching, or just dim lights.`;
  } else if (highPhone && outcomeGood) {
    track('statcan');
    areaOfImprovement = `You feel okay now, but ${phone} of phone use before bed is slowly affecting your sleep depth. Moving phone time earlier in the evening is the easiest win.`;
  } else if (longSleep && !feelEnergy) {
    track('springer');
    areaOfImprovement = `You sleep ${sleep} but still feel low on energy. More hours in bed isn't always the fix — sleep quality matters too. A consistent bedtime and less screen time can help.`;
  } else {
    track('guardian');
    areaOfImprovement = `Try going to bed and waking up at the same time every day even on weekends. It's one of the simplest habits that makes a real difference.`;
  }

  /* ══════════════════════════════════
     3. YOUR 3 STEPS  (replaces research bullets + 8-8-8 actions)
     — plain, personal, no citations inline
  ══════════════════════════════════ */
  const actions = [];

  if (goodSleep)       { track('aasm');     actions.push(`🛌 Keep sleeping ${sleep}, you're right in the healthy range`); }
  else if (shortSleep) { track('aasm');     actions.push(`🛌 Go to bed 15 minutes earlier each week until you reach 7–8 hours`); }
  else if (longSleep)  { track('springer'); actions.push(`🛌 Try to sleep regularly for about 7–8 hours each night. Good, deep sleep is usually more important than just sleeping for many hours`); }
  else                 { track('aasm');     actions.push(`🛌 Aim for 7–8 hours of sleep each night`); }

  if (noPhone)              { track('statcan'); actions.push(`📵 Keep your phone away before bed, that habit is working`); }
  else if (lowPhone)        { track('statcan'); actions.push(`📵 Try cutting your pre-bed phone time from ${phone} to under 30 minutes`); }
  else if (medPhone||highPhone) { track('statcan'); actions.push(`📵 Avoid using your phone or other screens during the final 30 minutes before sleeping because screens can make it harder to fall asleep.`); }
  else                      {                   actions.push(`📵 Put your phone away 30 minutes before you sleep`); }

  if (lateNight)      { track('guardian'); actions.push(`🌙 Try sleeping 15 minutes earlier each week, small changes are easier to maintain.`); }
  else if (overwork)  { track('springer'); actions.push(`💼 Finish studying or working at least an hour before bedtime so your mind can relax and prepare for sleep.`); }
  else if (hardSleep) {                    actions.push(`🌙 Spend 20–30 minutes before bed doing something calm with no screens`); }
  else                {                    actions.push(`🌙 Keep a consistent wake-up time even on weekends`); }

  /* ══════════════════════════════════
     4. CLOSING NOTE  (replaces whyItMatters + gentleReminder)
     — warm, one sentence, no citation
  ══════════════════════════════════ */
  let gentleReminder = '';
  if (outcomeGood) {
    gentleReminder = `You're already doing the important things right, consistency is all you need to keep feeling this good.`;
  } else if (highPhone) {
    gentleReminder = `You don't need to stop using your phone, just move it earlier in your evening. One small shift, big result.`;
  } else if (shortSleep) {
    gentleReminder = `Small gradual changes are easier and more effective than sudden big changes.`;
  } else if (overwork) {
    gentleReminder = `Rest isn't the opposite of being productive, it's what makes productivity possible. Protect your wind-down time.`;
  } else if (lateNight) {
    gentleReminder = `You don't have to become a morning person, just nudge your bedtime a little earlier and your body will do the rest.`;
  } else {
    gentleReminder = `Small, consistent changes to your sleep routine tend to have a much bigger impact than you'd expect.`;
  }

  /* ── Collect only the sources actually cited ── */
  const sources = [...usedSources].map(k => SOURCES_DB[k]);

  return { whatsGoingWell, areaOfImprovement, actions, gentleReminder, sources };
}

function renderAIFeedback(section, fb) {
  const actionsHtml = (fb.actions || [])
    .map(a => `<div class="ai-action">${a}</div>`).join('');

  const sourcesHtml = (fb.sources && fb.sources.length) ? `
    <details class="ai-sources-toggle">
      <summary>📚 View sources</summary>
      <ol class="ai-sources-list">
        ${fb.sources.map(s => `<li>${s.full} <a href="${s.url}" target="_blank" rel="noopener noreferrer">${s.url}</a></li>`).join('')}
      </ol>
    </details>` : '';

  section.innerHTML = `
    <div class="ai-feedback-card">
      <div class="ai-feedback-header">
        <span class="ai-feedback-badge">✨ Tips just for you</span>
      </div>

      <div class="ai-block ai-block-green">
        <div class="ai-block-label">✅ What's going well</div>
        <p>${fb.whatsGoingWell || ''}</p>
      </div>

      <div class="ai-block ai-block-amber">
        <div class="ai-block-label">⚠️ One thing to work on</div>
        <p>${fb.areaOfImprovement || ''}</p>
      </div>

      ${actionsHtml ? `
      <div class="ai-block ai-block-purple">
        <div class="ai-block-label">🎯 Your 3 steps</div>
        <div class="ai-actions">${actionsHtml}</div>
      </div>` : ''}

      ${fb.gentleReminder ? `
      <div class="ai-block ai-block-reminder">
        <p>${fb.gentleReminder}</p>
        <button class="tracker-nav-btn" onclick="showTab('tracker')" title="Go to Tracker">
          📊 Try the Tracker
        </button>
      </div>` : ''}

      ${sourcesHtml}
    </div>`;
}

function restartForm() {
  document.getElementById('results').innerHTML='';
  document.getElementById('results').style.display='none';
  document.getElementById('tracker-form').style.display='block';
  document.querySelectorAll('.opt,.lbtn').forEach(b=>b.classList.remove('sel'));
  Object.keys(answers).forEach(k=>delete answers[k]);
  Object.keys(lAnswers).forEach(k=>delete lAnswers[k]);
  document.getElementById('prog-bar').style.width='0%';
  document.getElementById('prog-txt').textContent='0 of 12';
  document.getElementById('submit-btn').disabled=true;
  window.scrollTo(0,0);
}

/* ═══════════════════════════════════════
   HABIT TRACKER CARDS
═══════════════════════════════════════ */
const HABITS=[
  {id:'sleep',name:'Sleep',icon:'🌙',unit:'hrs',color:'#534AB7'},
  {id:'work',name:'Work',icon:'💻',unit:'hrs',color:'#1D9E75'},
  {id:'exercise',name:'Exercise',icon:'🏃',unit:'mins',color:'#BA7517'},
  {id:'screen',name:'Screen time',icon:'📱',unit:'hrs',color:'#C0392B'},
  {id:'reading',name:'Reading',icon:'📚',unit:'mins',color:'#0F6E56'},
  {id:'meditation',name:'Meditation',icon:'🧘',unit:'mins',color:'#2EBF8E'},
];

const SOUNDS=[
  {id:'bell',name:'🔔 Bell'},
  {id:'chime',name:'🎵 Chime'},
  {id:'nature',name:'🌿 Nature'},
  {id:'soft',name:'🎶 Soft tone'},
];

let audioCtx=null;

function getAudioCtx(){
  if(!audioCtx)audioCtx=new(window.AudioContext||window.webkitAudioContext)();
  return audioCtx;
}

function playSound(soundId,customDataUrl) {
  if(customDataUrl){
    const a=new Audio(customDataUrl);a.play();return;
  }
  const ctx=getAudioCtx();
  const osc=ctx.createOscillator();
  const gain=ctx.createGain();
  osc.connect(gain);gain.connect(ctx.destination);
  const freqs={bell:[523,659,784],chime:[880,1047,1319],nature:[440,554,659],soft:[349,440,523]};
  const f=freqs[soundId]||freqs.bell;
  osc.frequency.setValueAtTime(f[0],ctx.currentTime);
  osc.frequency.setValueAtTime(f[1],ctx.currentTime+0.15);
  osc.frequency.setValueAtTime(f[2],ctx.currentTime+0.3);
  gain.gain.setValueAtTime(0.3,ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.8);
  osc.start();osc.stop(ctx.currentTime+0.8);
}

function fmt12(val24){
  if(!val24)return{h:'',m:'',ampm:'AM'};
  const [hh,mm]=val24.split(':').map(Number);
  const ampm=hh<12?'AM':'PM';
  const h12=hh%12||12;
  return{h:String(h12),m:String(mm).padStart(2,'0'),ampm};
}
function to24(h,m,ampm){
  let hh=parseInt(h)||0;
  const mm=parseInt(m)||0;
  if(ampm==='AM'&&hh===12)hh=0;
  if(ampm==='PM'&&hh!==12)hh+=12;
  return hh.toString().padStart(2,'0')+':'+mm.toString().padStart(2,'0');
}
function calcDiff(t1,t2){
  if(!t1||!t2)return null;
  const [h1,m1]=t1.split(':').map(Number);
  const [h2,m2]=t2.split(':').map(Number);
  let diff=(h2*60+m2)-(h1*60+m1);
  if(diff<0)diff+=1440;
  const hrs=Math.floor(diff/60);
  const mins=diff%60;
  return hrs>0?(mins>0?`${hrs}h ${mins}m`:`${hrs}h`):(mins>0?`${mins}m`:null);
}

function ampmPicker(prefix,label,defaultVal){
  const f=fmt12(defaultVal);
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

function setAmPm(prefix,val){
  document.getElementById(prefix+'-am').classList.toggle('sel',val==='AM');
  document.getElementById(prefix+'-pm').classList.toggle('sel',val==='PM');
  updateDiff(prefix.split('-log-')[0].replace(/^log-/,''));
}
function getAmPmVal(prefix){
  const h=document.getElementById(prefix+'-h')?.value||'12';
  const m=document.getElementById(prefix+'-m')?.value||'00';
  const ampm=document.getElementById(prefix+'-am')?.classList.contains('sel')?'AM':'PM';
  return to24(h,m,ampm);
}
function updateDiff(hId){
  const start=getAmPmVal(`log-${hId}-start`);
  const end=getAmPmVal(`log-${hId}-end`);
  const diff=calcDiff(start,end);
  const el=document.getElementById(`diff-${hId}`);
  if(el)el.textContent=diff?`⏱ Duration: ${diff}`:'';
  // auto-fill duration field
  if(diff){
    const [h1,m1]=start.split(':').map(Number);
    const [h2,m2]=end.split(':').map(Number);
    let mins=(h2*60+m2)-(h1*60+m1);
    if(mins<0)mins+=1440;
    const habit=HABITS.find(h=>h.id===hId);
    const durEl=document.getElementById('dur-'+hId);
    if(durEl&&habit){
      durEl.value=habit.unit==='hrs'?(mins/60).toFixed(1):mins;
    }
  }
}

function buildHabitCards(){
  const wrap=document.getElementById('habit-cards-wrap');
  wrap.innerHTML='';
  const ud=getUserData();
  if(!ud) return;
  HABITS.forEach(h=>{
    const enabled=!!ud.habitEnabled[h.id];
    const alarm=ud.alarms[h.id]||{};
    const selSound=ud.selectedSounds[h.id]||'bell';
    const card=document.createElement('div');
    card.className='habit-card';
    card.id='habit-card-'+h.id;
    card.innerHTML=`
      <div class="habit-card-head">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="habit-icon-btn" style="background:${h.color}18;border-color:${h.color}40" onclick="toggleHabit('${h.id}')">${h.icon}</div>
          <div>
            <div class="habit-name">${h.name}</div>
            ${alarm.active?`<div class="alarm-mini-badge">⏰ ${fmt12(alarm.from).h}:${fmt12(alarm.from).m} ${fmt12(alarm.from).ampm} – ${fmt12(alarm.to).h}:${fmt12(alarm.to).m} ${fmt12(alarm.to).ampm}</div>`:'<div class="alarm-mini-badge muted">No alarm set</div>'}
          </div>
        </div>
        <div class="habit-card-actions">
          <button class="icon-action-btn ${alarm.active?'alarm-on':''}" title="Set alarm" onclick="toggleAlarmPanel('${h.id}')">⏰</button>
          <button class="icon-action-btn log-action-btn" title="Log now" onclick="toggleLogPanel('${h.id}')">✏️</button>
          <div class="habit-toggle" onclick="toggleHabit('${h.id}')">
            <span class="toggle-lbl" style="font-size:11px;color:var(--muted)">${enabled?'On':'Off'}</span>
            <div class="toggle-track ${enabled?'on':''}" id="toggle-${h.id}"><div class="toggle-knob"></div></div>
          </div>
        </div>
      </div>

      <div class="alarm-panel" id="alarm-panel-${h.id}" style="display:none">
        <div class="panel-section-lbl">⏰ Set alarm window</div>
        <div class="alarm-ampm-row">
          ${ampmPicker(`alarm-${h.id}-from`,'From',alarm.from||'08:00')}
          <div class="ampm-arrow">→</div>
          ${ampmPicker(`alarm-${h.id}-to`,'Until',alarm.to||'22:00')}
        </div>
        <div class="sound-row" style="margin-top:10px">
          <div class="sound-label">Alarm sound</div>
          <div class="sound-opts">
            ${SOUNDS.map(s=>`<button class="sound-btn ${selSound===s.id?'sel':''}" onclick="selectSound('${h.id}','${s.id}',this)">${s.name}</button>`).join('')}
            <button class="upload-sound-btn" onclick="document.getElementById('sound-upload-${h.id}').click()">📎 My sound</button>
            <input type="file" id="sound-upload-${h.id}" accept="audio/*" style="display:none" onchange="uploadSound('${h.id}',this)">
          </div>
        </div>
        <button class="set-alarm-btn" style="margin-top:10px" onclick="setAlarmAmPm('${h.id}')">${alarm.active?'Update alarm ⏰':'Set alarm ⏰'}</button>
        ${alarm.active?`<button class="set-alarm-btn" style="margin-top:6px;background:var(--red-lt);color:var(--red);border-color:var(--red)" onclick="clearAlarm('${h.id}')">Remove alarm</button>`:''}
      </div>

      <div class="log-panel" id="log-panel-${h.id}" style="display:none">
        <div class="panel-section-lbl">✏️ Log today's ${h.name.toLowerCase()}</div>
        <div class="log-ampm-row">
          ${ampmPicker(`log-${h.id}-start`,'Start time','09:00')}
          <div class="ampm-arrow">→</div>
          ${ampmPicker(`log-${h.id}-end`,'End time','10:00')}
        </div>
        <div class="diff-display" id="diff-${h.id}"></div>
        <div class="dur-manual-row">
          <div class="ampm-field" style="flex:1">
            <label>Or enter duration (${h.unit})</label>
            <input type="number" id="dur-${h.id}" min="0" max="24" step="0.5" placeholder="e.g. 7.5" class="dur-input">
          </div>
        </div>
        <textarea class="log-note" id="note-${h.id}" rows="2" placeholder="Optional note…"></textarea>
        <button class="log-btn" style="margin-top:8px" onclick="logHabit('${h.id}')">Save log ✓</button>
      </div>`;
    wrap.appendChild(card);

    // wire up live diff updates
    ['h','m','am','pm'].forEach(s=>{
      const elS=document.getElementById(`log-${h.id}-start-${s==='am'?'am':s==='pm'?'pm':s}`);
      const elE=document.getElementById(`log-${h.id}-end-${s==='am'?'am':s==='pm'?'pm':s}`);
      if(elS)elS.addEventListener('input',()=>updateDiff(h.id));
      if(elE)elE.addEventListener('input',()=>updateDiff(h.id));
    });
  });
}

function toggleAlarmPanel(id){
  const p=document.getElementById('alarm-panel-'+id);
  const l=document.getElementById('log-panel-'+id);
  if(l)l.style.display='none';
  if(p)p.style.display=p.style.display==='none'?'block':'none';
}
function toggleLogPanel(id){
  const p=document.getElementById('log-panel-'+id);
  const a=document.getElementById('alarm-panel-'+id);
  if(a)a.style.display='none';
  if(p){
    p.style.display=p.style.display==='none'?'block':'none';
    if(p.style.display==='block') updateDiff(id);
  }
}
function setAlarmAmPm(id){
  const ud=getUserData();if(!ud)return;
  const from=getAmPmVal(`alarm-${id}-from`);
  const to=getAmPmVal(`alarm-${id}-to`);
  ud.alarms[id]={from,to,active:true};
  saveUserData();
  buildHabitCards();
  // re-open alarm panel
  setTimeout(()=>{ const p=document.getElementById('alarm-panel-'+id); if(p)p.style.display='block'; },50);
}
function clearAlarm(id){
  const ud=getUserData();if(!ud)return;
  ud.alarms[id]={active:false};
  saveUserData();
  buildHabitCards();
}

function toggleHabit(id){
  const ud=getUserData();if(!ud)return;
  ud.habitEnabled[id]=!ud.habitEnabled[id];
  saveUserData();
  buildHabitCards();
}

function selectSound(habitId,soundId,btn){
  const ud=getUserData();if(!ud)return;
  ud.selectedSounds[habitId]=soundId;
  const container=btn.closest('.sound-opts');
  container.querySelectorAll('.sound-btn').forEach(b=>b.classList.remove('sel'));
  btn.classList.add('sel');
  playSound(soundId,ud.customSounds[habitId]);
  saveUserData();
}

function uploadSound(habitId,input){
  const ud=getUserData();if(!ud)return;
  const file=input.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    ud.customSounds[habitId]=e.target.result;
    ud.selectedSounds[habitId]='custom';
    saveUserData();
    const card=document.getElementById('habit-card-'+habitId);
    if(card){
      card.querySelectorAll('.sound-btn').forEach(b=>b.classList.remove('sel'));
      const upBtn=input.previousElementSibling;
      if(upBtn){upBtn.textContent='✅ '+file.name.substring(0,16);}
    }
    playSound('custom',e.target.result);
  };
  reader.readAsDataURL(file);
}

/* setAlarm replaced by setAlarmAmPm above */

function logHabit(id){
  const ud=getUserData();if(!ud)return;
  const dur=parseFloat(document.getElementById('dur-'+id).value)||0;
  const startT=getAmPmVal(`log-${id}-start`);
  const endT=getAmPmVal(`log-${id}-end`);
  const note=document.getElementById('note-'+id).value;
  const habit=HABITS.find(h=>h.id===id);
  if(!dur&&!startT){alert('Please enter a duration or start time.');return;}
  const entry={
    id:Date.now(),
    habitId:id,
    habitName:habit.name,
    habitIcon:habit.icon,
    date:new Date().toISOString().split('T')[0],
    duration:dur,
    unit:habit.unit,
    startTime:startT,
    endTime:endT,
    note
  };
  ud.logs.push(entry);
  saveUserData();
  document.getElementById('dur-'+id).value='';
  document.getElementById('note-'+id).value='';
  const btn=document.querySelector(`#habit-card-${id} .log-btn`);
  if(btn){const orig=btn.textContent;btn.textContent='✅ Saved!';btn.style.background='var(--green-dk)';setTimeout(()=>{btn.textContent=orig;btn.style.background='';},1500);}
  renderCalendar();
  renderTrends();
  renderHistory();
}

/* ═══════════════════════════════════════
   ALARM WATCHER
═══════════════════════════════════════ */
let alarmInterval=null;
let firedToday={};

function startAlarmWatcher(){
  alarmInterval=setInterval(checkAlarms,30000);
  checkAlarms();
}
function stopAlarmWatcher(){
  if(alarmInterval)clearInterval(alarmInterval);
  alarmInterval=null;
  firedToday={};
}
function checkAlarms(){
  const ud=getUserData();if(!ud)return;
  const now=new Date();
  const hm=now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0');
  const todayKey=new Date().toDateString();
  HABITS.forEach(h=>{
    const alarm=ud.alarms[h.id];
    if(!alarm||!alarm.active)return;
    const key=h.id+'_'+todayKey;
    if(firedToday[key])return;
    if(hm>=alarm.from&&hm<=alarm.to){
      firedToday[key]=true;
      triggerAlarm(h,ud.selectedSounds[h.id]||'bell',ud.customSounds[h.id]);
    }
  });
}
function triggerAlarm(habit,soundId,customData){
  playSound(soundId,customData);
  currentAlarmHabit=habit;
  document.getElementById('alarm-modal-icon').textContent=habit.icon;
  document.getElementById('alarm-modal-title').textContent=`Time to log ${habit.name}!`;
  document.getElementById('alarm-modal-sub').textContent=`Your ${habit.name.toLowerCase()} reminder is here. Ready to record?`;
  document.getElementById('alarm-modal').style.display='flex';
}
function dismissAlarm(){document.getElementById('alarm-modal').style.display='none';currentAlarmHabit=null;}
function goLogFromAlarm(){
  document.getElementById('alarm-modal').style.display='none';
  if(currentAlarmHabit){
    showTab('tracker');
    setTimeout(()=>{
      const el=document.getElementById('dur-'+currentAlarmHabit.id);
      if(el)el.focus();
    },300);
  }
  currentAlarmHabit=null;
}

/* ═══════════════════════════════════════
   CALENDAR
═══════════════════════════════════════ */
let calYear=new Date().getFullYear();
let calMonth=new Date().getMonth();
let selectedDay=null;
let importedCalEvents=[];

function uploadCalendar(input){
  const file=input.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    const text=e.target.result;
    const events=parseICS(text);
    importedCalEvents=importedCalEvents.concat(events);
    renderCalendar();
    alert(`✅ Imported ${events.length} events from calendar.`);
  };
  reader.readAsText(file);
}

function parseICS(text){
  const events=[];
  const blocks=text.split('BEGIN:VEVENT');
  blocks.slice(1).forEach(block=>{
    const summaryM=block.match(/SUMMARY:(.+)/);
    const dateM=block.match(/DTSTART[^:]*:(\d{8})/);
    if(summaryM&&dateM){
      const d=dateM[1];
      events.push({
        title:summaryM[1].trim(),
        date:`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`
      });
    }
  });
  return events;
}

function changeMonth(delta){
  calMonth+=delta;
  if(calMonth>11){calMonth=0;calYear++;}
  if(calMonth<0){calMonth=11;calYear--;}
  renderCalendar();
}

function renderCalendar(){
  const label=document.getElementById('cal-month-label');
  const grid=document.getElementById('cal-grid');
  if(!label||!grid)return;
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  label.textContent=months[calMonth]+' '+calYear;
  grid.innerHTML='';
  const days=['Su','Mo','Tu','We','Th','Fr','Sa'];
  days.forEach(d=>{
    const el=document.createElement('div');
    el.className='cal-day-name';el.textContent=d;grid.appendChild(el);
  });
  const first=new Date(calYear,calMonth,1).getDay();
  const daysInMonth=new Date(calYear,calMonth+1,0).getDate();
  const today=new Date();
  const todayStr=today.toISOString().split('T')[0];
  const ud=getUserData();
  const logDates=new Set(ud?ud.logs.map(l=>l.date):[]);
  const futureDates=new Set([...logDates].filter(d=>d>todayStr));

  for(let i=0;i<first;i++){
    const prev=new Date(calYear,calMonth,-(first-i-1));
    const el=document.createElement('div');
    el.className='cal-day other-month';
    el.textContent=prev.getDate();
    grid.appendChild(el);
  }
  for(let d=1;d<=daysInMonth;d++){
    const dateStr=`${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const el=document.createElement('div');
    el.className='cal-day';
    el.textContent=d;
    if(today.getFullYear()===calYear&&today.getMonth()===calMonth&&today.getDate()===d) el.classList.add('today');
    if(logDates.has(dateStr)) el.classList.add('has-log');
    if(futureDates.has(dateStr)) el.classList.add('has-plan');
    if(selectedDay===dateStr) el.classList.add('selected');
    el.onclick=()=>{selectedDay=dateStr;renderCalendar();showDayLogs(dateStr);};
    grid.appendChild(el);
  }
  if(selectedDay)showDayLogs(selectedDay);
}

function showDayLogs(dateStr){
  const panel=document.getElementById('day-log-panel');
  const title=document.getElementById('day-log-title');
  const entries=document.getElementById('day-log-entries');
  const ud=getUserData();
  const d=new Date(dateStr+'T12:00:00');
  const todayStr=new Date().toISOString().split('T')[0];
  const isFuture=dateStr>todayStr;
  const opts={weekday:'long',month:'long',day:'numeric'};
  title.textContent=d.toLocaleDateString('en-US',opts)+(isFuture?' 🔮 — Planned':'');
  entries.innerHTML='';
  const dayLogs=(ud?ud.logs:[]).filter(l=>l.date===dateStr);
  const calEvts=importedCalEvents.filter(e=>e.date===dateStr);

  if(!dayLogs.length&&!calEvts.length){
    if(isFuture){
      entries.innerHTML=`<div style="font-size:13px;color:var(--hint);padding:8px 0 4px">No plans yet. Go to <strong>Tracker</strong> and pick this date to schedule something.</div>
      <button class="log-btn" style="margin-top:6px" onclick="lfGoToDate('${dateStr}')">＋ Plan this day →</button>`;
    } else {
      entries.innerHTML=`<div style="font-size:13px;color:var(--hint);padding:8px 0">No logs recorded for this day.</div>`;
    }
    return;
  }

  dayLogs.forEach(l=>{
    const item=document.createElement('div');
    item.className='log-entry-item';
    item.innerHTML=`<div class="log-entry-icon">${l.habitIcon}</div>
      <div class="log-entry-meta">
        <div class="log-entry-habit">${l.habitName}${l.isQuickAlarm?'<span class="qa-history-badge">⏰ Alarm</span>':''}</div>
        <div class="log-entry-dur">${l.startTime?`${l.startTime}–${l.endTime||'?'} · `:''}${l.duration} ${l.unit}</div>
        ${l.note?`<div class="log-entry-note">💬 ${l.note}</div>`:''}
      </div>
      <button onclick="deleteLog(${l.id})" style="background:none;border:none;cursor:pointer;color:var(--hint);font-size:16px;padding:2px 4px;flex-shrink:0" onmouseover="this.style.color='var(--red)'" onmouseout="this.style.color='var(--hint)'">🗑</button>`;
    entries.appendChild(item);
  });
  
  // Show calendar events with option to convert to schedule
  calEvts.forEach(e=>{
    const item=document.createElement('div');
    item.className='log-entry-item';
    item.innerHTML=`<div class="log-entry-icon">📅</div>
      <div class="log-entry-meta">
        <div class="log-entry-habit">${e.title}</div>
        <div class="log-entry-dur">Calendar event</div>
      </div>
      <button class="log-btn" style="padding:6px 10px;font-size:11px;margin:0" onclick="convertCalEventToSchedule('${e.title}','${dateStr}')">＋ Add to Tracker</button>`;
    entries.appendChild(item);
  });
  
  if(isFuture){
    const addBtn=document.createElement('button');
    addBtn.className='log-btn';
    addBtn.style.marginTop='8px';
    addBtn.textContent='＋ Add more to this day →';
    addBtn.onclick=()=>lfGoToDate(dateStr);
    entries.appendChild(addBtn);
  }
}

/* Convert calendar event to schedule */
function convertCalEventToSchedule(title, date) {
  const ud = getUserData();
  if (!ud) return;
  if (!ud.schedules) ud.schedules = [];
  
  // Try to match category from title
  let category = 'Other';
  const titleLower = title.toLowerCase();
  const catMap = {
    'sleep': 'Sleep', 'meeting': 'Work', 'work': 'Work', 'class': 'Studies',
    'study': 'Studies', 'exercise': 'Exercise', 'gym': 'Exercise', 'run': 'Exercise',
    'meal': 'Meals', 'lunch': 'Meals', 'dinner': 'Meals', 'breakfast': 'Meals',
    'reading': 'Reading', 'book': 'Reading', 'meditation': 'Meditation', 'yoga': 'Meditation'
  };
  for (const [key, val] of Object.entries(catMap)) {
    if (titleLower.includes(key)) { category = val; break; }
  }
  
  // Default time 9am-10am
  const entry = {
    id: Date.now(),
    category,
    date,
    fromTime: '09:00',
    toTime: '10:00',
    durationMins: 60,
    tasks: [],
    createdAt: new Date().toISOString(),
    fromCal: true,
    calTitle: title
  };
  
  ud.schedules.push(entry);
  saveUserData();
  renderTrackerSchedules();
  alert(`✅ Added "${title}" to your Tracker schedules!`);
}

/* ═══════════════════════════════════════
   CALENDAR 2  (mini, inside Tracker tab)
═══════════════════════════════════════ */
let cal2Year=new Date().getFullYear();
let cal2Month=new Date().getMonth();
let selectedDay2=null;

function changeMonth2(delta){
  cal2Month+=delta;
  if(cal2Month>11){cal2Month=0;cal2Year++;}
  if(cal2Month<0){cal2Month=11;cal2Year--;}
  renderCalendar2();
}

function renderCalendar2(){
  const label=document.getElementById('cal2-month-label');
  const grid=document.getElementById('cal2-grid');
  if(!label||!grid)return;
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  label.textContent=months[cal2Month]+' '+cal2Year;
  grid.innerHTML='';
  const days=['Su','Mo','Tu','We','Th','Fr','Sa'];
  days.forEach(d=>{const el=document.createElement('div');el.className='cal-day-name';el.textContent=d;grid.appendChild(el);});
  const first=new Date(cal2Year,cal2Month,1).getDay();
  const daysInMonth=new Date(cal2Year,cal2Month+1,0).getDate();
  const today=new Date();
  const ud=getUserData();
  const logDates=new Set(ud?ud.logs.map(l=>l.date):[]);
  for(let i=0;i<first;i++){const el=document.createElement('div');el.className='cal-day other-month';el.textContent=new Date(cal2Year,cal2Month,-(first-i-1)).getDate();grid.appendChild(el);}
  for(let d=1;d<=daysInMonth;d++){
    const dateStr=`${cal2Year}-${String(cal2Month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const el=document.createElement('div');
    el.className='cal-day';
    el.textContent=d;
    if(today.getFullYear()===cal2Year&&today.getMonth()===cal2Month&&today.getDate()===d) el.classList.add('today');
    if(logDates.has(dateStr)) el.classList.add('has-log');
    if(selectedDay2===dateStr) el.classList.add('selected');
    el.onclick=()=>{selectedDay2=dateStr;renderCalendar2();showDayLogs2(dateStr);};
    grid.appendChild(el);
  }
  if(selectedDay2)showDayLogs2(selectedDay2);
}

function showDayLogs2(dateStr){
  const panel=document.getElementById('day2-log-panel');
  const title=document.getElementById('day2-log-title');
  const entries=document.getElementById('day2-log-entries');
  if(!panel||!title||!entries)return;
  panel.style.display='block';
  const d=new Date(dateStr+'T12:00:00');
  const isToday=dateStr===new Date().toISOString().split('T')[0];
  const isFuture=dateStr>new Date().toISOString().split('T')[0];
  title.textContent=d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})+(isFuture?' 🔮':'');
  entries.innerHTML='';
  const ud=getUserData();
  const dayLogs=(ud?ud.logs:[]).filter(l=>l.date===dateStr);
  if(!dayLogs.length){
    if(isFuture){
      entries.innerHTML=`<div style="font-size:13px;color:var(--hint);padding:8px 0">No plans yet for this day. Use the log form above to schedule an activity.</div>`;
    } else {
      entries.innerHTML=`<div style="font-size:13px;color:var(--hint);padding:8px 0">Nothing logged for this day.</div>`;
    }
    return;
  }
  dayLogs.forEach(l=>{
    const item=document.createElement('div');
    item.className='log-entry-item';
    // For display: prefer displayUnit; convert hrs→mins when displayUnit was mins
    const dispUnit=l.displayUnit||l.unit||'hrs';
    const dispDur=dispUnit==='mins'&&l.unit==='hrs'
      ? Math.round(l.duration*60)
      : l.duration;
    item.innerHTML=`<div class="log-entry-icon">${l.habitIcon}</div>
      <div class="log-entry-meta">
        <div class="log-entry-habit">${l.habitName}</div>
        <div class="log-entry-dur">${l.startTime?`${l.startTime}–${l.endTime||'?'} · `:''}${dispDur} ${dispUnit}</div>
        ${l.note?`<div class="log-entry-note">💬 ${l.note}</div>`:''}
      </div>
      <button onclick="deleteLog(${l.id})" style="background:none;border:none;cursor:pointer;color:var(--hint);font-size:16px;padding:2px 4px;flex-shrink:0" onmouseover="this.style.color='var(--red)'" onmouseout="this.style.color='var(--hint)'">🗑</button>`;
    entries.appendChild(item);
  });
}

/* ═══════════════════════════════════════
   NEW LOG FORM  (Tracker tab)
═══════════════════════════════════════ */
let _lfCat='';
let _lfIcon='📋';
let _lfSound='bell';
let _lfCustomSound=null;

// Habit id map for trends compatibility
const LF_CAT_HABIT_MAP={
  'Sleep':'sleep','Work':'work','Exercise':'exercise','Screen Use':'screen',
  'Reading':'reading','Meditation':'meditation','Meals':'meals','Studies':'studies'
};
const LF_CAT_UNIT_MAP={
  'Sleep':'hrs','Work':'hrs','Screen Use':'hrs','Meals':'hrs',
  'Exercise':'mins','Reading':'mins','Meditation':'mins','Studies':'mins'
};

function lfInit(){
  // Set today's date
  const dateEl=document.getElementById('lf-date');
  if(dateEl) dateEl.value=new Date().toISOString().split('T')[0];
  // Wire live diff only if elements exist
  ['lf-start-h','lf-start-m','lf-end-h','lf-end-m'].forEach(id=>{
    const el=document.getElementById(id);
    if(el)el.addEventListener('input',lfUpdateDiff);
  });
  lfUpdateDiff();
}

document.addEventListener('DOMContentLoaded', lfInit);

function lfSetAmPm(side,val){
  document.getElementById(`lf-${side}-am`).classList.toggle('sel',val==='AM');
  document.getElementById(`lf-${side}-pm`).classList.toggle('sel',val==='PM');
  lfUpdateDiff();
}
function _lfGetTime(side){
  const hEl=document.getElementById(`lf-${side}-h`);
  const mEl=document.getElementById(`lf-${side}-m`);
  const amEl=document.getElementById(`lf-${side}-am`);
  if(!hEl||!mEl||!amEl) return null;
  const h=hEl.value||'8';
  const m=mEl.value||'00';
  const isAM=amEl.classList.contains('sel');
  return to24(h,m,isAM?'AM':'PM');
}
function lfUpdateDiff(){
  const from=_lfGetTime('start');
  const to=_lfGetTime('end');
  if(from===null||to===null) return;
  const diff=calcDiff(from,to);
  const el=document.getElementById('lf-diff');
  if(el) el.textContent=diff?`⏱ Duration: ${diff}`:'';
}
function lfSelectCat(btn){
  document.getElementById('lf-cats').querySelectorAll('.lf-cat-btn').forEach(b=>b.classList.remove('sel'));
  btn.classList.add('sel');
  _lfCat=btn.dataset.cat;
  _lfIcon=btn.dataset.icon||'📋';
  const customInput=document.getElementById('lf-custom');
  if(!_lfCat){customInput.style.display='block';customInput.focus();}
  else{customInput.style.display='none';customInput.value='';}
}
function lfCustomTyped(){
  _lfCat='';
  document.getElementById('lf-cats').querySelectorAll('.lf-cat-btn').forEach(b=>b.classList.remove('sel'));
}
function lfToggleReminder(){
  const checked=document.getElementById('lf-reminder-check').checked;
  document.getElementById('lf-reminder-sound').style.display=checked?'block':'none';
}
function lfSelectSound(btn){
  btn.closest('.sound-opts').querySelectorAll('.sound-btn').forEach(b=>b.classList.remove('sel'));
  btn.classList.add('sel');
  _lfSound=btn.dataset.sound;
  _lfCustomSound=null;
  playSound(_lfSound,null);
}
function lfUploadSound(input){
  const file=input.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{_lfCustomSound=e.target.result;_lfSound='custom';playSound('custom',_lfCustomSound);};
  reader.readAsDataURL(file);
}
function lfSaveLog(){
  const customText=document.getElementById('lf-custom').value.trim();
  const cat=customText||_lfCat;
  const icon=customText?'✍':_lfIcon;
  const msg=document.getElementById('lf-msg');
  const dateVal=document.getElementById('lf-date').value;

  if(!cat){msg.textContent='Please pick a category.';msg.className='auth-msg err';return;}
  if(!dateVal){msg.textContent='Please pick a date.';msg.className='auth-msg err';return;}

  const from=_lfGetTime('start');
  const to=_lfGetTime('end');
  const diff=calcDiff(from,to);
  const [h1,m1]=from.split(':').map(Number);
  const [h2,m2]=to.split(':').map(Number);
  let durationMins=(h2*60+m2)-(h1*60+m1);
  if(durationMins<0)durationMins+=1440;
  const unit=LF_CAT_UNIT_MAP[cat]||'hrs';
  const duration=unit==='hrs'?+(durationMins/60).toFixed(4):durationMins;
  const habitId=LF_CAT_HABIT_MAP[cat]||cat.toLowerCase().replace(/\s+/g,'-');

  const ud=getUserData();if(!ud)return;

  const entry={
    id:Date.now(),
    habitId,
    habitName:cat,
    habitIcon:icon,
    date:dateVal,
    duration: +(durationMins/60).toFixed(4),  // always hrs — consistent with stopwatch
    unit: 'hrs',                               // unified unit for trend aggregation
    displayUnit: unit,                         // keep original unit for display in history
    startTime:_aaFmtDisplay?_aaFmtDisplay(from):from,
    endTime:_aaFmtDisplay?_aaFmtDisplay(to):to,
    note:document.getElementById('lf-note').value.trim()
  };
  ud.logs.push(entry);

  // If reminder checked, save alarm
  const hasReminder=document.getElementById('lf-reminder-check').checked;
  if(hasReminder){
    if(!ud.quickAlarms)ud.quickAlarms=[];
    ud.quickAlarms.push({
      id:entry.id,date:dateVal,fromTime:from,toTime:to,
      fromDisplay:entry.startTime,toDisplay:entry.endTime,
      duration:diff||'—',durationMins,durationHrs:+(durationMins/60).toFixed(2),
      category:cat,sound:_lfSound,createdAt:new Date().toISOString()
    });
    _scheduleQuickAlarm({id:entry.id,date:dateVal,fromTime:from,toTime:to,
      fromDisplay:entry.startTime,toDisplay:entry.endTime,
      duration:diff||'—',category:cat,sound:_lfSound});
  }

  saveUserData();

  msg.textContent=`✅ Logged! ${cat} · ${diff||duration+' '+unit}`;
  msg.className='auth-msg ok';

  // Reset form partially
  document.getElementById('lf-note').value='';
  document.getElementById('lf-reminder-check').checked=false;
  document.getElementById('lf-reminder-sound').style.display='none';

  renderCalendar2();
  renderCalendar();
  renderTrends();
  renderHistory();

  // Show it on mini cal
  selectedDay2=dateVal;
  cal2Year=parseInt(dateVal.split('-')[0]);
  cal2Month=parseInt(dateVal.split('-')[1])-1;
  renderCalendar2();

  setTimeout(()=>{msg.textContent='';msg.className='auth-msg';},3000);
}

/* ═══════════════════════════════════════
   TRENDS & CHARTS
═══════════════════════════════════════ */
let chartInstances={};

/* Palette for multi-line chart — one colour per activity */
const TREND_PALETTE=[
  '#1D9E75','#534AB7','#BA7517','#C0392B','#2980B9','#8E44AD','#16A085','#D35400','#27AE60','#E91E8C'
];

/* Track which activity is currently focused (null = show all) */
let _trendFocusKey = null;

function renderTrends(){
  const content=document.getElementById('trends-content');
  if(!content)return;
  const ud=getUserData();
  if(!ud||!ud.logs.length){
    content.innerHTML=`<div class="no-data-msg"><div class="no-data-icon">📊</div><div>No habit logs yet.</div><div style="margin-top:6px;font-size:12px">Log your habits in the Tracker tab to see trends here.</div></div>`;
    return;
  }
  Object.values(chartInstances).forEach(c=>{try{c.destroy();}catch(e){}});
  chartInstances={};
  content.innerHTML='';

  /* ── 1. Build per-activity daily aggregates (all in hrs) ── */
  const byActivity={};
  ud.logs.forEach(l=>{
    const key=l.habitId||l.habitName.toLowerCase().replace(/\s+/g,'-');
    if(!byActivity[key]){
      byActivity[key]={name:l.habitName,icon:l.habitIcon||'📋',byDate:{}};
    }
    const durationHrs = l.unit==='mins' ? l.duration/60 : l.duration;
    byActivity[key].byDate[l.date]=(byActivity[key].byDate[l.date]||0)+durationHrs;
  });

  const activityKeys=Object.keys(byActivity);
  if(!activityKeys.length){
    content.innerHTML=`<div class="no-data-msg"><div class="no-data-icon">📊</div><div>No activity logs yet.</div></div>`;
    return;
  }

  /* ── 2. Union of all dates, sorted ── */
  const allDatesSet=new Set();
  activityKeys.forEach(k=>Object.keys(byActivity[k].byDate).forEach(d=>allDatesSet.add(d)));
  const allDates=[...allDatesSet].sort();
  const dateLabels=allDates.map(d=>new Date(d+'T12:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}));

  /* ── 3. Build all datasets ── */
  const allDatasets=activityKeys.map((key,idx)=>{
    const act=byActivity[key];
    const color=TREND_PALETTE[idx%TREND_PALETTE.length];
    const data=allDates.map(d=>act.byDate[d]!=null?+act.byDate[d].toFixed(2):null);
    return{
      label:`${act.icon} ${act.name}`,
      data,
      borderColor:color,
      backgroundColor:color+'22',
      pointBackgroundColor:color,
      pointRadius:5,
      pointHoverRadius:8,
      tension:.35,
      fill:false,
      spanGaps:true,
      _key:key
    };
  });

  /* ── 4. Render chart card ── */
  const card=document.createElement('div');
  card.className='chart-card';
  card.style.cssText='padding:20px 16px 16px';

  /* Build legend chips — clickable */
  function buildLegendHTML(focusKey){
    return allDatasets.map((ds,i)=>{
      const color=TREND_PALETTE[i%TREND_PALETTE.length];
      const isActive = !focusKey || focusKey===ds._key;
      const opacity = isActive ? '1' : '0.35';
      const fw = isActive ? '600' : '400';
      return `<span class="trend-legend-chip" data-key="${ds._key}" style="--chip-color:${color};opacity:${opacity};font-weight:${fw};cursor:pointer;transition:opacity .2s">${ds.label}</span>`;
    }).join('');
  }

  /* Build trend badges — clickable */
  function buildBadgesHTML(focusKey){
    return activityKeys.map((key,i)=>{
      const act=byActivity[key];
      const vals=allDates.map(d=>act.byDate[d]||0).filter(v=>v>0);
      const trend=calcTrend(vals);
      const color=TREND_PALETTE[i%TREND_PALETTE.length];
      const arrow=trend.dir==='up'?'↑':trend.dir==='down'?'↓':'→';
      const label=trend.dir==='up'?'up':trend.dir==='down'?'down':'stable';
      const isActive = !focusKey || focusKey===key;
      const ring = focusKey===key ? `box-shadow:0 0 0 2px ${color};` : '';
      const opacity = isActive ? '1' : '0.35';
      return `<div class="trend-act-badge" data-key="${key}" style="border-left:3px solid ${color};cursor:pointer;opacity:${opacity};transition:opacity .2s,box-shadow .2s;${ring}">
        <span class="trend-act-name">${act.icon} ${act.name}</span>
        <span class="trend-act-arrow ${trend.dir}">${arrow} ${label}</span>
        <span class="trend-act-avg">avg ${trend.avg.toFixed(2)} hrs/day</span>
      </div>`;
    }).join('');
  }

  /* Focus label shown below title */
  function focusLabel(focusKey){
    if(!focusKey) return '';
    const idx = activityKeys.indexOf(focusKey);
    const act = byActivity[focusKey];
    const color = TREND_PALETTE[idx%TREND_PALETTE.length];
    return `<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;background:${color}18;color:${color};border:1px solid ${color}44;border-radius:10px;padding:2px 9px;margin-left:8px;font-weight:600">${act.icon} ${act.name} only · <span style="cursor:pointer;font-weight:700" id="trend-clear-focus">✕ show all</span></span>`;
  }

  card.innerHTML=`
    <div class="chart-title" style="margin-bottom:4px;display:flex;align-items:center;flex-wrap:wrap;gap:6px">📈 Activity Trends<span id="trend-focus-label">${focusLabel(_trendFocusKey)}</span></div>
    <div class="chart-sub" style="margin-bottom:14px">Daily hours per activity · hover dots for info · <strong>click an activity</strong> to isolate its trendline</div>
    <div class="trend-legend-row" id="trend-legend-row">${buildLegendHTML(_trendFocusKey)}</div>
    <div style="position:relative;width:100%;height:260px;margin-top:12px">
      <canvas id="chart-combined-trends" role="img" aria-label="Combined activity trends chart"></canvas>
    </div>
    <div class="trend-acts-grid" id="trend-acts-grid" style="margin-top:16px">${buildBadgesHTML(_trendFocusKey)}</div>`;

  content.appendChild(card);

  /* ── Helper: get datasets filtered by focus ── */
  function getVisibleDatasets(focusKey){
    if(!focusKey) return allDatasets;
    return allDatasets.filter(ds=>ds._key===focusKey);
  }

  /* ── Apply focus: update chart + UI without full re-render ── */
  function applyFocus(focusKey){
    _trendFocusKey = focusKey;
    const visDs = getVisibleDatasets(focusKey);

    // Update chart data
    const ch = chartInstances['combined'];
    if(ch){
      ch.config.data.datasets = visDs;
      ch._draw();
    }

    // Update legend chips
    const legendRow = document.getElementById('trend-legend-row');
    if(legendRow) legendRow.innerHTML = buildLegendHTML(focusKey);

    // Re-attach legend chip listeners
    document.querySelectorAll('#trend-legend-row .trend-legend-chip').forEach(chip=>{
      chip.addEventListener('click', ()=>{
        const k = chip.dataset.key;
        applyFocus(_trendFocusKey===k ? null : k);
      });
    });

    // Update badges
    const grid = document.getElementById('trend-acts-grid');
    if(grid) grid.innerHTML = buildBadgesHTML(focusKey);

    // Re-attach badge listeners
    document.querySelectorAll('#trend-acts-grid .trend-act-badge').forEach(badge=>{
      badge.addEventListener('click', ()=>{
        const k = badge.dataset.key;
        applyFocus(_trendFocusKey===k ? null : k);
      });
    });

    // Update focus label
    const lbl = document.getElementById('trend-focus-label');
    if(lbl){
      lbl.innerHTML = focusLabel(focusKey);
      const clearBtn = document.getElementById('trend-clear-focus');
      if(clearBtn) clearBtn.addEventListener('click', e=>{ e.stopPropagation(); applyFocus(null); });
    }
  }

  /* ── 5. Render chart ── */
  setTimeout(()=>{
    const ctx=document.getElementById('chart-combined-trends');
    if(!ctx)return;

    const visDs = getVisibleDatasets(_trendFocusKey);

    chartInstances['combined']=new Chart(ctx,{
      type:'line',
      data:{labels:dateLabels, datasets: visDs},
      options:{
        responsive:true,
        maintainAspectRatio:false,
        plugins:{
          legend:{display:false},
          tooltip:{
            callbacks:{
              label:ctx=>{
                if(ctx.parsed.y===null)return null;
                return ` ${ctx.dataset.label}: ${ctx.parsed.y} hrs`;
              }
            }
          }
        },
        onClick: function(dot){
          // dot = { ds, i, v, label, color }
          const key = dot.ds._key;
          applyFocus(_trendFocusKey===key ? null : key);
        },
        scales:{
          x:{
            grid:{color:'rgba(0,0,0,0.04)'},
            ticks:{font:{size:11},color:'#a09c96',maxRotation:45,minRotation:0}
          },
          y:{
            min:0,
            grid:{color:'rgba(0,0,0,0.04)'},
            ticks:{font:{size:11},color:'#a09c96',maxTicksLimit:6,callback:v=>v+' h'}
          }
        }
      }
    });

    /* Wire legend chip clicks after chart is ready */
    document.querySelectorAll('#trend-legend-row .trend-legend-chip').forEach(chip=>{
      chip.addEventListener('click', ()=>{
        const k = chip.dataset.key;
        applyFocus(_trendFocusKey===k ? null : k);
      });
    });

    /* Wire badge clicks */
    document.querySelectorAll('#trend-acts-grid .trend-act-badge').forEach(badge=>{
      badge.addEventListener('click', ()=>{
        const k = badge.dataset.key;
        applyFocus(_trendFocusKey===k ? null : k);
      });
    });

    /* Wire clear-focus button if focus is already active */
    const clearBtn = document.getElementById('trend-clear-focus');
    if(clearBtn) clearBtn.addEventListener('click', e=>{ e.stopPropagation(); applyFocus(null); });

  },50);

  /* ── 6. Sleep score card (if check-ins exist) ── */
  if(ud.checkInHistory&&ud.checkInHistory.length>0){
    const scoreCard=buildScoreChart(ud.checkInHistory);
    content.appendChild(scoreCard);
  }

  /* ── 7. Insight card ── */
  const ins=buildInsight(ud.logs,ud.checkInHistory||[]);
  if(ins)content.appendChild(ins);
}

function buildScoreChart(history){
  const card=document.createElement('div');
  card.className='chart-card';
  const labels=history.map(h=>h.date?new Date(h.date).toLocaleDateString('en-US',{month:'short',day:'numeric'}):'?');
  const scores=history.map(h=>h.score);
  const trend=calcTrend(scores);
  card.innerHTML=`
    <div class="chart-title">Sleep score over time</div>
    <div class="chart-sub">From your check-ins</div>
    <div style="position:relative;width:100%;height:180px"><canvas id="chart-score" role="img" aria-label="Sleep score trend chart">Your sleep scores over time.</canvas></div>
    <div class="trend-badge ${trend.dir}" style="margin-top:10px">
      ${trend.dir==='up'?'↑ Improving':trend.dir==='down'?'↓ Declining':'→ Stable'}
      (avg ${Math.round(trend.avg)}/50)
    </div>
    <div class="chart-rec">${getScoreRec(trend)}</div>`;
  setTimeout(()=>{
    const ctx=document.getElementById('chart-score');
    if(!ctx)return;
    chartInstances['score']=new Chart(ctx,{
      type:'line',
      data:{labels,datasets:[{label:'Sleep score',data:scores,borderColor:'#1D9E75',backgroundColor:'rgba(29,158,117,0.08)',pointBackgroundColor:'#1D9E75',tension:.35,fill:true}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{min:0,max:50,ticks:{stepSize:10}}}}
    });
  },50);
  return card;
}



function calcTrend(vals){
  if(!vals.length)return{dir:'neutral',avg:0,slope:0};
  const avg=vals.reduce((a,b)=>a+b,0)/vals.length;
  if(vals.length<2)return{dir:'neutral',avg,slope:0};
  const n=vals.length;
  const sumX=vals.reduce((_,__,i)=>_+i,0);
  const sumY=vals.reduce((a,b)=>a+b,0);
  const sumXY=vals.reduce((a,b,i)=>a+i*b,0);
  const sumXX=vals.reduce((a,_,i)=>a+i*i,0);
  const slope=(n*sumXY-sumX*sumY)/(n*sumXX-sumX*sumX);
  const dir=Math.abs(slope)<0.05?'neutral':slope>0?'up':'down';
  return{dir,avg,slope};
}

function getScoreRec(trend){
  if(trend.dir==='up') return `<strong>Great trajectory!</strong> Your sleep quality is improving. Keep your current bedtime routine consistent.`;
  if(trend.dir==='down') return `<strong>Your sleep score is declining.</strong> Check if work hours or screen time have increased recently — those are the first places to look.`;
  return `<strong>Stable score.</strong> To move the needle, focus on one habit at a time — start with your phone use before bed.`;
}

function getHabitRec(id,trend,unit){
  const recs={
    sleep:{up:'Sleep duration improving — great! Aim to keep it above 7 hours consistently.',down:'Sleep hours are declining. Try a consistent bedtime, even 15 min earlier helps.',neutral:'Sleep is stable. Try logging what time you go to bed to spot patterns.'},
    work:{up:'Work hours trending up. Watch out for fatigue — schedule clear start and stop times.',down:'Work hours decreasing — good if intentional. Make sure rest time is actually restful.',neutral:'Work hours are stable. Consistent boundaries support long-term energy.'},
    exercise:{up:'Exercise is trending up — excellent! Your energy levels should reflect this soon.',down:'Exercise declining. Even a 10-min walk daily counts. Start small.',neutral:'Exercise is steady. Try adding one new activity per week to build gradually.'},
    screen:{up:'Screen time increasing. This may be affecting your sleep depth.',down:'Screen time going down — especially before bed, this has a direct positive effect on sleep.',neutral:'Screen time stable. Try tracking when you use it most — evening use is highest risk.'},
    reading:{up:'Reading more is a great wind-down habit, especially before bed.',down:'Reading less recently. Even 10 pages before bed can help with sleep onset.',neutral:'Consistent reading habit. Great for mental wind-down.'},
    meditation:{up:'Meditation practice growing — this directly supports stress recovery and sleep.',down:'Meditation dipping. Even 5 minutes of deep breathing counts.',neutral:'Steady meditation practice — keep it going.'},
  };
  const r=recs[id];
  if(!r)return '';
  return r[trend.dir]||r.neutral;
}

function buildInsight(logs,checkIns){
  if(checkIns.length<2||!logs.length)return null;
  const card=document.createElement('div');
  card.className='chart-card';
  const sleepLogs=logs.filter(l=>l.habitId==='sleep');
  if(sleepLogs.length<2){card.innerHTML=`<div class="chart-title">💡 Insight</div><div class="chart-sub" style="margin-top:6px">Log more sleep data to unlock correlation insights.</div>`;return card;}
  const lastScore=checkIns[checkIns.length-1].score;
  const sleepAvg=sleepLogs.reduce((a,b)=>a+b.duration,0)/sleepLogs.length;
  const insight=lastScore>35
    ?`Your recent check-in score is strong (${lastScore}/50). Your average logged sleep of ${sleepAvg.toFixed(1)} hrs supports this — continue prioritising consistent sleep times.`
    :`Your check-in score is ${lastScore}/50 with an average logged sleep of ${sleepAvg.toFixed(1)} hrs. Increasing sleep consistency (not just duration) is likely to move this score higher.`;
  card.innerHTML=`<div class="chart-title">💡 Key insight</div><div style="font-size:13px;color:var(--muted);margin-top:8px;line-height:1.7">${insight}</div>`;
  return card;
}

/* ═══════════════════════════════════════
   SETTINGS
═══════════════════════════════════════ */
function renderSettings() {
  if (!currentUser) return;
  const users = _loadUsers();
  const u = users[currentUser.username];
  if (!u) return;

  document.getElementById('settings-avatar').textContent = currentUser.name.charAt(0).toUpperCase();
  document.getElementById('settings-name-display').textContent = currentUser.name;
  document.getElementById('settings-user-display').textContent = '@' + currentUser.username;
  document.getElementById('set-name').value = u.name;
  document.getElementById('set-username').value = currentUser.username;
  document.getElementById('set-pass').value = '';
  document.getElementById('set-pass2').value = '';
  document.getElementById('set-current-pass').value = '';
  document.getElementById('settings-msg').className = 'auth-msg';
  document.getElementById('settings-msg').textContent = '';

  const ud = getUserData();
  const logCount = ud ? ud.logs.length : 0;
  const checkCount = ud ? ud.checkInHistory.length : 0;
  const joined = u.joinedAt ? new Date(u.joinedAt).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'}) : 'Unknown';
  const lastChanged = u.lastChanged ? new Date(u.lastChanged).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'}) : 'Never';

  document.getElementById('settings-record').innerHTML = `
    <div style="display:grid;gap:8px">
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:.5px solid var(--border)">
        <span style="color:var(--hint)">Full name</span><span style="color:var(--text);font-weight:500">${u.name}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:.5px solid var(--border)">
        <span style="color:var(--hint)">Username</span><span style="color:var(--text);font-weight:500">@${currentUser.username}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:.5px solid var(--border)">
        <span style="color:var(--hint)">Password</span><span style="color:var(--text);font-weight:500">••••••</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:.5px solid var(--border)">
        <span style="color:var(--hint)">Account created</span><span style="color:var(--text);font-weight:500">${joined}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:.5px solid var(--border)">
        <span style="color:var(--hint)">Last profile update</span><span style="color:var(--text);font-weight:500">${lastChanged}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:.5px solid var(--border)">
        <span style="color:var(--hint)">Total logs</span><span style="color:var(--green-dk);font-weight:600">${logCount}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:8px 0">
        <span style="color:var(--hint)">Check-ins completed</span><span style="color:var(--green-dk);font-weight:600">${checkCount}</span>
      </div>
    </div>`;
}

function saveSettings() {
  const newName     = document.getElementById('set-name').value.trim();
  const newUsername = document.getElementById('set-username').value.trim().toLowerCase();
  const newPass     = document.getElementById('set-pass').value;
  const newPass2    = document.getElementById('set-pass2').value;
  const currentPass = document.getElementById('set-current-pass').value;

  const msgEl = document.getElementById('settings-msg');
  const err = (t) => { msgEl.textContent = t; msgEl.className = 'auth-msg err'; };
  const ok  = (t) => { msgEl.textContent = t; msgEl.className = 'auth-msg ok'; };

  if (!newName || !newUsername) return err('Name and username cannot be empty.');
  if (newUsername.length < 3) return err('Username must be at least 3 characters.');
  if (!currentPass) return err('Please enter your current password to save changes.');

  const users = _loadUsers();
  const u = users[currentUser.username];
  if (!u || u.pass !== currentPass) return err('Current password is incorrect.');

  if (newUsername !== currentUser.username && users[newUsername]) return err('That username is already taken.');

  if (newPass || newPass2) {
    if (newPass.length < 6) return err('New password must be at least 6 characters.');
    if (newPass !== newPass2) return err('New passwords do not match.');
  }

  const finalPass = newPass || u.pass;

  if (newUsername !== currentUser.username) {
    const existingData = localStorage.getItem('qt_data_' + currentUser.username);
    if (existingData) {
      localStorage.setItem('qt_data_' + newUsername, existingData);
      localStorage.removeItem('qt_data_' + currentUser.username);
    }
    delete users[currentUser.username];
  }

  users[newUsername] = {
    name: newName,
    pass: finalPass,
    joinedAt: u.joinedAt || new Date().toISOString(),
    lastChanged: new Date().toISOString()
  };
  _saveUsers(users);

  currentUser = { username: newUsername, name: newName };
  localStorage.setItem('qt_session', JSON.stringify({ username: newUsername }));

  document.getElementById('hdr-avatar').textContent = newName.charAt(0).toUpperCase();
  document.getElementById('hdr-name').textContent = newName;
  document.getElementById('greeting-name').textContent = newName.split(' ')[0];

  ok('✅ Changes saved successfully!');
  renderSettings();
}

function deleteAccount() {
  if (!currentUser) return;
  const confirmed = confirm(`Are you sure you want to permanently delete your account "@${currentUser.username}" and all your data? This cannot be undone.`);
  if (!confirmed) return;
  const pass = prompt('Enter your password to confirm:');
  if (pass === null) return;
  const users = _loadUsers();
  if (!users[currentUser.username] || users[currentUser.username].pass !== pass) {
    alert('Incorrect password. Account not deleted.');
    return;
  }
  localStorage.removeItem('qt_data_' + currentUser.username);
  localStorage.removeItem('qt_session');
  delete users[currentUser.username];
  _saveUsers(users);
  currentUser = null;
  _currentData = null;
  location.reload();
}

function lfGoToDate(dateStr){
  showTab('tracker');
  setTimeout(()=>{
    const dateEl=document.getElementById('lf-date');
    if(dateEl){dateEl.value=dateStr;}
    cal2Year=parseInt(dateStr.split('-')[0]);
    cal2Month=parseInt(dateStr.split('-')[1])-1;
    selectedDay2=dateStr;
    renderCalendar2();
    document.getElementById('log-form-card').scrollIntoView({behavior:'smooth'});
  },100);
}
let historyFilter = 'all';

/* Format a log entry's duration for display — always readable */
function _fmtLogDuration(l) {
  const hrs = l.unit === 'mins' ? l.duration / 60 : Number(l.duration) || 0;
  const totalMins = Math.round(hrs * 60);
  if (totalMins < 1) return '< 1m';
  if (totalMins < 60) return totalMins + 'min';
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return m > 0 ? h + 'h ' + m + 'min' : h + 'h';
}

function renderHistory() {
  const content = document.getElementById('history-content');
  const filterWrap = document.getElementById('history-filter');
  if (!content || !filterWrap) return;

  const ud = getUserData();
  if (!ud || !ud.logs.length) {
    filterWrap.innerHTML = '';
    content.innerHTML = `<div class="no-data-msg"><div class="no-data-icon">📖</div><div>No logs yet.</div><div style="margin-top:6px;font-size:12px">Log habits in the Tracker tab and they'll appear here.</div></div>`;
    return;
  }

  const habitIds = [...new Set(ud.logs.map(l => l.habitId))];
  filterWrap.innerHTML = '';
  const allBtn = document.createElement('button');
  allBtn.className = 'sound-btn' + (historyFilter === 'all' ? ' sel' : '');
  allBtn.textContent = '🗂 All';
  allBtn.onclick = () => { historyFilter = 'all'; renderHistory(); };
  filterWrap.appendChild(allBtn);

  // Build unique categories from logs — exclude quick alarms
  const seen = new Set();
  ud.logs.filter(l => !l.isQuickAlarm).forEach(l => {
    if(seen.has(l.habitId)) return;
    seen.add(l.habitId);
    const btn = document.createElement('button');
    btn.className = 'sound-btn' + (historyFilter === l.habitId ? ' sel' : '');
    btn.textContent = l.habitIcon + ' ' + l.habitName;
    btn.onclick = () => { historyFilter = l.habitId; renderHistory(); };
    filterWrap.appendChild(btn);
  });

  const logs = ud.logs
    .filter(l => !l.isQuickAlarm && (historyFilter === 'all' || l.habitId === historyFilter))
    .slice()
    .sort((a, b) => b.id - a.id);

  const byDate = {};
  logs.forEach(l => {
    if (!byDate[l.date]) byDate[l.date] = [];
    byDate[l.date].push(l);
  });

  content.innerHTML = '';
  /* ── Summary first, then dated entries below ── */
  _renderActivitySummary(content, ud);

  Object.keys(byDate).sort((a,b) => b.localeCompare(a)).forEach(dateStr => {
    const heading = document.createElement('div');
    const d = new Date(dateStr + 'T12:00:00');
    const isToday = dateStr === new Date().toISOString().split('T')[0];
    const isYesterday = dateStr === new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const label = isToday ? 'Today' : isYesterday ? 'Yesterday' : d.toLocaleDateString('en-US', {weekday:'long', month:'short', day:'numeric'});
    heading.innerHTML = `<div style="font-size:11px;font-weight:600;color:var(--hint);letter-spacing:.07em;text-transform:uppercase;padding:16px 0 8px;border-top:.5px solid var(--border);margin-top:4px">${label}</div>`;
    content.appendChild(heading);

    byDate[dateStr].forEach(l => {
      const item = document.createElement('div');
      item.className = 'log-entry-item';
      item.style.cssText = 'background:var(--surf);border:.5px solid var(--border);border-radius:var(--r);padding:12px 14px;margin-bottom:8px;display:flex;align-items:flex-start;gap:12px';
      item.innerHTML = `
        <div class="log-entry-icon" style="flex-shrink:0">${l.habitIcon}</div>
        <div class="log-entry-meta" style="flex:1;min-width:0">
          <div class="log-entry-habit">
            ${l.habitName}
            ${l.isSchedule ? '<span class="sc-history-badge">📅 Schedule</span>' : ''}
            ${l.note && l.note.startsWith('Stopwatch') ? '<span class="sc-history-badge sw-badge">⏱ Stopwatch</span>' : ''}
          </div>
          <div class="log-entry-dur">
            <strong>${_fmtLogDuration(l)}</strong>
            ${l.startTime ? `<span style="color:var(--hint)"> · ${l.startTime}${l.endTime ? '–'+l.endTime : ''}</span>` : ''}
          </div>
        </div>
        <button onclick="deleteLog(${l.id})" title="Delete this entry" style="background:none;border:none;cursor:pointer;color:var(--hint);font-size:16px;padding:2px 4px;flex-shrink:0;line-height:1" onmouseover="this.style.color='var(--red)'" onmouseout="this.style.color='var(--hint)'">🗑</button>`;
      content.appendChild(item);
    });
  });
}

function _renderActivitySummary(container, ud) {
  // Always aggregate ALL logs (ignore current historyFilter) so summary is always complete
  const allLogs = ud.logs.filter(l => !l.isQuickAlarm);
  if (!allLogs.length) return;

  // Also pull durations from schedules (planned time), stored separately
  // Aggregate by habitId → { name, icon, totalHrs, sessions }
  const byActivity = {};

  allLogs.forEach(l => {
    const key = l.habitId || l.habitName;
    if (!byActivity[key]) {
      byActivity[key] = { name: l.habitName, icon: l.habitIcon || '📋', totalHrs: 0, sessions: 0 };
    }
    // Normalise to hours
    const hrs = l.unit === 'mins' ? l.duration / 60 : Number(l.duration) || 0;
    byActivity[key].totalHrs += hrs;
    byActivity[key].sessions += 1;
  });

  const entries = Object.values(byActivity).sort((a, b) => b.totalHrs - a.totalHrs);
  if (!entries.length) return;

  // Helper: format hours nicely
  function _fmtHrs(hrs) {
    if (hrs < 1/60) return '< 1m';
    const totalMins = Math.round(hrs * 60);
    if (totalMins < 60) return `${totalMins}m`;
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  const section = document.createElement('div');
  section.className = 'hist-summary-section';
  section.innerHTML = `
    <div class="hist-summary-header">
      <span class="hist-summary-title">📊 Total by Activity</span>
      <span class="hist-summary-sub">All-time · across all logs</span>
    </div>
    <div class="hist-summary-grid">
      ${entries.map(e => `
        <div class="hist-summary-card">
          <div class="hist-summary-icon">${e.icon}</div>
          <div class="hist-summary-info">
            <div class="hist-summary-name">${e.name}</div>
            <div class="hist-summary-sessions">${e.sessions} session${e.sessions !== 1 ? 's' : ''}</div>
          </div>
          <div class="hist-summary-total">${_fmtHrs(e.totalHrs)}</div>
        </div>`).join('')}
    </div>`;

  container.appendChild(section);
}

function deleteLog(logId) {
  const ud = getUserData();
  if (!ud) return;
  const idx = ud.logs.findIndex(l => l.id === logId);
  if (idx === -1) return;
  ud.logs.splice(idx, 1);
  saveUserData();
  renderHistory();
  renderCalendar();
  renderCalendar2();
  renderTrends();
}

/* ═══════════════════════════════════════
   EXPORT
═══════════════════════════════════════ */
function exportCSV(){
  const ud=getUserData();
  if(!ud||!ud.logs.length){alert('No logs to export yet.');return;}
  const rows=[['Date','Habit','Duration','Unit','Start','End','Note']];
  ud.logs.forEach(l=>rows.push([l.date,l.habitName,l.duration,l.unit,l.startTime||'',l.endTime||'',l.note||'']));
  const csv=rows.map(r=>r.map(c=>`"${c}"`).join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='quick-tracker-logs.csv';
  a.click();
}

function exportExcel(){
  const ud=getUserData();
  if(!ud||!ud.logs.length){alert('No logs to export yet.');return;}
  const rows=[['Date','Habit','Duration','Unit','Start Time','End Time','Note']];
  ud.logs.forEach(l=>rows.push([l.date,l.habitName,l.duration,l.unit,l.startTime||'',l.endTime||'',l.note||'']));
  const header=`<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"><style>td{font-family:Calibri,sans-serif;font-size:11pt;padding:4px 8px;border:1px solid #ccc}th{background:#1D9E75;color:#fff;font-weight:600}</style></head><body><table>`;
  const htmlRows=rows.map((r,i)=>`<tr>${r.map(c=>`<${i===0?'th':'td'}>${c}</${i===0?'th':'td'}>`).join('')}</tr>`).join('');
  const html=header+htmlRows+'</table></body></html>';
  const blob=new Blob([html],{type:'application/vnd.ms-excel'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='quick-tracker-logs.xls';
  a.click();
}
/* ═══════════════════════════════════════
   ADD ALARM MODAL  (floating + button)
═══════════════════════════════════════ */

// Category icons map for display
const AA_CAT_ICONS = {
  'Studies':'📚','Sleep':'😴','Screen Use':'📱','Exercise':'🏃','Meals':'🍽','Other':'✍'
};

// State for the add-alarm modal
let _aaSound = 'bell';
let _aaCustomSoundData = null;
let _aaSelectedCat = '';

function openAddAlarmModal() {
  _aaSound = 'bell';
  _aaCustomSoundData = null;
  _aaSelectedCat = '';

  // Reset fields
  document.getElementById('aa-from-h').value = '8';
  document.getElementById('aa-from-m').value = '00';
  document.getElementById('aa-to-h').value = '9';
  document.getElementById('aa-to-m').value = '00';
  aaSetAmPm('from','AM');
  aaSetAmPm('to','AM');
  document.getElementById('aa-custom-activity').value = '';
  document.getElementById('aa-categories').querySelectorAll('.aa-cat-btn').forEach(b=>b.classList.remove('sel'));
  document.getElementById('aa-sounds').querySelectorAll('.sound-btn').forEach(b=>b.classList.remove('sel'));
  const bellBtn = document.querySelector('#aa-sounds [data-sound="bell"]');
  if(bellBtn) bellBtn.classList.add('sel');
  const msg = document.getElementById('aa-msg');
  msg.textContent=''; msg.className='auth-msg';
  _aaDurationUpdate();
  document.getElementById('add-alarm-modal').style.display = 'flex';
}

function closeAddAlarmModal() {
  document.getElementById('add-alarm-modal').style.display = 'none';
}

function aaSetAmPm(side, val) {
  document.getElementById(`aa-${side}-am`).classList.toggle('sel', val==='AM');
  document.getElementById(`aa-${side}-pm`).classList.toggle('sel', val==='PM');
  _aaDurationUpdate();
}

function _aaGetTime(side) {
  const h = document.getElementById(`aa-${side}-h`).value;
  const m = document.getElementById(`aa-${side}-m`).value;
  const isAM = document.getElementById(`aa-${side}-am`).classList.contains('sel');
  return to24(h, m, isAM ? 'AM' : 'PM');
}

function _aaDurationUpdate() {
  const from = _aaGetTime('from');
  const to   = _aaGetTime('to');
  const disp = document.getElementById('aa-duration-display');
  if(!disp) return;
  const diff = calcDiff(from, to);
  disp.textContent = diff ? `Total Duration: ${diff}` : 'Total Duration: —';
}

// Wire live updates once DOM ready
document.addEventListener('DOMContentLoaded', function() {
  ['aa-from-h','aa-from-m','aa-to-h','aa-to-m'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.addEventListener('input', _aaDurationUpdate);
  });
});

function aaSelectCat(btn) {
  document.getElementById('aa-categories').querySelectorAll('.aa-cat-btn').forEach(b=>b.classList.remove('sel'));
  btn.classList.add('sel');
  _aaSelectedCat = btn.dataset.cat;
  // Clear custom text if a preset is chosen
  document.getElementById('aa-custom-activity').value = '';
}

function aaClearCatIfTyping() {
  // If user types in custom field, deselect any preset category
  if(document.getElementById('aa-custom-activity').value.trim()) {
    document.getElementById('aa-categories').querySelectorAll('.aa-cat-btn').forEach(b=>b.classList.remove('sel'));
    _aaSelectedCat = '';
  }
}

function aaSelectSound(btn) {
  document.getElementById('aa-sounds').querySelectorAll('.sound-btn').forEach(b=>b.classList.remove('sel'));
  btn.classList.add('sel');
  _aaSound = btn.dataset.sound;
  _aaCustomSoundData = null;
  playSound(_aaSound, null);
}

function aaUploadSound(input) {
  const file = input.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    _aaCustomSoundData = e.target.result;
    _aaSound = 'custom';
    document.getElementById('aa-sounds').querySelectorAll('.sound-btn').forEach(b=>b.classList.remove('sel'));
    input.previousElementSibling.textContent = '✅ ' + file.name.substring(0,16);
    playSound('custom', _aaCustomSoundData);
  };
  reader.readAsDataURL(file);
}

function saveAddAlarm() {
  const from = _aaGetTime('from');
  const to   = _aaGetTime('to');
  const customText = document.getElementById('aa-custom-activity').value.trim();
  const category = customText || _aaSelectedCat;
  const msg = document.getElementById('aa-msg');

  if(!category) {
    msg.textContent = 'Please select a category or enter a custom activity.';
    msg.className = 'auth-msg err';
    return;
  }

  const diff = calcDiff(from, to);
  const fromDisplay = _aaFmtDisplay(from);
  const toDisplay   = _aaFmtDisplay(to);

  // Calculate duration in minutes for data
  const [h1,m1] = from.split(':').map(Number);
  const [h2,m2] = to.split(':').map(Number);
  let durationMins = (h2*60+m2) - (h1*60+m1);
  if(durationMins < 0) durationMins += 1440;
  const durationHrs = +(durationMins/60).toFixed(2);

  const ud = getUserData();
  if(!ud) { msg.textContent='Please sign in first.'; msg.className='auth-msg err'; return; }

  // Ensure quickAlarms array exists
  if(!ud.quickAlarms) ud.quickAlarms = [];

  const entry = {
    id: Date.now(),
    date: new Date().toISOString().split('T')[0],
    fromTime: from,
    toTime: to,
    fromDisplay,
    toDisplay,
    duration: diff || '—',
    durationMins,
    durationHrs,
    category,
    isCustomCategory: !!customText,
    sound: _aaSound,
    createdAt: new Date().toISOString()
  };

  ud.quickAlarms.push(entry);

  // Also push into logs array so it shows in History and Trends
  const catIcon = AA_CAT_ICONS[category] || '⏰';
  ud.logs.push({
    id: entry.id,
    habitId: 'quickalarm',
    habitName: category,
    habitIcon: catIcon,
    date: entry.date,
    duration: durationHrs,
    unit: 'hrs',
    startTime: fromDisplay,
    endTime: toDisplay,
    note: `Quick Alarm · ${diff||'—'} · Sound: ${_aaSound}`,
    isQuickAlarm: true
  });

  saveUserData();

  // Schedule the alarm notification
  _scheduleQuickAlarm(entry);

  msg.textContent = `✅ Alarm saved! ${fromDisplay} → ${toDisplay} · ${diff||'—'}`;
  msg.className = 'auth-msg ok';

  renderHistory();
  renderTrends();
  renderCalendar();

  setTimeout(()=>{ closeAddAlarmModal(); }, 1400);
}

function _aaFmtDisplay(time24) {
  const f = fmt12(time24);
  return `${f.h}:${f.m} ${f.ampm}`;
}

/* ── Quick Alarm scheduler ── */
let _qaTimers = [];

function _scheduleQuickAlarm(entry) {
  const now = new Date();
  const [fh, fm] = entry.fromTime.split(':').map(Number);
  const alarmTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), fh, fm, 0);
  let delay = alarmTime - now;
  if(delay < 0) delay += 86400000; // tomorrow
  if(delay > 86400000) return; // more than a day away, skip for now

  const t = setTimeout(() => {
    const ud = getUserData();
    const sound  = entry.sound;
    const custom = (ud && ud.customSounds) ? ud.customSounds['quickalarm'] : null;
    playSound(sound === 'custom' ? 'custom' : sound, sound === 'custom' ? custom || _aaCustomSoundData : null);

    const catIcon = AA_CAT_ICONS[entry.category] || '⏰';
    document.getElementById('alarm-modal-icon').textContent = catIcon;
    document.getElementById('alarm-modal-title').textContent = `Time for ${entry.category}!`;
    document.getElementById('alarm-modal-sub').textContent = `${entry.fromDisplay} → ${entry.toDisplay} · ${entry.duration}`;
    document.getElementById('alarm-modal').style.display = 'flex';
    currentAlarmHabit = { id: 'quickalarm', name: entry.category };
  }, delay);
  _qaTimers.push(t);
}

/* Extend renderTrends to include Quick Alarm data by category */
const _origRenderTrends = renderTrends;
renderTrends = function() {
  _origRenderTrends();
  _renderQuickAlarmTrends();
};

function _renderQuickAlarmTrends() {
  const ud = getUserData();
  if(!ud || !ud.quickAlarms || !ud.quickAlarms.length) return;
  const content = document.getElementById('trends-content');
  if(!content) return;

  // Group by category
  const byCat = {};
  ud.quickAlarms.forEach(a => {
    if(!byCat[a.category]) byCat[a.category] = [];
    byCat[a.category].push(a);
  });

  const wrapper = document.createElement('div');
  wrapper.innerHTML = `<div style="font-size:11px;font-weight:600;color:var(--hint);text-transform:uppercase;letter-spacing:.08em;padding:12px 0 8px;border-top:.5px solid var(--border);margin-top:8px">⏰ Quick Alarm Activity</div>`;

  Object.entries(byCat).forEach(([cat, alarms]) => {
    const totalMins = alarms.reduce((s,a)=>s+(a.durationMins||0), 0);
    const totalHrs = (totalMins/60).toFixed(1);
    const avgMins = Math.round(totalMins / alarms.length);
    const catIcon = AA_CAT_ICONS[cat] || '⏰';

    const card = document.createElement('div');
    card.className = 'chart-card';
    card.innerHTML = `
      <div class="chart-title">${catIcon} ${cat}</div>
      <div class="chart-sub">${alarms.length} session${alarms.length>1?'s':''} logged via Quick Alarm</div>
      <div class="diff-analysis">
        <div class="diff-chip"><strong>${totalHrs}h</strong> total</div>
        <div class="diff-chip"><strong>${avgMins}m</strong> avg/session</div>
        <div class="diff-chip muted">${alarms.length} alarm${alarms.length>1?'s':''}</div>
      </div>
      <div class="chart-rec" style="margin-top:10px">
        ${_qaInsight(cat, avgMins, alarms.length)}
      </div>`;
    wrapper.appendChild(card);
  });

  content.appendChild(wrapper);
}

function _qaInsight(cat, avgMins, count) {
  const insights = {
    'Studies': avgMins >= 60
      ? `<strong>Great focus sessions!</strong> Averaging ${avgMins} minutes of study. Consistent sessions like this build deep learning habits.`
      : `<strong>Short bursts of study</strong> (avg ${avgMins} min). Try extending to 45–60 min sessions for deeper focus.`,
    'Sleep': avgMins >= 420
      ? `<strong>Good sleep duration</strong> — averaging ${(avgMins/60).toFixed(1)} hours. Consistency is key; try keeping the same bedtime.`
      : `<strong>Sleep may be short</strong> (avg ${(avgMins/60).toFixed(1)} hrs). Most adults need 7–9 hours for full recovery.`,
    'Screen Use': avgMins <= 60
      ? `<strong>Healthy screen time!</strong> Keeping it to ${avgMins} min average is great for eye health and sleep.`
      : `<strong>Screen time is high</strong> (avg ${(avgMins/60).toFixed(1)} hrs). Consider screen-free windows, especially before bed.`,
    'Exercise': avgMins >= 30
      ? `<strong>Active lifestyle!</strong> ${avgMins} min sessions meet the WHO recommended 150 min/week goal.`
      : `<strong>Keep building!</strong> Aim for 30+ min sessions. Even short workouts add up over ${count} sessions.`,
    'Meals': avgMins <= 30
      ? `<strong>Mindful meal timing.</strong> Logging meals helps you stay aware of eating patterns.`
      : `<strong>Long meal windows</strong> (avg ${avgMins} min). Consider whether relaxed meals are intentional or distracted eating.`,
  };
  return insights[cat] || `<strong>${count} logged sessions</strong> for "${cat}". Keep tracking to reveal patterns over time.`;
}

/* Also extend History so Quick Alarm entries show their badge */
const _origRenderHistory = renderHistory;
renderHistory = function() {
  _origRenderHistory();
  // After rendering, add filter button for Quick Alarms if any exist
  const ud = getUserData();
  if(!ud || !ud.quickAlarms || !ud.quickAlarms.length) return;
  const filterWrap = document.getElementById('history-filter');
  if(!filterWrap) return;
  // Check if a QA filter button already exists
  if(filterWrap.querySelector('[data-qa-filter]')) return;
  const btn = document.createElement('button');
  btn.className = 'sound-btn' + (historyFilter === 'quickalarm' ? ' sel' : '');
  btn.textContent = '⏰ Quick Alarm';
  btn.setAttribute('data-qa-filter','1');
  btn.onclick = () => { historyFilter = 'quickalarm'; renderHistory(); };
  filterWrap.appendChild(btn);
};
/* ═══════════════════════════════════════
   SCHEDULE TRACKER  –  new tracker tab
═══════════════════════════════════════ */

const SC_CAT_ICONS = {
  'Sleep':'🌙','Work':'💻','Exercise':'🏃','Studies':'📚',
  'Meals':'🍽','Screen Use':'📱','Reading':'📖','Meditation':'🧘','Other':'✍'
};

let _scSelectedCat = '';
let _scEditId = null;   // null = new, else ID of schedule being edited

/* ── Helpers ── */
function _scFmt12(time24) {
  const [h, m] = time24.split(':').map(Number);
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
}
function _scGet24(prefix) {
  const hEl = document.getElementById(`sc-${prefix}-h`);
  const mEl = document.getElementById(`sc-${prefix}-m`);
  const amBtn = document.getElementById(`sc-${prefix}-am`);
  let h = parseInt(hEl.value) || 12;
  const m = parseInt(mEl.value) || 0;
  const isAM = amBtn.classList.contains('sel');
  if (isAM && h === 12) h = 0;
  if (!isAM && h !== 12) h += 12;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}
function _scSet12(prefix, time24) {
  const [h, m] = time24.split(':').map(Number);
  const isAM = h < 12;
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  document.getElementById(`sc-${prefix}-h`).value = h12;
  document.getElementById(`sc-${prefix}-m`).value = String(m).padStart(2,'0');
  document.getElementById(`sc-${prefix}-am`).classList.toggle('sel', isAM);
  document.getElementById(`sc-${prefix}-pm`).classList.toggle('sel', !isAM);
}
function scSetAmPm(prefix, val) {
  document.getElementById(`sc-${prefix}-am`).classList.toggle('sel', val==='AM');
  document.getElementById(`sc-${prefix}-pm`).classList.toggle('sel', val==='PM');
  _scUpdateDuration();
}
function _scUpdateDuration() {
  const from = _scGet24('from');
  const to   = _scGet24('to');
  const disp = document.getElementById('sc-duration-display');
  if (!disp) return;
  const [h1,m1] = from.split(':').map(Number);
  const [h2,m2] = to.split(':').map(Number);
  let diff = (h2*60+m2) - (h1*60+m1);
  if (diff < 0) diff += 1440;
  const hrs = Math.floor(diff/60);
  const mins = diff % 60;
  disp.textContent = diff === 0 ? 'Total Duration: —'
    : `Total Duration: ${hrs > 0 ? hrs+'h ' : ''}${mins > 0 ? mins+'m' : ''}`;
}

// Wire duration watchers after DOM
document.addEventListener('DOMContentLoaded', function() {
  ['sc-from-h','sc-from-m','sc-to-h','sc-to-m'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', _scUpdateDuration);
  });
});

function scSelectCat(btn) {
  document.querySelectorAll('#sc-categories .aa-cat-btn').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');
  _scSelectedCat = btn.dataset.cat;
  document.getElementById('sc-custom-activity').value = '';
}
function scClearCatIfTyping() {
  document.querySelectorAll('#sc-categories .aa-cat-btn').forEach(b => b.classList.remove('sel'));
  _scSelectedCat = '';
}

function scSetDate(rel) {
  const d = new Date();
  if (rel === 'tomorrow') d.setDate(d.getDate() + 1);
  if (rel === 'next-week') d.setDate(d.getDate() + 7);
  document.getElementById('sc-date').value = d.toISOString().split('T')[0];
}

/* ── Open / Close modal ── */
function openScheduleModal(editId) {
  _scEditId = editId || null;
  const modal = document.getElementById('schedule-modal');
  const titleEl = document.getElementById('schedule-modal-title');
  const saveBtnEl = document.getElementById('sc-save-btn');

  // Reset
  document.querySelectorAll('#sc-categories .aa-cat-btn').forEach(b => b.classList.remove('sel'));
  _scSelectedCat = '';
  document.getElementById('sc-custom-activity').value = '';
  _scTasks = [];
  _scRenderChecklist();
  document.getElementById('sc-task-input').value = '';
  document.getElementById('sc-msg').textContent = '';
  document.getElementById('sc-msg').className = 'auth-msg';

  if (editId) {
    // Load existing
    titleEl.textContent = '✏️ Edit Schedule';
    saveBtnEl.textContent = '💾 Update Schedule';
    const ud = getUserData();
    const sc = (ud.schedules || []).find(s => s.id === editId);
    if (sc) {
      document.getElementById('sc-date').value = sc.date;
      _scSet12('from', sc.fromTime);
      _scSet12('to', sc.toTime);
      _scTasks = sc.tasks ? JSON.parse(JSON.stringify(sc.tasks)) : [];
      _scRenderChecklist();
      const customText = SC_CAT_ICONS[sc.category] ? '' : sc.category;
      if (customText) {
        document.getElementById('sc-custom-activity').value = sc.category;
      } else {
        const catBtn = document.querySelector(`#sc-categories .aa-cat-btn[data-cat="${sc.category}"]`);
        if (catBtn) { catBtn.classList.add('sel'); _scSelectedCat = sc.category; }
      }
    }
  } else {
    titleEl.textContent = '📅 Add Schedule';
    saveBtnEl.textContent = '💾 Save Schedule';
    // default to today
    document.getElementById('sc-date').value = new Date().toISOString().split('T')[0];
    _scSet12('from', '08:00');
    _scSet12('to', '09:00');
  }
  _scUpdateDuration();
  modal.style.display = 'flex';
}

function closeScheduleModal() {
  document.getElementById('schedule-modal').style.display = 'none';
}

/* ── Save / Update ── */
function saveSchedule() {
  const customText = document.getElementById('sc-custom-activity').value.trim();
  const category = customText || _scSelectedCat;
  const date = document.getElementById('sc-date').value;
  const tasks = _scTasks.map(t => ({...t}));  // snapshot
  const msgEl = document.getElementById('sc-msg');

  if (!category) {
    msgEl.textContent = 'Please select an activity or enter a custom one.';
    msgEl.className = 'auth-msg err';
    return;
  }
  if (!date) {
    msgEl.textContent = 'Please choose a date.';
    msgEl.className = 'auth-msg err';
    return;
  }

  const from = _scGet24('from');
  const to   = _scGet24('to');
  const [h1,m1] = from.split(':').map(Number);
  const [h2,m2] = to.split(':').map(Number);
  let durationMins = (h2*60+m2) - (h1*60+m1);
  if (durationMins < 0) durationMins += 1440;
  const durationHrs = +(durationMins / 60).toFixed(4);

  const icon = SC_CAT_ICONS[category] || '📌';
  const habitId = LF_CAT_HABIT_MAP[category] || category.toLowerCase().replace(/\s+/g, '-');
  const fromDisp = _scFmt12(from);
  const toDisp   = _scFmt12(to);

  const ud = getUserData();
  if (!ud.schedules) ud.schedules = [];

  if (_scEditId) {
    // Update existing schedule entry
    const idx = ud.schedules.findIndex(s => s.id === _scEditId);
    if (idx !== -1) {
      ud.schedules[idx] = { ...ud.schedules[idx], category, date, fromTime: from, toTime: to, durationMins, tasks, updatedAt: new Date().toISOString() };
    }
    // Update matching log entry
    const logIdx = ud.logs.findIndex(l => l.scheduleId === _scEditId);
    if (logIdx !== -1) {
      ud.logs[logIdx] = {
        ...ud.logs[logIdx],
        habitId, habitName: category, habitIcon: icon,
        date, duration: durationHrs, unit: 'hrs',
        startTime: fromDisp, endTime: toDisp,
        note: `Schedule · ${fromDisp} → ${toDisp}`
      };
    }
    msgEl.textContent = '✅ Schedule updated!';
  } else {
    // New schedule entry
    const schedId = Date.now();
    const entry = {
      id: schedId,
      category,
      date,
      fromTime: from,
      toTime: to,
      durationMins,
      tasks,
      createdAt: new Date().toISOString()
    };
    ud.schedules.push(entry);

    // Also push into logs so it appears in History and summary totals
    ud.logs.push({
      id: schedId,
      scheduleId: schedId,
      habitId,
      habitName: category,
      habitIcon: icon,
      date,
      duration: durationHrs,
      unit: 'hrs',
      startTime: fromDisp,
      endTime: toDisp,
      note: `Schedule · ${fromDisp} → ${toDisp}`,
      isSchedule: true
    });

    msgEl.textContent = '✅ Schedule saved!';
  }

  msgEl.className = 'auth-msg ok';
  saveUserData();
  renderTrackerSchedules();
  renderHistory();
  renderTrends();
  setTimeout(() => closeScheduleModal(), 900);
}

/* ── Delete ── */
function deleteSchedule(id) {
  if (!confirm('Remove this schedule?')) return;
  const ud = getUserData();
  ud.schedules = (ud.schedules || []).filter(s => s.id !== id);
  // Also remove the matching log entry
  ud.logs = ud.logs.filter(l => l.scheduleId !== id);
  saveUserData();
  renderTrackerSchedules();
  renderHistory();
  renderTrends();
}

/* ── Render ── */
function renderTrackerSchedules() {
  const ud = getUserData();
  const schedules = (ud && ud.schedules) ? [...ud.schedules] : [];
  const emptyState = document.getElementById('tracker-empty-state');
  const listWrap = document.getElementById('tracker-schedules-wrap');
  const listEl = document.getElementById('tracker-schedule-list');

  if (!schedules.length) {
    emptyState.style.display = 'flex';
    listWrap.style.display = 'none';
    return;
  }

  emptyState.style.display = 'none';
  listWrap.style.display = 'block';
  listEl.innerHTML = '';

  // Sort by date then time
  schedules.sort((a, b) => (a.date + a.fromTime).localeCompare(b.date + b.fromTime));

  // Group by date
  const groups = {};
  schedules.forEach(sc => {
    if (!groups[sc.date]) groups[sc.date] = [];
    groups[sc.date].push(sc);
  });

  const today = new Date().toISOString().split('T')[0];

  Object.keys(groups).sort().forEach(date => {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'schedule-date-group';

    const d = new Date(date + 'T00:00:00');
    const label = date === today ? 'Today'
      : date > today ? _formatDateLabel(d)
      : _formatDateLabel(d) + ' (past)';

    groupDiv.innerHTML = `<div class="schedule-date-group-label">${label}</div>`;

    groups[date].forEach(sc => {
      const icon = SC_CAT_ICONS[sc.category] || '📌';
      const fromDisp = _scFmt12(sc.fromTime);
      const toDisp   = _scFmt12(sc.toTime);
      const hrs = Math.floor(sc.durationMins/60);
      const mins = sc.durationMins % 60;
      const durStr = (hrs > 0 ? hrs+'h ' : '') + (mins > 0 ? mins+'m' : '');

      const badgeClass = date > today ? 'future' : date === today ? 'today' : 'past';
      const badgeText  = date > today ? '📆 Upcoming' : date === today ? '📍 Today' : '✔ Past';

      const card = document.createElement('div');
      card.className = 'schedule-card';
      card.dataset.id = sc.id;

      // Build tasks HTML
      let tasksHtml = '';
      const tasks = sc.tasks || [];
      if (tasks.length) {
        const done = tasks.filter(t => t.done).length;
        tasksHtml = `<div class="sc-card-checklist" id="card-tasks-${sc.id}">
          ${tasks.map((t,i) => `
            <div class="sc-card-task">
              <input type="checkbox" class="sc-card-task-cb" ${t.done?'checked':''} onchange="scToggleCardTask(${sc.id},${i},this)" title="Mark done">
              <span class="sc-card-task-label${t.done?' done':''}" id="task-lbl-${sc.id}-${i}">${_escHtml(t.text)}</span>
            </div>`).join('')}
          <span class="sc-checklist-count">✓ ${done}/${tasks.length} done</span>
        </div>`;
      }

      card.innerHTML = `
        <div class="schedule-card-top">
          <div class="schedule-card-icon">${icon}</div>
          <div class="schedule-card-info">
            <div class="schedule-card-cat">${sc.category}</div>
            <div class="schedule-card-date">
              <span class="schedule-date-badge ${badgeClass}">${badgeText}</span>
              <span>${_niceDate(date)}</span>
            </div>
            <div class="schedule-card-time">⏰ ${fromDisp} → ${toDisp} · ${durStr || '—'}</div>
            ${tasksHtml}
          </div>
        </div>
        <div class="schedule-card-actions">
          <button class="sc-edit-btn" onclick="openScheduleModal(${sc.id})">✏️ Edit</button>
          <button class="sc-delete-btn" onclick="deleteSchedule(${sc.id})" title="Remove">🗑</button>
        </div>`;
      groupDiv.appendChild(card);
    });

    listEl.appendChild(groupDiv);
  });

  /* ── Activity summary inside tracker ── */
  _renderTrackerSummary(listEl, ud);
}

function _renderTrackerSummary(container, ud) {
  if (!ud || !ud.logs) return;
  const allLogs = ud.logs.filter(l => !l.isQuickAlarm);
  if (!allLogs.length) return;

  function _fmtHrs(hrs) {
    if (hrs < 1/60) return '< 1m';
    const totalMins = Math.round(hrs * 60);
    if (totalMins < 60) return totalMins + 'm';
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return m > 0 ? h + 'h ' + m + 'm' : h + 'h';
  }

  const byActivity = {};
  allLogs.forEach(l => {
    const key = l.habitId || l.habitName;
    if (!byActivity[key]) {
      byActivity[key] = { name: l.habitName, icon: l.habitIcon || '📋', totalHrs: 0, sessions: 0 };
    }
    const hrs = l.unit === 'mins' ? l.duration / 60 : Number(l.duration) || 0;
    byActivity[key].totalHrs += hrs;
    byActivity[key].sessions += 1;
  });

  const entries = Object.values(byActivity).sort((a, b) => b.totalHrs - a.totalHrs);
  if (!entries.length) return;

  const section = document.createElement('div');
  section.className = 'hist-summary-section';
  section.innerHTML = `
    <div class="hist-summary-header">
      <span class="hist-summary-title">📊 Total by Activity</span>
      <span class="hist-summary-sub">All-time · across all logs</span>
    </div>
    <div class="hist-summary-grid">
      ${entries.map(e => `
        <div class="hist-summary-card">
          <div class="hist-summary-icon">${e.icon}</div>
          <div class="hist-summary-info">
            <div class="hist-summary-name">${e.name}</div>
            <div class="hist-summary-sessions">${e.sessions} session${e.sessions !== 1 ? 's' : ''}</div>
          </div>
          <div class="hist-summary-total">${_fmtHrs(e.totalHrs)}</div>
        </div>`).join('')}
    </div>`;
  container.appendChild(section);
}

function _niceDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric' });
}
function _formatDateLabel(d) {
  return d.toLocaleDateString(undefined, { weekday:'long', month:'long', day:'numeric' });
}

/* Patch showTab to render schedules when tracker is opened */
const _origShowTab = showTab;
showTab = function(t) {
  _origShowTab(t);
  if (t === 'tracker') renderTrackerSchedules();
};

/* Also hide/show FAB based on active tab */
const __origShowTab = showTab;
showTab = function(t) {
  __origShowTab(t);
  const fab = document.getElementById('fab-add');
  if (fab) fab.style.display = (t === 'tracker') ? 'none' : '';
};

/* On login, render schedules and hide FAB if on tracker */
const _origLaunchApp = launchApp;
// Patch launchApp to also init schedules
document.addEventListener('DOMContentLoaded', function() {
  // After app launches, renderTrackerSchedules is called via showTab override
  // Ensure fab is visible by default (not tracker tab)
  const fab = document.getElementById('fab-add');
  if (fab) fab.style.display = '';
});

// Close schedule modal on overlay click
document.addEventListener('DOMContentLoaded', function() {
  const overlay = document.getElementById('schedule-modal');
  if (overlay) {
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) closeScheduleModal();
    });
  }
});

/* ═══════════════════════════════════════
   PLAN-YOUR-DAY CHECKLIST (Schedule modal)
═══════════════════════════════════════ */
let _scTasks = [];   // [{text, done}]

function _scRenderChecklist() {
  const container = document.getElementById('sc-checklist');
  if (!container) return;
  container.innerHTML = '';
  if (!_scTasks.length) return;

  _scTasks.forEach((task, i) => {
    const row = document.createElement('div');
    row.className = 'sc-task-row';
    row.draggable = true;
    row.dataset.idx = i;
    row.innerHTML = `
      <input type="checkbox" class="sc-task-cb" ${task.done ? 'checked' : ''}
        onchange="_scToggleTask(${i}, this)" title="Mark done">
      <span class="sc-task-text${task.done ? ' done' : ''}" id="sc-task-text-${i}">${_escHtml(task.text)}</span>
      <button type="button" class="sc-task-del" onclick="_scDeleteTask(${i})" title="Remove">✕</button>`;
    container.appendChild(row);
  });
}

function _scToggleTask(i, cb) {
  _scTasks[i].done = cb.checked;
  const lbl = document.getElementById(`sc-task-text-${i}`);
  if (lbl) lbl.classList.toggle('done', cb.checked);
}

function _scDeleteTask(i) {
  _scTasks.splice(i, 1);
  _scRenderChecklist();
}

function scAddTask() {
  const inp = document.getElementById('sc-task-input');
  const text = inp.value.trim();
  if (!text) return;
  _scTasks.push({ text, done: false });
  inp.value = '';
  _scRenderChecklist();
  inp.focus();
}

function scHandleTaskKey(e) {
  if (e.key === 'Enter') { e.preventDefault(); scAddTask(); }
}

function scQuickAdd(btn) {
  const text = btn.textContent.trim();
  if (_scTasks.find(t => t.text === text)) return; // no dupes
  _scTasks.push({ text, done: false });
  _scRenderChecklist();
}

/* Toggle task done state directly on the schedule card (without opening modal) */
function scToggleCardTask(scheduleId, taskIdx, cb) {
  const ud = getUserData();
  if (!ud || !ud.schedules) return;
  const sc = ud.schedules.find(s => s.id === scheduleId);
  if (!sc || !sc.tasks || !sc.tasks[taskIdx]) return;
  sc.tasks[taskIdx].done = cb.checked;
  saveUserData();

  // Update label style + count inline without full re-render
  const lbl = document.getElementById(`task-lbl-${scheduleId}-${taskIdx}`);
  if (lbl) lbl.classList.toggle('done', cb.checked);

  // Update the "X/Y done" count badge
  const wrap = document.getElementById(`card-tasks-${scheduleId}`);
  if (wrap) {
    const countEl = wrap.querySelector('.sc-checklist-count');
    if (countEl) {
      const done = sc.tasks.filter(t => t.done).length;
      countEl.textContent = `✓ ${done}/${sc.tasks.length} done`;
    }
  }
}

function _escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
/* ═══════════════════════════════════════
   SINGLE ALARM
═══════════════════════════════════════ */


let _saSound = 'bell';
let _saTimers = [];  // {id, timeout, time, label}

function saSetAmPm(val) {
  document.getElementById('sa-am').classList.toggle('sel', val === 'AM');
  document.getElementById('sa-pm').classList.toggle('sel', val === 'PM');
}

function saSelectSound(btn) {
  document.querySelectorAll('#tab-tools .sound-btn').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');
  _saSound = btn.dataset.sound;
  playSound(_saSound, null);
}

function _saGetTime() {
  const h = parseInt(document.getElementById('sa-h').value) || 12;
  const m = parseInt(document.getElementById('sa-m').value) || 0;
  const isAM = document.getElementById('sa-am').classList.contains('sel');
  return to24(h, m, isAM ? 'AM' : 'PM');
}

function setSingleAlarm() {
  const time24 = _saGetTime();
  const label = document.getElementById('sa-label').value.trim() || 'Alarm';
  const msg = document.getElementById('sa-msg');
  const now = new Date();
  const [h, m] = time24.split(':').map(Number);
  const alarmTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
  let delay = alarmTime - now;
  if (delay <= 0) {
    msg.textContent = '⚠️ That time has already passed today.';
    msg.className = 'auth-msg err';
    return;
  }

  const id = Date.now();
  const f = fmt12(time24);
  const displayTime = `${f.h}:${f.m} ${f.ampm}`;
  const sound = _saSound;

  const t = setTimeout(() => {
    playSound(sound, null);
    document.getElementById('alarm-modal-icon').textContent = '⏰';
    document.getElementById('alarm-modal-title').textContent = label;
    document.getElementById('alarm-modal-sub').textContent = `Single alarm · ${displayTime}`;
    document.getElementById('alarm-modal').style.display = 'flex';
    if (Notification.permission === 'granted') {
      new Notification(`⏰ ${label}`, { body: displayTime });
    }
    // Remove from list
    _saTimers = _saTimers.filter(a => a.id !== id);
    _saRenderList();
  }, delay);

  _saTimers.push({ id, t, displayTime, label, sound });
  _saRenderList();

  msg.textContent = `✅ Alarm set for ${displayTime}`;
  msg.className = 'auth-msg ok';
  setTimeout(() => { msg.textContent = ''; msg.className = 'auth-msg'; }, 3000);
}

function _saRenderList() {
  const list = document.getElementById('sa-list');
  if (!list) return;
  if (!_saTimers.length) { list.innerHTML = ''; return; }
  list.innerHTML = `<div style="font-size:11px;font-weight:600;color:var(--hint);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">Active alarms</div>` +
    _saTimers.map(a => `
      <div class="sa-alarm-row">
        <span class="sa-alarm-time">⏰ ${a.displayTime}</span>
        <span class="sa-alarm-label">${_escHtml(a.label)}</span>
        <button class="sa-cancel-btn" onclick="saCancelAlarm(${a.id})">✕</button>
      </div>`).join('');
}

function saCancelAlarm(id) {
  const entry = _saTimers.find(a => a.id === id);
  if (entry) clearTimeout(entry.t);
  _saTimers = _saTimers.filter(a => a.id !== id);
  _saRenderList();
}

/* ═══════════════════════════════════════
   STOPWATCH
═══════════════════════════════════════ */
/* ═══════════════════════════════════════
   STOPWATCH
   Paste this block anywhere in spttool.js
   (replace the old STOPWATCH section entirely)
═══════════════════════════════════════ */
let _swRunning  = false;
let _swStartTime = 0;
let _swElapsed  = 0;      // ms accumulated before last pause
let _swInterval = null;
let _swLaps     = [];
let _swCat      = '';
let _swFinalMs  = 0;      // saved when stopped, for logging

/* ── Start / Pause / Resume ── */
function swStartStop() {
  const btn      = document.getElementById('sw-start-btn');
  const stopBtn  = document.getElementById('sw-stop-btn');
  const resetBtn = document.getElementById('sw-reset-btn');

  if (!_swRunning) {
    // ▶ Start (or Resume)
    _swStartTime = Date.now();
    _swInterval  = setInterval(_swTick, 100);
    _swRunning   = true;
    btn.textContent = '⏸ Pause';
    btn.classList.remove('start'); btn.classList.add('pause');
    stopBtn.disabled  = false;
    resetBtn.disabled = false;
    document.getElementById('sw-log-section').style.display = 'none';
    document.getElementById('sw-log-msg').textContent = '';
  } else {
    // ⏸ Pause
    _swElapsed += Date.now() - _swStartTime;
    clearInterval(_swInterval);
    _swRunning  = false;
    _swFinalMs  = _swElapsed;
    btn.textContent = '▶ Resume';
    btn.classList.remove('pause'); btn.classList.add('start');
  }
}

/* ── Stop — freezes timer, shows activity picker ── */
function swStop() {
  if (_swRunning) {
    _swElapsed += Date.now() - _swStartTime;
    clearInterval(_swInterval);
    _swRunning = false;
  }
  _swFinalMs = _swElapsed;

  // Reset start button to ▶ Start
  const btn = document.getElementById('sw-start-btn');
  btn.textContent = '▶ Start';
  btn.classList.remove('pause'); btn.classList.add('start');

  // Disable Stop, keep Reset enabled
  document.getElementById('sw-stop-btn').disabled = true;

  // Show activity picker with recorded time
  document.getElementById('sw-log-section').style.display = 'block';
  const timedEl = document.getElementById('sw-timed-display');
  if (timedEl) timedEl.textContent = `⏱ Time recorded: ${_swFmt(_swFinalMs)}`;

  // Clear previous selection
  document.getElementById('sw-log-msg').textContent = '';
  document.querySelectorAll('#sw-categories .sw-act-btn').forEach(b => b.classList.remove('sel'));
  _swCat = '';
  const customInput = document.getElementById('sw-custom-activity');
  if (customInput) customInput.value = '';
}

/* ── Reset — clears everything back to zero ── */
function swReset() {
  clearInterval(_swInterval);
  _swRunning   = false;
  _swElapsed   = 0;
  _swStartTime = 0;
  _swFinalMs   = 0;
  _swLaps      = [];
  _swCat       = '';

  document.getElementById('sw-display').textContent = '00:00:00';

  const btn = document.getElementById('sw-start-btn');
  btn.textContent = '▶ Start';
  btn.classList.remove('pause'); btn.classList.add('start');

  const stopBtn = document.getElementById('sw-stop-btn');
  if (stopBtn) stopBtn.disabled = true;
  document.getElementById('sw-reset-btn').disabled = true;

  document.getElementById('sw-log-section').style.display = 'none';
  document.getElementById('sw-laps').innerHTML = '';
  document.getElementById('sw-log-msg').textContent = '';
  document.querySelectorAll('#sw-categories .sw-act-btn').forEach(b => b.classList.remove('sel'));
  const customInput = document.getElementById('sw-custom-activity');
  if (customInput) customInput.value = '';
}

/* ── Internal tick ── */
function _swTick() {
  const total = _swElapsed + (Date.now() - _swStartTime);
  document.getElementById('sw-display').textContent = _swFmt(total);
}

/* ── Time formatter  HH:MM:SS ── */
function _swFmt(ms) {
  const s   = Math.floor(ms / 1000);
  const h   = Math.floor(s / 3600);
  const m   = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

/* ── Activity selection ── */
function swSelectCat(btn) {
  document.querySelectorAll('#sw-categories .sw-act-btn').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');
  _swCat = btn.dataset.cat;
  const customInput = document.getElementById('sw-custom-activity');
  if (customInput) customInput.value = '';
}

function swClearCatIfTyping() {
  _swCat = '';
  document.querySelectorAll('#sw-categories .sw-act-btn').forEach(b => b.classList.remove('sel'));
}

/* ── Save to History ── */
function swLogTime() {
  const customText = (document.getElementById('sc-custom-activity')?.value || '').trim();
  const cat = customText || _swCat;
  if (!cat) {
    const msg = document.getElementById('sw-log-msg');
    msg.textContent = 'Please select an activity or type one.';
    msg.className = 'auth-msg err';
    return;
  }
  const ud = getUserData();
  if (!ud) return;

  const ms  = _swFinalMs || _swElapsed;
  const hrs = +((ms / 60000) / 60).toFixed(4);

  const catIcons = {
    'Activity':'🎯','Sleep':'🌙','Work':'💻','Exercise':'🏃','Studies':'📚',
    'Meals':'🍽','Screen Use':'📱','Reading':'📖','Meditation':'🧘'
  };
  const icon    = customText ? '✍' : (catIcons[cat] || '⏱');
  const habitId = (typeof LF_CAT_HABIT_MAP !== 'undefined' && LF_CAT_HABIT_MAP[cat])
                  || cat.toLowerCase().replace(/\s+/g, '-');

  ud.logs.push({
    id:         Date.now(),
    habitId,
    habitName:  cat,
    habitIcon:  icon,
    date:       new Date().toISOString().split('T')[0],
    duration:   hrs,
    unit:       'hrs',
    startTime:  '',
    endTime:    '',
    note:       `Stopwatch · ${_swFmt(ms)}`
  });

  saveUserData();
  if (typeof renderHistory         === 'function') renderHistory();
  if (typeof renderCalendar        === 'function') renderCalendar();
  if (typeof renderCalendar2       === 'function') renderCalendar2();
  if (typeof renderTrends          === 'function') renderTrends();
  if (typeof renderTodayTracker    === 'function') renderTodayTracker();
  if (typeof renderTrackerSchedules === 'function') renderTrackerSchedules();

  const msg = document.getElementById('sw-log-msg');
  msg.textContent = `✅ Saved ${_swFmt(ms)} of ${cat} to History!`;
  msg.className = 'auth-msg ok';
}

/* ── Lap (kept for internal use, not shown in UI) ── */
function swLap() {
  const total = _swElapsed + (Date.now() - _swStartTime);
  _swLaps.push(total);
  _swRenderLaps();
}
function _swRenderLaps() {
  const el = document.getElementById('sw-laps');
  if (!el) return;
  let prev = 0;
  el.innerHTML = _swLaps.map((t, i) => {
    const split = t - prev; prev = t;
    return `<div class="sw-lap-row">
      <span class="sw-lap-num">Lap ${i+1}</span>
      <span class="sw-lap-split">${_swFmt(split)}</span>
      <span class="sw-lap-total">${_swFmt(t)}</span>
    </div>`;
  }).join('');
}

