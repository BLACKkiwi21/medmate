/* ═══════════════════════════════════════════════════════════════════
   MedMate v2.0 – Application Logic
   ═══════════════════════════════════════════════════════════════════ */

let FB = null;
let currentUser = null;
let userCode = '';
let meds = [], doses = [], friends = [];
let medsUnsub = null, dosesUnsub = null;
let curMed = null, capData = null;
let isSignUp = false;
let curScheduledTime = '';
let monitoredPeople = {};
let currentLang = localStorage.getItem('mm_lang') || 'en';

// ── Firebase Ready ─────────────────────────────────────────────────────────────
window.addEventListener('fbready', () => {
  FB = window._fb;
  document.getElementById('auth-loading').style.display = 'flex';
  document.getElementById('auth-box').style.display = 'none';

  FB.onAuthStateChanged(FB.auth, user => {
    document.getElementById('auth-loading').style.display = 'none';
    if (user) {
      currentUser = user;
      saveAccountToDevice(user);
      document.getElementById('auth-screen').style.display = 'none';
      document.getElementById('app-screen').style.display = 'block';
      loadUserProfile();
      subscribeToMeds();
      subscribeToDoses();
      loadFriends();
      scheduleReminders();
      listenForNudges();
      checkOnboarding();
      setTimeout(checkRefillAlerts, 3000);
      setTimeout(loadSavedMonitors, 1000);
    } else {
      currentUser = null;
      document.getElementById('auth-box').style.display = 'block';
      document.getElementById('auth-screen').style.display = 'flex';
      document.getElementById('app-screen').style.display = 'none';
      renderSavedAccounts();
      if (medsUnsub) medsUnsub();
      if (dosesUnsub) dosesUnsub();
    }
  });
});

// ── Saved Accounts ─────────────────────────────────────────────────────────────
function getSavedAccounts() {
  try { return JSON.parse(localStorage.getItem('mm_accounts') || '[]'); } catch(e) { return []; }
}
function saveAccountToDevice(user) {
  const accounts = getSavedAccounts();
  const existing = accounts.findIndex(a => a.email === user.email);
  const entry = { email: user.email, name: user.displayName || user.email.split('@')[0], uid: user.uid, lastUsed: Date.now() };
  if (existing >= 0) accounts[existing] = entry; else accounts.push(entry);
  localStorage.setItem('mm_accounts', JSON.stringify(accounts));
}
function removeAccountFromDevice(email) {
  const accounts = getSavedAccounts().filter(a => a.email !== email);
  localStorage.setItem('mm_accounts', JSON.stringify(accounts));
  renderSavedAccounts();
}
function renderSavedAccounts() {
  const accounts = getSavedAccounts();
  const el = document.getElementById('saved-accounts');
  const divider = document.getElementById('accounts-divider');
  if (!accounts.length) { if(el) el.innerHTML=''; if(divider) divider.style.display='none'; return; }
  if(divider) divider.style.display='block';
  if(!el) return;
  el.innerHTML = '<div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Saved on this device</div>' +
    accounts.sort((a,b)=>b.lastUsed-a.lastUsed).map(a => {
      const ini = a.name.split(' ').map(w=>w[0]).join('').toUpperCase().substr(0,2);
      return '<div style="display:flex;align-items:center;gap:10px;padding:12px 14px;border:1.5px solid rgba(51,65,85,0.5);border-radius:12px;margin-bottom:8px;cursor:pointer;background:rgba(15,23,42,0.3);transition:all .2s" onmouseover="this.style.borderColor=\'#38bdf8\'" onmouseout="this.style.borderColor=\'rgba(51,65,85,0.5)\'" onclick="quickLogin(\'' + a.email + '\')">' +
        '<div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#0ea5e9,#6366f1);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0">' + ini + '</div>' +
        '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;color:#f1f5f9">' + a.name + '</div><div style="font-size:11px;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + a.email + '</div></div>' +
        '<div style="display:flex;align-items:center;gap:6px"><span style="font-size:11px;color:#38bdf8;font-weight:600">Use →</span>' +
        '<span onclick="event.stopPropagation();removeAccountFromDevice(\'' + a.email + '\')" style="font-size:18px;color:#94a3b8;cursor:pointer;line-height:1" onmouseover="this.style.color=\'#ef4444\'" onmouseout="this.style.color=\'#94a3b8\'">×</span></div></div>';
    }).join('');
}
window.quickLogin = function(email) {
  document.getElementById('a-email').value = email;
  document.getElementById('a-pass').value = '';
  document.getElementById('a-pass').focus();
  const err = document.getElementById('auth-err');
  err.textContent = 'Enter password for ' + email;
  err.style.cssText = 'display:block;background:rgba(14,165,233,0.1);color:#38bdf8;border:1px solid rgba(14,165,233,0.3);border-radius:10px;padding:10px 14px;font-size:13px;margin-bottom:14px';
};
window.removeAccountFromDevice = removeAccountFromDevice;

// ── Auth ───────────────────────────────────────────────────────────────────────
window.toggleAuth = function() {
  isSignUp = !isSignUp;
  document.getElementById('auth-subtitle').textContent = isSignUp ? 'Create a new account' : 'Sign in to your account';
  document.getElementById('auth-btn').textContent = isSignUp ? 'Create account' : 'Sign in';
  document.getElementById('auth-toggle').innerHTML = isSignUp
    ? 'Already have an account? <span onclick="toggleAuth()">Sign in</span>'
    : 'No account? <span onclick="toggleAuth()">Create one</span>';
  document.getElementById('name-wrap').style.display = isSignUp ? 'block' : 'none';
  document.getElementById('auth-err').style.display = 'none';
};

window.doAuth = async function() {
  if (!FB) { showAuthErr('Still loading — please wait.'); return; }
  const email = document.getElementById('a-email').value.trim();
  const pass  = document.getElementById('a-pass').value;
  const name  = document.getElementById('a-name').value.trim();
  if (!email || !pass) { showAuthErr('Please enter your email and password.'); return; }
  const btn = document.getElementById('auth-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Signing in...';
  try {
    if (FB.auth.currentUser && FB.auth.currentUser.email !== email) {
      await FB.signOut(FB.auth);
    }
    if (isSignUp) {
      if (!name) { showAuthErr('Please enter your name.'); resetBtn(); return; }
      const cred = await FB.createUserWithEmailAndPassword(FB.auth, email, pass);
      await FB.updateProfile(cred.user, { displayName: name });
      const code = genCode();
      await FB.setDoc(FB.doc(FB.db,'users',cred.user.uid), {
        name, email, code, uid: cred.user.uid, monitors: [],
        createdAt: FB.serverTimestamp()
      });
    } else {
      await FB.signInWithEmailAndPassword(FB.auth, email, pass);
    }
  } catch(e) {
    showAuthErr(authErr(e.code));
    resetBtn();
  }
  function resetBtn() { btn.disabled = false; btn.textContent = isSignUp ? 'Create account' : 'Sign in'; }
};

function showAuthErr(msg) {
  const el = document.getElementById('auth-err');
  el.textContent = msg;
  el.style.display = 'block';
}
function authErr(code) {
  const map = {
    'auth/email-already-in-use':'That email is already registered.',
    'auth/invalid-email':'Please enter a valid email.',
    'auth/weak-password':'Password must be at least 6 characters.',
    'auth/wrong-password':'Incorrect password.',
    'auth/user-not-found':'No account found for that email.',
    'auth/invalid-credential':'Incorrect email or password.',
    'auth/too-many-requests':'Too many attempts. Please wait a moment.',
  };
  return map[code] || 'Something went wrong. Please try again.';
}
window.doSignOut = async function() { await FB.signOut(FB.auth); };
function genCode() { return Math.random().toString(36).substr(2,6).toUpperCase(); }

// ── User Profile ───────────────────────────────────────────────────────────────
async function loadUserProfile() {
  const snap = await FB.getDoc(FB.doc(FB.db,'users',currentUser.uid));
  if (snap.exists()) {
    const data = snap.data();
    userCode = data.code;
    const el = document.getElementById('acode');
    if (el) el.textContent = userCode;
    const sl = document.getElementById('slink');
    if (sl) sl.value = location.origin + location.pathname + '?monitor=' + userCode;
    if (data.photoURL) {
      const avatar = document.getElementById('settings-avatar');
      const homeAvatar = document.getElementById('home-avatar');
      if (avatar) avatar.innerHTML = '<img src="' + data.photoURL + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>';
      if (homeAvatar) homeAvatar.innerHTML = '<img src="' + data.photoURL + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover"/>';
    }
  }
  const hr = new Date().getHours();
  const g = hr<12 ? 'Good morning' : hr<17 ? 'Good afternoon' : 'Good evening';
  const n = currentUser.displayName || currentUser.email.split('@')[0];
  const ini = n.split(' ').map(w=>w[0]).join('').toUpperCase().substr(0,2);
  const greetEl = document.getElementById('greet');
  if (greetEl) greetEl.textContent = g + ', ' + n + ' 👋';
  const avatarEl = document.getElementById('home-avatar');
  if (avatarEl && !avatarEl.querySelector('img')) avatarEl.textContent = ini;
  const dateEl = document.getElementById('home-date');
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-MY',{weekday:'long',day:'numeric',month:'long'});
  const sname = document.getElementById('settings-name');
  const semail = document.getElementById('settings-email');
  const scode = document.getElementById('settings-code');
  const savatar = document.getElementById('settings-avatar');
  const sInput = document.getElementById('s-name');
  if (sname) sname.textContent = n;
  if (semail) semail.textContent = currentUser.email;
  if (scode && userCode) scode.textContent = 'Access code: ' + userCode;
  if (savatar && !savatar.querySelector('img')) savatar.textContent = ini;
  if (sInput) sInput.value = n;
}

// ── Navigation ─────────────────────────────────────────────────────────────────
window.go = function(id, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(t => t.classList.remove('active'));
  document.getElementById('pg-' + id).classList.add('active');
  el.classList.add('active');
  if (id === 'log') rLog();
  if (id === 'family') rFamily();
};

window.openAdd = function() { document.getElementById('m-add').classList.add('open'); };
window.cm = function(id) { document.getElementById(id).classList.remove('open'); };
window.cpCode = function() { navigator.clipboard.writeText(userCode).then(()=>toast('Code copied!')).catch(()=>{}); };
window.cpLink = function() { navigator.clipboard.writeText(document.getElementById('slink').value).then(()=>toast('Link copied!')).catch(()=>{}); };

function toast(msg) {
  const e = document.getElementById('tst');
  e.textContent = msg;
  e.classList.add('show');
  setTimeout(() => e.classList.remove('show'), 2600);
}
window.toast = toast;

// ── Dark Mode ─────────────────────────────────────────────────────────────────
window.toggleDark = function() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const newTheme = isDark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  document.getElementById('dark-icon-moon').style.display = isDark ? 'block' : 'none';
  document.getElementById('dark-icon-sun').style.display = isDark ? 'none' : 'block';
  document.getElementById('dark-mode-label').textContent = isDark ? 'Currently off' : 'Currently on';
  const knob = document.getElementById('dark-knob');
  const toggle = document.getElementById('dark-toggle');
  if (knob && toggle) {
    knob.style.left = isDark ? '3px' : '23px';
    toggle.style.background = isDark ? 'var(--border-strong)' : 'var(--primary)';
  }
  localStorage.setItem('medmate_theme', newTheme);
};

// Load saved theme
const savedTheme = localStorage.getItem('medmate_theme') || 'light';
if (savedTheme === 'dark') {
  document.documentElement.setAttribute('data-theme', 'dark');
  setTimeout(() => {
    const moonIcon = document.getElementById('dark-icon-moon');
    const sunIcon = document.getElementById('dark-icon-sun');
    const lbl = document.getElementById('dark-mode-label');
    const knob = document.getElementById('dark-knob');
    const toggle = document.getElementById('dark-toggle');
    if (moonIcon) moonIcon.style.display = 'none';
    if (sunIcon) sunIcon.style.display = 'block';
    if (lbl) lbl.textContent = 'Currently on';
    if (knob) knob.style.left = '23px';
    if (toggle) toggle.style.background = 'var(--primary)';
  }, 100);
}

// ── Medicines ─────────────────────────────────────────────────────────────────
function subscribeToMeds() {
  if (medsUnsub) medsUnsub();
  const q = FB.query(FB.collection(FB.db,'medicines'), FB.where('uid','==',currentUser.uid));
  medsUnsub = FB.onSnapshot(q, snap => {
    meds = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    rHome();
  });
}

function getMedTimes(m) {
  if (m.times && m.times.length) return m.times;
  if (m.time) return [m.time];
  return [];
}

window.addTimeSlot = function() {
  const wrap = document.getElementById('time-slots');
  const row = document.createElement('div');
  row.className = 'time-slot-row';
  row.innerHTML = '<input type="time" class="slot-time"/><button class="time-remove-btn" onclick="removeTimeSlot(this)">×</button>';
  wrap.appendChild(row);
};
window.removeTimeSlot = function(btn) {
  const rows = document.querySelectorAll('.time-slot-row');
  if (rows.length <= 1) { toast('At least one time is required'); return; }
  btn.parentElement.remove();
};
window.updatePriorityHint = function() {
  const p = document.getElementById('mpriority').value;
  const hints = {
    critical: '🔴 <b>Critical:</b> Must be taken within 30 mins of scheduled time',
    normal:   '🟡 <b>Normal:</b> Accepted within 1 hour before/after scheduled time',
    flexible: '🟢 <b>Flexible:</b> Can be taken any time during the day'
  };
  document.getElementById('priority-hint').innerHTML = hints[p];
  document.getElementById('expiry-wrap').style.display = p === 'critical' ? 'block' : 'none';
};

window.saveMed = async function() {
  const n = document.getElementById('mn').value.trim();
  const d = document.getElementById('md').value.trim();
  const i = document.getElementById('micon').value;
  const p = document.getElementById('mpriority').value;
  const expiry = p === 'critical' ? parseInt(document.getElementById('mexpiry').value) : null;
  const times = [...document.querySelectorAll('.slot-time')].map(el => el.value).filter(t => t);
  if (!n) { toast('Please fill in medicine name'); return; }
  if (!times.length) { toast('Please add at least one reminder time'); return; }
  await FB.addDoc(FB.collection(FB.db,'medicines'), {
    uid: currentUser.uid, name:n, dose:d, times, time:times[0], icon:i,
    priority:p, expiryMins: expiry, createdAt: FB.serverTimestamp()
  });
  cm('m-add');
  document.getElementById('mn').value = '';
  document.getElementById('md').value = '';
  document.getElementById('time-slots').innerHTML = '<div class="time-slot-row"><input type="time" class="slot-time"/><button class="time-remove-btn" onclick="removeTimeSlot(this)">×</button></div>';
  toast('Medicine added!');
};

window.delMed = async function(id) {
  if (!confirm('Remove this medicine?')) return;
  await FB.deleteDoc(FB.doc(FB.db,'medicines',id));
  toast('Removed');
};

// ── Doses ──────────────────────────────────────────────────────────────────────
function subscribeToDoses() {
  if (dosesUnsub) dosesUnsub();
  const q = FB.query(FB.collection(FB.db,'doses'), FB.where('uid','==',currentUser.uid), FB.orderBy('takenAt','desc'));
  dosesUnsub = FB.onSnapshot(q, snap => {
    doses = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    doses.sort((a,b) => tsToDate(b.takenAt) - tsToDate(a.takenAt));
    rHome(); rLog();
  }, () => {
    const qFallback = FB.query(FB.collection(FB.db,'doses'), FB.where('uid','==',currentUser.uid));
    dosesUnsub = FB.onSnapshot(qFallback, snap => {
      doses = snap.docs.map(d => ({ id:d.id, ...d.data() }));
      doses.sort((a,b) => tsToDate(b.takenAt) - tsToDate(a.takenAt));
      rHome(); rLog();
    });
  });
}

function tsToDate(ts) {
  if (!ts) return new Date();
  return ts.toDate ? ts.toDate() : new Date(ts);
}

// ── Home Render ────────────────────────────────────────────────────────────────
function rHome() {
  const now = new Date(), tod = now.toDateString();
  let missed = 0, totalSlots = 0, takenSlots = 0;

  meds.forEach(m => {
    getMedTimes(m).forEach(t => {
      totalSlots++;
      const tk = doses.find(d => d.medId===m.id && d.scheduledTime===t && tsToDate(d.takenAt).toDateString()===tod);
      if (tk) { takenSlots++; }
      else {
        const [h,mn] = t.split(':').map(Number);
        const s = new Date(); s.setHours(h,mn,0,0);
        if (s < now) missed++;
      }
    });
  });

  const pct = totalSlots > 0 ? Math.round((takenSlots/totalSlots)*100) : 0;
  const fill = document.getElementById('progress-fill');
  const ptext = document.getElementById('progress-text');
  if (fill) fill.setAttribute('stroke-dasharray', pct + ', 100');
  if (ptext) ptext.textContent = pct + '%';
  const countEl = document.getElementById('med-count');
  if (countEl) countEl.textContent = totalSlots;

  document.getElementById('alerts').innerHTML = missed > 0
    ? '<div class="alert-box">⚠️ You have ' + missed + ' missed dose' + (missed>1?'s':'') + ' today — your monitors can see this.</div>' : '';

  const el = document.getElementById('med-home');
  if (!meds.length) { el.innerHTML='<div class="empty-state"><div class="empty-icon">💊</div>No medicines yet.<br>Tap below to add one!</div>'; return; }

  let html = '';
  meds.forEach(m => {
    const times = getMedTimes(m);
    const priority = m.priority || 'normal';
    const pLabel = {critical:'🔴',normal:'🟡',flexible:'🟢'}[priority];

    times.forEach(t => {
      const tk = doses.find(d => d.medId===m.id && d.scheduledTime===t && tsToDate(d.takenAt).toDateString()===tod);
      const st = tk ? 'taken' : doseStatus(m, t);
      const badgeClass = {taken:'badge-taken',due:'badge-due',upcoming:'badge-upcoming',missed:'badge-missed'}[st];
      const badgeLabel = {taken:'✓ Taken',due:'Due now',upcoming:'Upcoming',missed:'Missed'}[st];

      let expiryWarning = '';
      if (!tk && priority === 'critical' && m.expiryMins) {
        const [h,mn] = t.split(':').map(Number);
        const s = new Date(); s.setHours(h,mn,0,0);
        const diffMins = (now - s) / 60000;
        if (diffMins > 0 && diffMins <= m.expiryMins) {
          const remaining = Math.round(m.expiryMins - diffMins);
          expiryWarning = '<div style="font-size:10px;color:var(--red);margin-top:3px">⏱ ' + remaining + ' mins left to confirm</div>';
        } else if (diffMins > m.expiryMins) {
          expiryWarning = '<div style="font-size:10px;color:var(--text-muted);margin-top:3px">⏱ Confirmation window expired</div>';
        }
      }

      html += '<div class="med-item' + (tk ? ' taken' : '') + '">' +
        '<div class="med-icon">' + m.icon + '</div>' +
        '<div class="med-info">' +
          '<div class="med-name">' + m.name + ' <span style="font-size:12px">' + pLabel + '</span></div>' +
          '<div class="med-sub">' + (m.dose||'') + ' · ' + t + (times.length > 1 ? ' (' + (times.indexOf(t)+1) + '/' + times.length + ')' : '') + '</div>' +
          expiryWarning +
        '</div>' +
        '<div class="med-actions">' +
          '<span class="badge ' + badgeClass + '">' + badgeLabel + '</span>' +
          (!tk ? '<button class="btn-small" onclick="openDose(\'' + m.id + '\',\'' + t + '\')">Take dose</button>' : '') +
        '</div>' +
      '</div>';
    });

    html += '<div style="text-align:right;margin-top:-4px;margin-bottom:10px">' +
      '<button class="btn-danger" onclick="delMed(\'' + m.id + '\')">Remove</button></div>';
  });

  el.innerHTML = html;
}

function doseStatus(m, time) {
  const t = time || getMedTimes(m)[0] || '00:00';
  const now = new Date();
  const [h,mn] = t.split(':').map(Number);
  const s = new Date();
  s.setHours(h,mn,0,0);
  const win = m.priority === 'critical' ? 30 : m.priority === 'flexible' ? 999 : 60;
  const d = (s - now) / 60000;
  return d < -win ? 'missed' : d <= win ? 'due' : 'upcoming';
}

// ── Take Dose ──────────────────────────────────────────────────────────────────
window.openDose = function(id, scheduledTime) {
  curMed = id;
  curScheduledTime = scheduledTime || '';
  capData = null;
  window._lastDetected = null;
  const m = meds.find(x => x.id===id);
  document.getElementById('dtitle').textContent = m ? (m.name + (scheduledTime ? ' · ' + scheduledTime : '')) : 'Take dose';
  document.getElementById('aibox').innerHTML = '';
  document.getElementById('prevbox').style.display = 'none';
  document.getElementById('cbtn').style.display = 'none';
  document.getElementById('notes-wrap').style.display = 'none';
  document.getElementById('dose-notes').value = '';
  document.getElementById('gallery-input').value = '';
  document.getElementById('upload-box').style.display = 'block';
  document.getElementById('m-dose').classList.add('open');
};

window.handleGallery = function(event) {
  const file = event.target.files[0];
  if (!file) return;
  document.getElementById('aibox').innerHTML = '<div class="ai-status checking">⏳ Processing image...</div>';
  document.getElementById('upload-box').style.display = 'none';
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const maxW = 800;
      const scale = Math.min(1, maxW / img.width);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      capData = canvas.toDataURL('image/jpeg', 0.6);
      processPhoto(capData);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
};

function processPhoto(dataUrl) {
  document.getElementById('pimg').src = dataUrl;
  document.getElementById('prevbox').style.display = 'block';
  document.getElementById('aibox').innerHTML = '<div class="ai-status checking">🔍 AI is verifying your photo...</div>';
  document.getElementById('cbtn').style.display = 'none';
  verifyAI(dataUrl);
}

async function verifyAI(url) {
  const b64 = url.split(',')[1];
  const WORKER_URL = 'https://long-sky-df3a.svhisshal.workers.dev';
  try {
    const r = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ imageBase64: b64, medName: meds.find(m => m.id === curMed)?.name || '' })
    });
    if (!r.ok) {
      document.getElementById('aibox').innerHTML = '<div class="ai-status error">⚠️ Worker error ' + r.status + '</div>';
      showRetake(); return;
    }
    const data = await r.json();
    const txt = data.result || '';
    let res = { pass:false, reason:'Could not parse response' };
    try { res = JSON.parse(txt.replace(/```json|```/g,'').trim()); }
    catch(e) { if (txt.toLowerCase().includes('"pass":true') || txt.toLowerCase().includes('pass": true')) res = { pass:true, reason:'Medicine detected' }; }

    if (res.pass) {
      let detailHtml = '';
      if (res.detected) {
        const matchIcon = res.match === true ? '✅' : res.match === false ? '⚠️' : '❓';
        const matchText = res.match === true ? 'Matches your medicine' : res.match === false ? 'Different from expected' : 'Could not verify name';
        detailHtml = '<div style="margin-top:8px;padding:10px;background:rgba(16,185,129,0.08);border-radius:8px;font-size:12px">' +
          '<div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="opacity:.7">Detected</span><span style="font-weight:600">' + res.detected + (res.dosage ? ' · ' + res.dosage : '') + '</span></div>' +
          '<div style="display:flex;justify-content:space-between"><span style="opacity:.7">Match</span><span style="font-weight:600">' + matchIcon + ' ' + matchText + '</span></div></div>';
      }
      document.getElementById('aibox').innerHTML = '<div class="ai-status success"><div style="font-weight:700;margin-bottom:2px">✅ Medicine verified!</div><div style="font-size:12px">' + res.reason + '</div>' + detailHtml + '</div>';
      window._lastDetected = res;
      const btn = document.getElementById('cbtn');
      btn.style.display = 'flex';
      btn.textContent = '✓ Mark as taken';
      btn.disabled = false;
      document.getElementById('notes-wrap').style.display = 'block';
    } else {
      document.getElementById('aibox').innerHTML = '<div class="ai-status error">❌ ' + res.reason + '</div>';
      showRetake();
    }
  } catch(e) {
    document.getElementById('aibox').innerHTML = '<div class="ai-status error">⚠️ Could not reach AI: ' + e.message + '</div>';
    showRetake();
  }
}

function showRetake() {
  document.getElementById('upload-box').style.display = 'block';
  document.getElementById('gallery-input').value = '';
  capData = null;
}

window.confirmDose = async function() {
  const btn = document.getElementById('cbtn');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  try {
    const m = meds.find(x => x.id===curMed);
    const now = new Date();
    const schedTime = curScheduledTime || getMedTimes(m)[0] || '';
    const notes = document.getElementById('dose-notes')?.value?.trim() || '';

    if (m?.priority === 'critical' && m?.expiryMins && schedTime) {
      const [h,mn] = schedTime.split(':').map(Number);
      const sched = new Date(); sched.setHours(h,mn,0,0);
      const diffMins = (now - sched) / 60000;
      if (diffMins > m.expiryMins) {
        document.getElementById('aibox').innerHTML = '<div class="ai-status error">⏱ Confirmation window expired</div>';
        btn.disabled = false; btn.textContent = '✓ Mark as taken'; return;
      }
    }

    let timingStatus = 'on-time';
    if (schedTime) {
      const [h,mn] = schedTime.split(':').map(Number);
      const sched = new Date(); sched.setHours(h,mn,0,0);
      const diffMins = (now - sched) / 60000;
      const win = m?.priority === 'critical' ? 30 : m?.priority === 'flexible' ? 999 : 60;
      if (diffMins < -win) timingStatus = 'early';
      else if (diffMins > win) timingStatus = 'late';
    }

    await FB.addDoc(FB.collection(FB.db,'doses'), {
      uid: currentUser.uid, medId: curMed,
      medName: m ? m.name : '', medIcon: m ? m.icon : '💊',
      medTime: m ? (m.times?.[0] || m.time || '') : '',
      scheduledTime: schedTime, medPriority: m ? (m.priority || 'normal') : 'normal',
      photo: capData, notes: notes || null,
      detectedName: window._lastDetected?.detected || null,
      detectedDosage: window._lastDetected?.dosage || null,
      detectedMatch: window._lastDetected?.match ?? null,
      timingStatus, takenAt: FB.serverTimestamp()
    });
    closeDose();
    toast('✅ Dose marked as taken!');
  } catch(e) {
    document.getElementById('aibox').innerHTML = '<div class="ai-status error">⚠️ Failed to save: ' + e.message + '</div>';
    btn.disabled = false; btn.textContent = '✓ Mark as taken';
  }
};

window.closeDose = function() {
  capData = null; curScheduledTime = ''; window._lastDetected = null;
  document.getElementById('m-dose').classList.remove('open');
  document.getElementById('upload-box').style.display = 'block';
  document.getElementById('cbtn').style.display = 'none';
  document.getElementById('aibox').innerHTML = '';
  document.getElementById('prevbox').style.display = 'none';
  document.getElementById('notes-wrap').style.display = 'none';
  document.getElementById('dose-notes').value = '';
  document.getElementById('gallery-input').value = '';
};

// ── Log Render ─────────────────────────────────────────────────────────────────
function rLog() {
  const el = document.getElementById('log-list');
  if (!doses.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div>No doses recorded yet.<br>Take your first dose to see history here!</div>';
    return;
  }

  const groups = {};
  doses.forEach(d => {
    const t = tsToDate(d.takenAt);
    const dateKey = t.toLocaleDateString('en-MY', {weekday:'long', month:'long', day:'numeric', year:'numeric'});
    if (!groups[dateKey]) groups[dateKey] = { items:[], sortDate: t };
    groups[dateKey].items.push(d);
  });

  const sortedGroups = Object.entries(groups).sort((a,b) => b[1].sortDate - a[1].sortDate);

  let html = '';
  sortedGroups.forEach(([date, {items}]) => {
    html += '<div class="log-date-label">' + date + '</div>';
    items.forEach(d => {
      const m = meds.find(x => x.id === d.medId);
      const t = tsToDate(d.takenAt);
      const timeStr = t.toLocaleTimeString('en-MY', {hour:'2-digit', minute:'2-digit'});
      const priority = d.medPriority || m?.priority || 'normal';
      const pLabel = {critical:'🔴',normal:'🟡',flexible:'🟢'}[priority];
      const ts = d.timingStatus || 'on-time';
      const tsMap = {early:{label:'⚡ Early',cls:'badge-taken'},'on-time':{label:'✅ On time',cls:'badge-taken'},late:{label:'⏰ Late',cls:'badge-due'}};
      const tsInfo = tsMap[ts] || tsMap['on-time'];
      let aiHtml = d.detectedName ? '<div style="font-size:11px;color:var(--text-muted);margin-top:2px">' + (d.detectedMatch===true?'✅':d.detectedMatch===false?'⚠️':'❓') + ' Detected: ' + d.detectedName + (d.detectedDosage ? ' · ' + d.detectedDosage : '') + '</div>' : '';
      const notesHtml = d.notes ? '<div style="font-size:11px;color:var(--primary);margin-top:3px;font-style:italic">💬 "' + d.notes + '"</div>' : '';

      html += '<div class="log-item">' +
        (d.photo ? '<img src="' + d.photo + '" class="log-thumb"/>' : '<div class="log-icon-placeholder">' + (d.medIcon || m?.icon || '💊') + '</div>') +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-weight:700;font-size:14px">' + (d.medName || m?.name || 'Unknown') + ' ' + pLabel + '</div>' +
          '<div style="font-size:11px;color:var(--text-secondary);margin-top:2px">Taken ' + timeStr + ' · Scheduled ' + (d.scheduledTime || d.medTime || '--:--') + '</div>' +
          aiHtml + notesHtml +
        '</div>' +
        '<div style="text-align:right;flex-shrink:0"><span class="badge ' + tsInfo.cls + '">' + tsInfo.label + '</span></div>' +
      '</div>';
    });
  });
  el.innerHTML = html || '<div class="empty-state"><div class="empty-icon">📋</div>No history yet</div>';
}

// ── Family ─────────────────────────────────────────────────────────────────────
async function loadFriends() {
  const snap = await FB.getDoc(FB.doc(FB.db,'users',currentUser.uid));
  friends = snap.exists() ? (snap.data().monitors || []) : [];
  rFamily();
}
function rFamily() {
  const el = document.getElementById('flist');
  if (!friends.length) { el.innerHTML='<div class="empty-state"><div class="empty-icon">👥</div>No monitors added yet</div>'; return; }
  el.innerHTML = friends.map(f => {
    const ini = (f.name||f.email).split(' ').map(w=>w[0]).join('').toUpperCase().substr(0,2);
    return '<div class="friend-item">' +
      '<div class="friend-avatar">' + ini + '</div>' +
      '<div style="flex:1"><div style="font-size:13px;font-weight:600">' + (f.name||f.email) + '</div><div style="font-size:11px;color:var(--text-secondary)">' + f.email + '</div></div>' +
      '<button class="btn-danger" onclick="removeMonitor(\'' + f.email + '\')">Remove</button>' +
    '</div>';
  }).join('');
}
window.doInvite = async function() {
  const email = document.getElementById('inv-email').value.trim();
  if (!email || !email.includes('@')) { toast('Enter a valid email'); return; }
  if (friends.find(f => f.email===email)) { toast('Already a monitor'); return; }
  friends.push({ email, name: email.split('@')[0] });
  await FB.updateDoc(FB.doc(FB.db,'users',currentUser.uid), { monitors: friends });
  document.getElementById('inv-email').value = '';
  rFamily();
  toast('✅ ' + email + ' added as monitor');
};
window.removeMonitor = async function(email) {
  friends = friends.filter(f => f.email !== email);
  await FB.updateDoc(FB.doc(FB.db,'users',currentUser.uid), { monitors: friends });
  rFamily();
  toast('Monitor removed');
};

// ── Monitor Dashboard ──────────────────────────────────────────────────────────
async function loadSavedMonitors() {
  try {
    const snap = await FB.getDoc(FB.doc(FB.db,'users',currentUser.uid));
    const saved = snap.data()?.monitoring || [];
    for (const code of saved) { if (!monitoredPeople[code]) await subscribeMonitor(code, true); }
    if (!saved.length) renderMonitoredList();
  } catch(e) { renderMonitoredList(); }
}
async function saveMonitorList() {
  try { await FB.updateDoc(FB.doc(FB.db,'users',currentUser.uid), { monitoring: Object.keys(monitoredPeople) }); } catch(e) {}
}

function renderMonitoredList() {
  const el = document.getElementById('monitored-list');
  if (!Object.keys(monitoredPeople).length && !el.children.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📺</div>No one being monitored yet.<br>Enter a code above to start.</div>';
  }
}

window.doMonitor = async function() {
  const code = document.getElementById('mcode').value.trim().toUpperCase();
  if (code.length < 4) { toast('Enter a valid access code'); return; }
  if (code === userCode) { toast('⚠️ You cannot monitor yourself!'); document.getElementById('mcode').value = ''; return; }
  if (monitoredPeople[code]) { toast('Already monitoring this person'); document.getElementById('mcode').value = ''; return; }
  document.getElementById('mcode').value = '';
  await subscribeMonitor(code, false);
};

async function subscribeMonitor(code, silent) {
  let targetUser = null;
  await new Promise(res => {
    const q = FB.query(FB.collection(FB.db,'users'), FB.where('code','==',code));
    const u = FB.onSnapshot(q, snap => { if (!snap.empty) targetUser = snap.docs[0].data(); u(); res(); });
  });
  if (!targetUser) { if (!silent) toast('No user found for code ' + code); return; }
  if (!silent) toast('✅ Now monitoring ' + targetUser.name);

  const uid = targetUser.uid;
  let tMeds = [], tDoses = [];
  const listEl = document.getElementById('monitored-list');
  const emptyEl = listEl.querySelector('.empty-state');
  if (emptyEl) emptyEl.remove();

  const card = document.createElement('div');
  card.id = 'monitor-' + code;
  card.style.cssText = 'margin-bottom:16px;animation:fadeSlideIn .3s ease';
  card.innerHTML = '<div class="glass-card" style="text-align:center;padding:24px;color:var(--text-secondary)"><span class="spinner"></span> Loading ' + targetUser.name + '...</div>';
  listEl.appendChild(card);

  function redraw() { renderDash(targetUser, tMeds, tDoses, card, code); }

  const unsubMeds = FB.onSnapshot(
    FB.query(FB.collection(FB.db,'medicines'), FB.where('uid','==',uid)),
    snap => { tMeds = snap.docs.map(d=>({id:d.id,...d.data()})); redraw(); }
  );

  FB.onSnapshot(
    FB.query(FB.collection(FB.db,'doses'), FB.where('uid','==',uid)),
    snap => {
      tDoses = snap.docs.map(d=>({id:d.id,...d.data()}));
      tDoses.sort((a,b) => tsToDate(b.takenAt) - tsToDate(a.takenAt));
      redraw();
    }
  );

  monitoredPeople[code] = { user: targetUser, unsubMeds };
  saveMonitorList();
}

function renderDash(user, tMeds, tDoses, card, code) {
  const now = new Date(), tod = now.toDateString();
  let total = 0, taken = 0, missed = 0;
  const ini = (user.name||'?').split(' ').map(w=>w[0]).join('').toUpperCase().substr(0,2);

  tMeds.forEach(m => {
    getMedTimes(m).forEach(t => {
      total++;
      const tk = tDoses.find(d => d.medId===m.id && d.scheduledTime===t && tsToDate(d.takenAt).toDateString()===tod);
      if (tk) taken++;
      else {
        const [h,mn] = t.split(':').map(Number);
        const s = new Date(); s.setHours(h,mn,0,0);
        if (s < now) missed++;
      }
    });
  });

  const pct = total > 0 ? Math.round((taken/total)*100) : 0;
  const streak = calcStreak(tMeds, tDoses);

  let medsHtml = '';
  tMeds.forEach(m => {
    getMedTimes(m).forEach(t => {
      const tk = tDoses.find(d => d.medId===m.id && d.scheduledTime===t && tsToDate(d.takenAt).toDateString()===tod);
      const st = tk ? 'taken' : doseStatus(m, t);
      const badgeClass = {taken:'badge-taken',due:'badge-due',upcoming:'badge-upcoming',missed:'badge-missed'}[st];
      const badgeLabel = {taken:'✓ Taken',due:'Due now',upcoming:'Upcoming',missed:'Missed'}[st];
      medsHtml += '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">' +
        '<span style="font-size:18px">' + m.icon + '</span>' +
        '<div style="flex:1"><div style="font-size:13px;font-weight:600">' + m.name + '</div><div style="font-size:11px;color:var(--text-secondary)">' + t + '</div></div>' +
        '<span class="badge ' + badgeClass + '">' + badgeLabel + '</span></div>';
    });
  });

  card.innerHTML = '<div class="glass-card">' +
    '<div class="monitor-header">' +
      '<div style="display:flex;align-items:center;gap:12px">' +
        '<div class="friend-avatar">' + ini + '</div>' +
        '<div><div style="font-size:16px;font-weight:700;color:#fff">' + user.name + '</div><div style="font-size:11px;color:rgba(255,255,255,.7)"><span class="live-dot"></span> Live updates</div></div>' +
      '</div>' +
      '<div class="monitor-stats">' +
        '<div class="stat-box"><div class="stat-num">' + taken + '/' + total + '</div><div class="stat-label">Taken today</div></div>' +
        '<div class="stat-box"><div class="stat-num">' + pct + '%</div><div class="stat-label">Adherence</div></div>' +
        '<div class="stat-box"><div class="stat-num">' + streak + '</div><div class="stat-label">🔥 Streak</div></div>' +
      '</div>' +
    '</div>' +
    '<div style="margin-top:12px">' + medsHtml + '</div>' +
    '<div class="nudge-box">' +
      '<div style="font-size:13px;font-weight:600;margin-bottom:8px">💬 Send a nudge</div>' +
      '<div style="display:flex;gap:8px"><input id="nudge-msg" placeholder="Take your medicine! 💊" style="flex:1;font-size:13px"/>' +
      '<button class="btn-primary" style="padding:8px 16px;font-size:12px" onclick="sendNudge(\'' + user.uid + '\',\'' + user.name + '\')">Send 👋</button></div>' +
      '<div id="nudge-history-' + user.uid + '" class="nudge-history"></div>' +
    '</div>' +
    '<button class="btn-danger full" style="margin-top:12px" onclick="removeMonitored(\'' + code + '\')">Stop monitoring</button>' +
  '</div>';

  loadNudgeHistory(user.uid);
}

function calcStreak(tMeds, tDoses) {
  let streak = 0;
  for (let i = 1; i <= 30; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = d.toDateString();
    let allTaken = true;
    tMeds.forEach(m => {
      getMedTimes(m).forEach(t => {
        const tk = tDoses.find(dose => dose.medId===m.id && tsToDate(dose.takenAt).toDateString()===ds);
        if (!tk) allTaken = false;
      });
    });
    if (allTaken && tMeds.length) streak++; else break;
  }
  return streak;
}

window.removeMonitored = function(code) {
  const p = monitoredPeople[code];
  if (p?.unsubMeds) p.unsubMeds();
  delete monitoredPeople[code];
  const card = document.getElementById('monitor-' + code);
  if (card) card.remove();
  saveMonitorList();
  renderMonitoredList();
  toast('Stopped monitoring');
};

// ── Nudges ─────────────────────────────────────────────────────────────────────
window.sendNudge = async function(targetUid, targetName) {
  const msg = document.getElementById('nudge-msg').value || 'Take your medicine! 💊';
  const senderName = currentUser.displayName || currentUser.email.split('@')[0];
  try {
    await FB.addDoc(FB.collection(FB.db,'nudges'), {
      toUid: targetUid, fromUid: currentUser.uid, fromName: senderName,
      message: msg, sentAt: FB.serverTimestamp(), read: false
    });
    toast('👋 Nudge sent to ' + targetName + '!');
    loadNudgeHistory(targetUid);
  } catch(e) { toast('Failed to send nudge'); }
};

async function loadNudgeHistory(targetUid) {
  const el = document.getElementById('nudge-history-' + targetUid);
  if (!el) return;
  try {
    const q = FB.query(FB.collection(FB.db,'nudges'), FB.where('toUid','==',targetUid));
    FB.onSnapshot(q, snap => {
      if (!snap.docs.length) { el.innerHTML = ''; return; }
      const nudges = snap.docs.map(d=>({...d.data()}))
        .sort((a,b) => tsToDate(b.sentAt) - tsToDate(a.sentAt)).slice(0,5);
      el.innerHTML = '<div class="settings-section-label" style="margin-top:10px">Recent nudges</div>' +
        nudges.map(n => {
          const t = tsToDate(n.sentAt);
          const timeStr = t.toLocaleDateString('en-MY',{month:'short',day:'numeric'}) + ' ' + t.toLocaleTimeString('en-MY',{hour:'2-digit',minute:'2-digit'});
          return '<div class="nudge-item"><span>' + n.fromName + ': "' + n.message + '"</span><span style="flex-shrink:0;margin-left:8px">' + timeStr + '</span></div>';
        }).join('');
    });
  } catch(e) {}
}

function listenForNudges() {
  if (!currentUser) return;
  const q = FB.query(FB.collection(FB.db,'nudges'), FB.where('toUid','==',currentUser.uid), FB.where('read','==',false));
  FB.onSnapshot(q, snap => {
    snap.docChanges().forEach(async change => {
      if (change.type === 'added') {
        const n = change.doc.data();
        toast('💬 ' + n.fromName + ': ' + n.message);
        if (Notification.permission === 'granted') {
          new Notification('💊 MedMate — Nudge from ' + n.fromName, { body: n.message });
        }
        try { await FB.updateDoc(FB.doc(FB.db,'nudges',change.doc.id), { read: true }); } catch(e) {}
      }
    });
  });
}

// ── Notifications ──────────────────────────────────────────────────────────────
function scheduleReminders() {
  if ('Notification' in window && Notification.permission==='default') Notification.requestPermission();
  setInterval(() => {
    if (!meds.length || Notification.permission!=='granted') return;
    const now = new Date(), tod = now.toDateString();
    meds.forEach(m => {
      getMedTimes(m).forEach(t => {
        const [h,mn] = t.split(':').map(Number);
        const s = new Date(); s.setHours(h,mn,0,0);
        const diff = Math.abs(now-s)/60000;
        const taken = doses.find(d=>d.medId===m.id && tsToDate(d.takenAt).toDateString()===tod);
        if (diff<2 && !taken) {
          new Notification('MedMate 💊',{body:'Time to take ' + m.name + (m.dose?' – '+m.dose:'')});
        }
      });
    });
  }, 30000);
}

window.requestNotifPermission = function() {
  if (!('Notification' in window)) { toast('Notifications not supported'); return; }
  Notification.requestPermission().then(p => {
    const badge = document.getElementById('notif-badge');
    const label = document.getElementById('notif-label');
    if (p === 'granted') {
      toast('✅ Notifications enabled!');
      if (badge) { badge.textContent = 'On'; badge.className = 'settings-badge'; }
      if (label) label.textContent = 'Reminders are active';
    } else {
      toast('Notifications blocked — enable in browser settings');
      if (badge) { badge.textContent = 'Blocked'; badge.className = 'settings-badge off'; }
    }
  });
};

// ── Settings Functions ────────────────────────────────────────────────────────
window.updateName = async function() {
  const n = document.getElementById('s-name').value.trim();
  if (!n) { toast('Please enter a name'); return; }
  try {
    await FB.updateProfile(currentUser, { displayName: n });
    await FB.updateDoc(FB.doc(FB.db,'users',currentUser.uid), { name: n });
    loadUserProfile();
    toast('✅ Name updated!');
  } catch(e) { toast('Failed to update name'); }
};

async function deleteCollection(colName, field, uid) {
  const q = FB.query(FB.collection(FB.db, colName), FB.where(field, '==', uid));
  const snap = await FB.getDocs(q);
  const deletes = snap.docs.map(d => FB.deleteDoc(FB.doc(FB.db, colName, d.id)));
  await Promise.all(deletes);
  return snap.docs.length;
}

window.confirmClear = async function(type) {
  const labels = { doses:'all your dose logs', medicines:'all your medicines', nudges:'all nudge messages', all:'ALL data (doses, medicines and nudges)' };
  if (!confirm('Are you sure you want to delete ' + labels[type] + '? This cannot be undone.')) return;
  toast('Clearing...');
  try {
    let total = 0;
    if (type === 'doses' || type === 'all') total += await deleteCollection('doses', 'uid', currentUser.uid);
    if (type === 'medicines' || type === 'all') total += await deleteCollection('medicines', 'uid', currentUser.uid);
    if (type === 'nudges' || type === 'all') {
      total += await deleteCollection('nudges', 'fromUid', currentUser.uid);
      total += await deleteCollection('nudges', 'toUid', currentUser.uid);
    }
    toast('✅ Deleted ' + total + ' records — fresh start!');
  } catch(e) { toast('Error: ' + e.message); }
};

window.openChangePass = function() { document.getElementById('m-pass').classList.add('open'); };

window.doChangePass = async function() {
  const np = document.getElementById('new-pass').value;
  const cp = document.getElementById('confirm-pass').value;
  const st = document.getElementById('pass-status');
  if (!np || np.length < 6) { st.innerHTML = '<div class="ai-status error">Password must be at least 6 characters</div>'; return; }
  if (np !== cp) { st.innerHTML = '<div class="ai-status error">Passwords do not match</div>'; return; }
  try {
    await FB.updatePassword(currentUser, np);
    cm('m-pass');
    toast('✅ Password updated!');
  } catch(e) {
    if (e.code === 'auth/requires-recent-login') {
      st.innerHTML = '<div class="ai-status error">Please sign out and sign in again before changing password</div>';
    } else {
      st.innerHTML = '<div class="ai-status error">Error: ' + e.message + '</div>';
    }
  }
};

window.confirmDeleteAccount = async function() {
  if (!confirm('Delete your account permanently? This removes ALL your data and cannot be undone.')) return;
  if (!confirm('Are you absolutely sure? There is no going back!')) return;
  try {
    await deleteCollection('doses', 'uid', currentUser.uid);
    await deleteCollection('medicines', 'uid', currentUser.uid);
    await deleteCollection('nudges', 'fromUid', currentUser.uid);
    await deleteCollection('nudges', 'toUid', currentUser.uid);
    await FB.deleteDoc(FB.doc(FB.db,'users',currentUser.uid));
    await FB.deleteUser(currentUser);
    toast('Account deleted');
  } catch(e) {
    if (e.code === 'auth/requires-recent-login') {
      alert('Please sign out and sign in again before deleting your account.');
    } else { toast('Error: ' + e.message); }
  }
};

// ── Language ───────────────────────────────────────────────────────────────────
window.toggleLang = function() {
  currentLang = currentLang === 'en' ? 'ms' : 'en';
  localStorage.setItem('mm_lang', currentLang);
  const isMs = currentLang === 'ms';
  const badge = document.getElementById('lang-badge');
  const sub = document.getElementById('lang-sub');
  if (badge) badge.textContent = isMs ? 'BM' : 'EN';
  if (sub) sub.textContent = isMs ? 'Kini: Bahasa Malaysia' : 'Currently: English';
  toast(isMs ? 'Bahasa Malaysia dipilih' : 'English selected');
};

// ── Weekly Report ──────────────────────────────────────────────────────────────
window.showWeeklyReport = function() {
  const el = document.getElementById('report-content');
  const now = new Date();
  let totalScheduled = 0, totalTaken = 0;
  let medStats = [];

  meds.forEach(m => {
    const times = getMedTimes(m);
    let mTaken = 0, mMissed = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = d.toDateString();
      times.forEach(t => {
        const [h,mn] = t.split(':').map(Number);
        const s = new Date(d); s.setHours(h,mn,0,0);
        if (s > now && i === 0) return;
        totalScheduled++;
        const taken = doses.find(dose => dose.medId === m.id && tsToDate(dose.takenAt).toDateString() === ds);
        if (taken) { totalTaken++; mTaken++; } else { mMissed++; }
      });
    }
    medStats.push({ m, mTaken, mMissed, total: mTaken + mMissed });
  });

  const pct = totalScheduled > 0 ? Math.round((totalTaken/totalScheduled)*100) : 0;
  const color = pct >= 80 ? 'var(--primary)' : pct >= 50 ? 'var(--warn)' : 'var(--red)';
  const emoji = pct >= 80 ? '🌟' : pct >= 50 ? '💪' : '⚠️';

  const weekDots = Array.from({length:7}, (_,i) => {
    const d = new Date(); d.setDate(d.getDate()-(6-i));
    const ds = d.toDateString();
    const anyTaken = doses.some(x => tsToDate(x.takenAt).toDateString() === ds);
    const dayLabel = ['S','M','T','W','T','F','S'][d.getDay()];
    return '<div style="text-align:center"><div style="width:32px;height:32px;border-radius:50%;background:' + (anyTaken?'var(--primary)':'var(--border-strong)') + ';display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:' + (anyTaken?'#fff':'var(--text-muted)') + '">' + dayLabel + '</div><div style="font-size:9px;color:var(--text-muted);margin-top:2px">' + d.getDate() + '</div></div>';
  }).join('');

  el.innerHTML = '<div style="text-align:center;padding:20px;background:var(--primary-light);border-radius:16px;margin-bottom:16px">' +
    '<div style="font-size:48px;font-weight:700;color:' + color + '">' + pct + '%</div>' +
    '<div style="font-size:14px;font-weight:600;margin-top:4px">' + emoji + ' Adherence rate this week</div>' +
    '<div style="font-size:12px;color:var(--text-secondary);margin-top:4px">' + totalTaken + ' of ' + totalScheduled + ' doses taken</div></div>' +
    '<div style="display:flex;gap:5px;justify-content:center;margin-bottom:16px">' + weekDots + '</div>' +
    '<div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Per medicine</div>' +
    medStats.map(({m, mTaken, mMissed, total}) => {
      const mp = total > 0 ? Math.round((mTaken/total)*100) : 0;
      const mc = mp >= 80 ? 'var(--primary)' : mp >= 50 ? 'var(--warn)' : 'var(--red)';
      return '<div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;margin-bottom:8px">' +
        '<span style="font-size:20px">' + m.icon + '</span>' +
        '<div style="flex:1"><div style="font-size:13px;font-weight:600">' + m.name + '</div><div style="font-size:11px;color:var(--text-muted)">' + mTaken + ' taken · ' + mMissed + ' missed</div></div>' +
        '<div style="font-size:16px;font-weight:700;color:' + mc + '">' + mp + '%</div></div>';
    }).join('') +
    (meds.length === 0 ? '<div class="empty-state" style="padding:16px">No medicines set up yet</div>' : '');

  document.getElementById('m-report').classList.add('open');
};

// ── Refill Reminders ───────────────────────────────────────────────────────────
window.openRefillSettings = function() {
  const el = document.getElementById('refill-list');
  if (!meds.length) {
    el.innerHTML = '<div class="empty-state" style="padding:16px">No medicines added yet</div>';
  } else {
    el.innerHTML = meds.map(m => {
      const refill = m.refillAt || 5;
      const stock = m.stock || '';
      return '<div style="padding:12px 0;border-bottom:1px solid var(--border)">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><span style="font-size:18px">' + m.icon + '</span><div style="font-weight:600;font-size:13px">' + m.name + '</div></div>' +
        '<div style="display:flex;align-items:center;gap:10px">' +
          '<div style="flex:1"><label style="font-size:11px">Current stock</label><input type="number" min="0" value="' + stock + '" placeholder="e.g. 30" onchange="updateRefill(\'' + m.id + '\',\'stock\',this.value)" style="font-size:13px;padding:8px 12px"/></div>' +
          '<div style="flex:1"><label style="font-size:11px">Alert when below</label><input type="number" min="1" value="' + refill + '" placeholder="e.g. 5" onchange="updateRefill(\'' + m.id + '\',\'refillAt\',this.value)" style="font-size:13px;padding:8px 12px"/></div>' +
        '</div></div>';
    }).join('');
  }
  document.getElementById('m-refill').classList.add('open');
};

window.updateRefill = async function(medId, field, value) {
  try { await FB.updateDoc(FB.doc(FB.db,'medicines',medId), { [field]: parseInt(value) || 0 }); } catch(e) {}
};

function checkRefillAlerts() {
  meds.forEach(m => {
    if (m.stock && m.refillAt && m.stock <= m.refillAt) {
      toast('⚠️ Low stock: ' + m.name + ' — only ' + m.stock + ' doses left!');
    }
  });
}

// ── Profile Photo ──────────────────────────────────────────────────────────────
window.uploadProfilePic = function(event) {
  const file = event.target.files[0];
  if (!file) return;
  toast('Uploading photo...');
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      const size = 128;
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      const min = Math.min(img.width, img.height);
      const sx = (img.width - min) / 2, sy = (img.height - min) / 2;
      ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
      try {
        await FB.updateDoc(FB.doc(FB.db,'users',currentUser.uid), { photoURL: dataUrl });
        const avatar = document.getElementById('settings-avatar');
        const homeAvatar = document.getElementById('home-avatar');
        if (avatar) avatar.innerHTML = '<img src="' + dataUrl + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>';
        if (homeAvatar) homeAvatar.innerHTML = '<img src="' + dataUrl + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover"/>';
        toast('✅ Profile photo updated!');
      } catch(e) { toast('Failed to save photo: ' + e.message); }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
};

// ── Onboarding ─────────────────────────────────────────────────────────────────
const onboardSlides = [
  { icon:'💊', title:'Welcome to MedMate', body:'Your smart medicine companion. Never miss a dose again with photo verification and family monitoring.' },
  { icon:'📸', title:'Photo verification', body:'When it\'s time to take your medicine, snap a photo to confirm. Our AI checks that it\'s the right medicine.' },
  { icon:'👨‍👩‍👧', title:'Family monitoring', body:'Share your access code with family or caregivers. They get a live dashboard of your medicine progress.' },
  { icon:'🔔', title:'Smart reminders', body:'Set reminder times for each medicine. We\'ll notify you when it\'s time — even multiple times a day.' },
  { icon:'🚀', title:'Ready to start!', body:'Add your first medicine to get started. You can always change settings later.' }
];
let onboardIndex = 0;

function showOnboarding() {
  onboardIndex = 0;
  renderOnboardSlide();
  document.getElementById('m-onboard').classList.add('open');
}

function renderOnboardSlide() {
  const s = onboardSlides[onboardIndex];
  const isLast = onboardIndex === onboardSlides.length - 1;
  document.getElementById('onboard-slides').innerHTML = '<div style="text-align:center;padding:20px 10px"><div style="font-size:64px;margin-bottom:16px">' + s.icon + '</div><div style="font-family:\'Playfair Display\',serif;font-size:22px;margin-bottom:10px">' + s.title + '</div><div style="font-size:14px;color:var(--text-secondary);line-height:1.6">' + s.body + '</div></div>';
  document.getElementById('onboard-dots').innerHTML = onboardSlides.map((_, i) =>
    '<div style="width:' + (i===onboardIndex?'20px':'8px') + ';height:8px;border-radius:4px;background:' + (i===onboardIndex?'var(--primary)':'var(--border-strong)') + ';transition:all .3s"></div>'
  ).join('');
  document.getElementById('onboard-next').textContent = isLast ? '✓ Get started' : 'Next →';
  document.getElementById('onboard-skip').style.display = isLast ? 'none' : 'flex';
}

window.nextOnboardSlide = function() {
  if (onboardIndex < onboardSlides.length - 1) { onboardIndex++; renderOnboardSlide(); }
  else { finishOnboard(); }
};

window.finishOnboard = function() {
  localStorage.setItem('mm_onboarded', '1');
  cm('m-onboard');
};

function checkOnboarding() {
  if (!localStorage.getItem('mm_onboarded')) setTimeout(showOnboarding, 800);
}

// ── Medicine Autocomplete ──────────────────────────────────────────────────────
const MEDICINE_DB = [
  { name:'Paracetamol', dosage:'500mg', icon:'💊', notes:'Take with water. Max 4g/day.' },
  { name:'Paracetamol', dosage:'1000mg', icon:'💊', notes:'Take with water. Max 4g/day.' },
  { name:'Ibuprofen', dosage:'400mg', icon:'💊', notes:'Take with food.' },
  { name:'Metformin', dosage:'500mg', icon:'💊', notes:'Take with meals.' },
  { name:'Metformin', dosage:'850mg', icon:'💊', notes:'Take with meals.' },
  { name:'Amlodipine', dosage:'5mg', icon:'💊', notes:'Take at same time daily.' },
  { name:'Atorvastatin', dosage:'20mg', icon:'💊', notes:'Take at night.' },
  { name:'Omeprazole', dosage:'20mg', icon:'💊', notes:'Take 30 mins before meal.' },
  { name:'Aspirin', dosage:'100mg', icon:'💊', notes:'Take with food.' },
  { name:'Losartan', dosage:'50mg', icon:'💊', notes:'Take at same time daily.' },
  { name:'Salbutamol', dosage:'100mcg', icon:'🫁', notes:'Shake before use.' },
  { name:'Amoxicillin', dosage:'500mg', icon:'💊', notes:'Complete full course.' },
  { name:'Cetirizine', dosage:'10mg', icon:'💊', notes:'May cause drowsiness.' },
  { name:'Vitamin D3', dosage:'1000 IU', icon:'💊', notes:'Take with fatty meal.' },
  { name:'Vitamin C', dosage:'500mg', icon:'💊', notes:'Take after meals.' },
  { name:'Insulin', dosage:'', icon:'💉', notes:'Rotate injection sites.' },
];

window.medAutocomplete = async function(query) {
  const el = document.getElementById('med-ac');
  const q = query.trim();
  if (!q || q.length < 2) { el.style.display = 'none'; return; }
  const local = MEDICINE_DB.filter(m => m.name.toLowerCase().includes(q.toLowerCase())).slice(0,5);

  try {
    const res = await fetch('https://api.fda.gov/drug/label.json?search=brand_name:' + encodeURIComponent(q) + '+generic_name:' + encodeURIComponent(q) + '&limit=5');
    const data = await res.json();
    const fdaResults = (data.results || []).map(r => ({
      name: r.openfda?.brand_name?.[0] || r.openfda?.generic_name?.[0] || q,
      dosage: r.openfda?.strength?.[0] || '', icon: '💊',
      notes: r.indications_and_usage?.[0]?.substring(0,60) || ''
    })).filter((m,i,arr) => arr.findIndex(x=>x.name===m.name)===i);

    const combined = [...local, ...fdaResults].filter((m,i,arr) => arr.findIndex(x=>x.name.toLowerCase()===m.name.toLowerCase())===i).slice(0,8);
    if (!combined.length) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    el.innerHTML = combined.map(m =>
      '<div onmousedown="selectMedAC(\'' + m.name.replace(/'/g,"\\'") + '\',\'' + (m.dosage||'').replace(/'/g,"\\'") + '\',\'' + (m.notes||'').replace(/'/g,"\\'").substring(0,60) + '\',\'' + m.icon + '\')" class="ac-item">' +
        '<span style="font-size:16px">' + m.icon + '</span>' +
        '<div><div style="font-size:13px;font-weight:600">' + m.name + ' <span style="color:var(--primary);font-size:12px">' + m.dosage + '</span></div>' +
        (m.notes ? '<div style="font-size:11px;color:var(--text-muted)">' + m.notes.substring(0,60) + '</div>' : '') +
      '</div></div>'
    ).join('');
  } catch(e) {
    if (!local.length) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    el.innerHTML = local.map(m =>
      '<div onmousedown="selectMedAC(\'' + m.name + '\',\'' + m.dosage + '\',\'' + m.notes + '\',\'' + m.icon + '\')" class="ac-item"><span style="font-size:16px">' + m.icon + '</span><span style="font-size:13px;font-weight:600;margin-left:8px">' + m.name + ' ' + m.dosage + '</span></div>'
    ).join('');
  }
};

window.selectMedAC = function(name, dosage, notes, icon) {
  document.getElementById('mn').value = name + (dosage ? ' ' + dosage : '');
  document.getElementById('md').value = notes;
  const iconEl = document.getElementById('micon');
  if (icon === '💉') iconEl.value = '💉';
  else if (icon === '🫁') iconEl.value = '🫁';
  else iconEl.value = '💊';
  closeMedAC();
  toast('✅ ' + name + ' selected!');
};

window.closeMedAC = function() {
  const el = document.getElementById('med-ac');
  if (el) el.style.display = 'none';
};

// ── Export PDF ──────────────────────────────────────────────────────────────────
window.exportPDF = function() {
  if (!doses.length) { toast('No dose history to export'); return; }
  const name = currentUser.displayName || currentUser.email.split('@')[0];
  const date = new Date().toLocaleDateString('en-MY', {year:'numeric',month:'long',day:'numeric'});

  let rows = doses.slice(0, 50).map(d => {
    const m = meds.find(x => x.id === d.medId);
    const t = tsToDate(d.takenAt);
    const ts = d.timingStatus || 'on-time';
    const tsLabel = {early:'Early','on-time':'On Time',late:'Late'}[ts];
    return '<tr><td>' + t.toLocaleDateString('en-MY',{day:'numeric',month:'short',year:'numeric'}) + '</td>' +
      '<td>' + (d.medName || m?.name || 'Unknown') + '</td>' +
      '<td>' + (d.scheduledTime || d.medTime || '-') + '</td>' +
      '<td>' + t.toLocaleTimeString('en-MY',{hour:'2-digit',minute:'2-digit'}) + '</td>' +
      '<td>' + tsLabel + '</td><td>' + (d.notes || '-') + '</td></tr>';
  }).join('');

  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>body{font-family:Arial,sans-serif;padding:30px;color:#1a1a2e}h1{color:#0ea5e9;margin-bottom:4px}.sub{color:#64748b;font-size:13px;margin-bottom:24px}table{width:100%;border-collapse:collapse;font-size:12px}th{background:#0ea5e9;color:#fff;padding:8px 10px;text-align:left}td{padding:7px 10px;border-bottom:1px solid #e2e8f0}tr:nth-child(even){background:#f8fafc}</style></head><body>' +
    '<h1>💊 MedMate — Dose History</h1><div class="sub">Patient: ' + name + ' · Generated: ' + date + '</div>' +
    '<table><thead><tr><th>Date</th><th>Medicine</th><th>Scheduled</th><th>Taken at</th><th>Timing</th><th>Notes</th></tr></thead><tbody>' + rows + '</tbody></table></body></html>';

  const blob = new Blob([html], {type:'text/html'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'MedMate_' + name + '_' + new Date().toISOString().slice(0,10) + '.html';
  a.click();
  URL.revokeObjectURL(url);
  toast('✅ Report downloaded!');
};

// ── URL Param: auto-open monitor ───────────────────────────────────────────────
const _mc = new URLSearchParams(location.search).get('monitor');
if (_mc) {
  window.addEventListener('fbready', () => {
    FB.onAuthStateChanged(FB.auth, user => {
      if (user) {
        setTimeout(() => {
          document.querySelectorAll('.nav-item')[3].click();
          document.getElementById('mcode').value = _mc.toUpperCase();
          doMonitor();
        }, 800);
      }
    });
  });
}