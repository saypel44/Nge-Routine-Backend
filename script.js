/* ── Bhutan Lifestyle Study · script.js ── */

let visitorName = '';


// ── Greeting helper ────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}


// ── Per-page personalised greeting cards ───────────────────────────────────

function setGreetingCards(name, greet) {
  const cards = [
    {
      id:   'findings-greeting-text',
      text: `Here's a breakdown of the seven key findings from the study from respondent distribution to market readiness for wellness tools.`,
    },
    {
      id:   'market-greeting-text',
      text: `This section examines whether Bhutan has a viable market for digital wellness tools — and what the data says.`,
    },
    {
      id:   'files-greeting-text',
      text: `Here are the files related to the project. Click "Preview" to view the Tableau Public story and the report directly on this page, or click "Download" to access the files.`,
    },
    {
      id:   'contact-greeting-text',
      text: `Have a question, feedback, or want to collaborate? Reach out through any of the channels below.`,
    }
  ];

  cards.forEach(({ id, text }) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  });
}


// ── Pages that are live (others show "Coming Soon") ───────────────────────

const LIVE_PAGES = ['home', 'about', 'findings', 'market', 'tableau', 'report', 'products', 'contact'];


// ── Navigation ─────────────────────────────────────────────────────────────

function navigateTo(pageId, btn) {
  if (!LIVE_PAGES.includes(pageId)) {
    showComingSoon(pageId);
    return;
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const target = document.getElementById('page-' + pageId);
  if (target) {
    target.classList.add('active');
    target.style.animation = 'none';
    target.offsetHeight; // reflow
    target.style.animation = '';
  }

  if (btn) btn.classList.add('active');

  document.querySelectorAll('.bottom-nav-item').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-page') === pageId);
  });

  closeMobileSidebar();

  if (pageId === 'market') setTimeout(animateMarketBars, 200);

  window.scrollTo({ top: 0, behavior: 'smooth' });
}


// ── Show home section (tabs) ───────────────────────────────────────────────

function showHomeSection(sectionId, btn) {
  document.querySelectorAll('.home-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.home-tab').forEach(b => b.classList.remove('active'));

  const target = document.getElementById('home-' + sectionId);
  if (target) target.classList.add('active');
  if (btn) btn.classList.add('active');
}

// Hamburger
function showAboutFirst(button) {
  showHomeSection('about', button);
  const otherTabs = document.getElementById("otherHomeTabs");
  if (otherTabs) otherTabs.style.display = "flex";
}


// ── Animate market bar fills ───────────────────────────────────────────────

function animateMarketBars() {
  document.querySelectorAll('.mkt-card-bar-fill[data-target]').forEach(bar => {
    const target = parseFloat(bar.getAttribute('data-target')) || 0;
    bar.style.transition = 'width 1s cubic-bezier(0.22,1,0.36,1)';
    bar.style.width = target + '%';
  });

  document.querySelectorAll('.fc-bar-fill[style*="width"]').forEach(bar => {
    const w = bar.style.width;
    bar.style.width = '0';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        bar.style.transition = 'width 1s cubic-bezier(0.22,1,0.36,1)';
        bar.style.width = w;
      });
    });
  });
}


// ── Scroll to a specific finding card ─────────────────────────────────────

function scrollToFinding(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - 80;
  window.scrollTo({ top, behavior: 'smooth' });
}


// ── Toggle PDF/preview viewer ──────────────────────────────────────────────

function togglePdfReader(viewerId, btn) {
  const viewer = document.getElementById(viewerId);
  if (!viewer) return;

  const isOpen = viewer.style.display !== 'none';
  viewer.style.display = isOpen ? 'none' : 'block';

  if (btn) btn.classList.toggle('prc-toggle-btn--active', !isOpen);
}


// ── Toggle story PDF (products page) ──────────────────────────────────────

function toggleStoryPdf(btn) {
  const viewer = document.getElementById("story-pdf-viewer");
  if (!viewer) return;

  const isOpen = viewer.style.display === "block";
  viewer.style.display = isOpen ? "none" : "block";
  btn.innerText = isOpen ? "↓ Read as PDF" : "✖ Close PDF";
  btn.classList.toggle("prc-toggle-btn--active", !isOpen);

  if (!isOpen) viewer.scrollIntoView({ behavior: "smooth" });
}


/* ═══════════════════════════════════════
   CHECK-IN LOGIC
═══════════════════════════════════════ */
const likertQs=[
  {id:'l1',text:'I can fall asleep easily.'},
  {id:'l2',text:'I sleep well most nights.'},
  {id:'l3',text:'I wake up feeling rested.'},
  {id:'l4',text:'I feel sleepy during the day.'},
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
  return Math.round((((s.l1+s.l2+s.l3+s.l5)/4)+(6-s.l4))/2*10);
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
    (lAnswers.l4==='Not really'||lAnswers.l4==='No, never')&&
    (lAnswers.l1==='Yes, always'||lAnswers.l1==='Most of the time');

  const overwork=answers.workhours==='9 or more hours';
  const longsleep=answers.sleep==='9 or more hours';
  const highPhone=answers.phonetime==='2–3 hours'||answers.phonetime==='more than 3 hours';
  const lateBed=answers.bedtime==='after 12 AM'||answers.bedtime==='11 PM–12 AM';

  if(feelGoodAll&&overwork) {
    contra.push({
      t:'🔮 You feel great — but your workload tells another story',
      b:[
        `<strong>What we see:</strong> You report feeling well-rested and energised — but you're also working ${answers.workhours} a day. That's a mismatch worth watching.`,
        `<strong>Why it matters:</strong> Sustained overwork builds cumulative stress that doesn't always show up immediately. Many people feel fine until they suddenly crash.`,
        `<strong>Watch for:</strong> Increased irritability, trouble unwinding, relying on coffee to get started. These are early signals. Even if you feel okay now, scheduling real rest days is protective.`
      ]
    });
  }
  if(feelGoodAll&&longsleep) {
    contra.push({
      t:'🔮 You feel energised — yet you sleep 9+ hours',
      b:[
        `<strong>What we see:</strong> You report high energy and good rest, but you sleep ${answers.sleep} every night.`,
        `<strong>Why it matters:</strong> Consistently sleeping 9+ hours when you feel fine can sometimes indicate hidden fatigue, blood sugar fluctuations, or low physical activity masking tiredness.`,
        `<strong>Try:</strong> Experiment with a 7–8 hour window for 2 weeks. If you feel equally good, your body was just over-sleeping. If you feel worse, your sleep need is genuinely higher — that's useful to know.`
      ]
    });
  }
  if(feelGoodAll&&highPhone) {
    contra.push({
      t:`🔮 You feel rested — but ${answers.phonetime} of screens before bed is risky`,
      b:[
        `<strong>What we see:</strong> You say you sleep well and feel rested, but you use your phone ${answers.phonetime} before sleeping.`,
        `<strong>Why it matters:</strong> Screen light suppresses melatonin even when you don't consciously notice it. You might be getting away with it now — but this habit gradually erodes sleep depth.`,
        `<strong>Try:</strong> One week with phone away 30 min before bed. Many people are surprised how much deeper they sleep once they stop. Your current "feeling good" could become "feeling great".`
      ]
    });
  }
  if(feelGoodAll&&lateBed) {
    contra.push({
      t:`🔮 Late bedtime + feeling fine — a fragile balance`,
      b:[
        `<strong>What we see:</strong> You go to bed ${answers.bedtime} and report feeling rested and energised.`,
        `<strong>Why it matters:</strong> Staying up late works for some people's natural chronotype. But combined with work pressures or phone use, the margin disappears quickly.`,
        `<strong>Keep monitoring:</strong> If your energy dips during seasons of higher stress, moving your bedtime 30–45 min earlier is the fastest fix.`
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
  const daySleepy=lAnswers.l4==='Yes, always'||lAnswers.l4==='Most of the time';
  const hardToSleep=lAnswers.l1==='Not really'||lAnswers.l1==='No, never';
  const shortSleep=answers.sleep==='0–4 hours'||answers.sleep==='5–6 hours';
  const goodHours=answers.sleep==='7–8 hours'||answers.sleep==='9 or more hours';
  const outcomeGood=feelRested&&feelEnergetic&&!daySleepy;
  const outcomePoor=poorRested||lowEnergy||daySleepy;

  let intro='',emoji='✨';
  if(outcomeGood){intro="Your body is doing well — you feel rested and have good energy. Keep up what you're doing!";emoji='🌟';}
  else if(outcomePoor&&goodHours){intro=`You sleep ${answers.sleep} but still don't feel your best. Duration isn't everything — a consistent bedtime and less phone time before bed can help a lot.`;emoji='⚠️';}
  else if(outcomePoor&&shortSleep){intro=`You sleep ${answers.sleep} and your energy shows it. Small changes to your bedtime routine can make a big difference very quickly.`;emoji='💤';}
  else{intro='Some things are going well and some could improve. The tips below are based on how you actually feel.';emoji='🔍';}

  const recs=[];
  if(outcomeGood&&late) recs.push({l:'',t:'✅ You feel good — your routine is working',b:[`<strong>What's happening:</strong> You go to bed ${answers.bedtime} and your body has adapted — you feel rested and energised.`,`<strong>Why it works:</strong> A consistent bedtime, even a late one, beats an irregular schedule.`,`<strong>Keep doing:</strong> Same bedtime every day including weekends.`]});
  else if(outcomeGood) recs.push({l:'',t:'✅ Your habits are working — keep it up',b:[`<strong>What's happening:</strong> You wake up rested and have good energy.`,`<strong>Keep doing:</strong> Consistent bedtime every night, even weekends. Check in again in a few weeks.`]});
  if(outcomePoor&&goodHours) recs.push({l:'warn',t:'⚠️ Enough hours but still tired',b:[`<strong>What's happening:</strong> You sleep ${answers.sleep} but still wake up drained.`,`<strong>Why:</strong> Phone use, irregular timing, or stress reduce sleep quality even with enough hours.`,`<strong>Try:</strong> Phone away 30–60 min before bed. Same wake time every day. Darker, quieter room.`]});
  if(outcomePoor&&shortSleep) recs.push({l:'bad',t:'🔴 Not enough sleep — your body feels it',b:[`<strong>What's happening:</strong> You sleep ${answers.sleep} and feel tired and low on energy — directly linked.`,`<strong>Why:</strong> Your body needs 7–8 hours to rest and repair.`,`<strong>Try:</strong> Go to bed 15–20 min earlier this week. No caffeine after 2 pm. No phone in bed.`]});
  if(hardToSleep) recs.push({l:'warn',t:'⚠️ Hard to fall asleep',b:[`<strong>What's happening:</strong> Your mind stays active when you try to sleep.`,`<strong>Try:</strong> 30 minutes of calm before bed — no phone, dim lights, light reading. Same wake time every morning.`]});
  if(daySleepy) recs.push({l:(daySleepy&&poorRested)?'bad':'warn',t:(daySleepy&&poorRested)?'🔴 Very tired during the day':'⚠️ Sleepy during the day',b:[`<strong>What's happening:</strong> You feel sleepy through the day — your night sleep isn't fully refreshing you.`,`<strong>Try:</strong> Same wake time every day. A 10–20 min nap before 3 pm can help. No phone for the last 30 min before bed.`]});
  if(pr>=2&&outcomePoor) recs.push({l:'warn',t:'⚠️ Phone use before bed is hurting your sleep',b:[`<strong>What's happening:</strong> You use your phone ${answers.phonetime} before sleeping — these are connected.`,`<strong>Why:</strong> Screens signal your brain it's still daytime, reducing deep sleep.`,`<strong>Try:</strong> Phone away 30 min before bed. Replace with reading or gentle stretching.`]});
  if(overwork&&outcomePoor) recs.push({l:'bad',t:'🔴 Too many work hours is draining you',b:[`<strong>What's happening:</strong> You work ${answers.workhours} a day and feel drained.`,`<strong>Try:</strong> A short walk after work to decompress. Stop all work at least 1 hour before bed.`]});
  if(sedentary&&lowEnergy) recs.push({l:'',t:'🪑 Sitting all day could be making you sluggish',b:[`<strong>Why:</strong> Long sitting slows circulation, making you feel heavy and unfocused.`,`<strong>Try:</strong> 2-minute movement break every hour. A short walk after lunch.`]});
  if(late&&outcomePoor) recs.push({l:'bad',t:'🔴 Very late bedtime is reducing sleep quality',b:[`<strong>Why:</strong> Your deepest sleep happens earlier in the night.`,`<strong>Try:</strong> Move your bedtime 15 min earlier each week. Aim for 11 pm as a first goal.`]});

  // Contradictions
  const contras=detectContradictions();
  const contraHTML=contras.map(c=>`<div class="rec contra"><h4>${c.t}</h4><ul>${c.b.map(b=>`<li>${b}</li>`).join('')}</ul></div>`).join('');

  if(recs.length===0&&contras.length===0) recs.push({l:'',t:'✅ Everything looks good',b:[`<strong>What's happening:</strong> Your habits and how you feel are both in good shape.`,`<strong>Keep doing:</strong> Same bedtime every day. Check in again in a few weeks.`]});

  rd.innerHTML=`
    <div class="res-hero">
      <div class="res-emoji">${emoji}</div>
      <h3>Here is what we found…</h3>
      <p>${intro}</p>
    </div>
    <div class="stat-grid">
      <div class="stat"><div class="stat-val">${answers.workhours.replace(' hours','')}</div><div class="stat-sub">Work / day</div></div>
      <div class="stat"><div class="stat-val">${answers.sleep.replace(' hours','')}</div><div class="stat-sub">Sleep / night</div></div>
      <div class="stat"><div class="stat-val">${sc}<span style="font-size:12px;font-weight:400">/50</span></div><div class="stat-sub">Sleep score</div></div>
      <div class="stat"><div class="stat-val" style="font-size:13px">${answers.bedtime}</div><div class="stat-sub">Bedtime</div></div>
    </div>
    ${contras.length>0?`<p class="sec-lbl">⚠️ Contradictions spotted</p>${contraHTML}`:''}
    <p class="sec-lbl">Tips just for you</p>
    ${recs.map(r=>`<div class="rec ${r.l}"><h4>${r.t}</h4><ul>${r.b.map(b=>`<li>${b}</li>`).join('')}</ul></div>`).join('')}
    <button type="button" id="restart-btn" onclick="restartForm()">↩ Take the quiz again</button>
  `;
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


// ── Mobile sidebar toggle ──────────────────────────────────────────────────

function toggleMobileSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!sidebar) return;

  if (sidebar.classList.contains('open')) {
    closeMobileSidebar();
  } else {
    sidebar.classList.add('open');
    if (backdrop) backdrop.classList.add('visible');
    document.body.style.overflow = 'hidden';
  }
}

function closeMobileSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (sidebar)  sidebar.classList.remove('open');
  if (backdrop) backdrop.classList.remove('visible');
  document.body.style.overflow = '';
}


// ── Auto-load on startup ───────────────────────────────────────────────────

function autoLoadApp() {
  visitorName = 'Guest';

  const greet = getGreeting();

  const greetingEl = document.getElementById('greeting-text');
  if (greetingEl) greetingEl.innerHTML = `${greet}, welcome to SomPel Tech 2026.`;

  setGreetingCards(visitorName, greet);

  navigateTo('home', document.querySelector('.nav-item[data-page="home"]'));

  setTimeout(animateMarketBars, 600);
}


// ── Sync bottom-nav active state ──────────────────────────────────────────

function syncBottomNav(btn) {
  document.querySelectorAll('.bottom-nav button').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}


// ── Sign-out stub ─────────────────────────────────────────────────────────

function doSignOut() {
  if (confirm('Sign out? This will reload the page.')) location.reload();
}


// ── DOMContentLoaded ───────────────────────────────────────────────────────

// Make scroll event listeners passive for better performance
document.addEventListener('touchstart', () => {}, { passive: true });
document.addEventListener('wheel', () => {}, { passive: true });

document.addEventListener('DOMContentLoaded', () => {
  autoLoadApp();

  const linkLike = document.querySelector(".link-like");
  if (linkLike) {
    linkLike.addEventListener("click", () => navigateTo("products"));
  }

  document.querySelectorAll('.sidebar .nav-item').forEach(item => {
    item.addEventListener('click', () => {
      if (window.innerWidth <= 768) closeMobileSidebar();
    });
  });
});