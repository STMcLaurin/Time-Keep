/* =========================================================================
   TimeKeep — single-file app. Vanilla JS, localStorage persistence.
   Sections: Utils, Calc engine, NL parser, Store, Auth, Nav, Home,
   Calculate UI, Events (dates), Reminders, Profile, Fullscreen countdown.
   ========================================================================= */

/* ---------------------------- Utils ---------------------------- */
function pad(n){ return String(n).padStart(2,'0'); }
function uid(){ return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2,8); }
function hashStr(s){
  let h = 5381;
  for(let i=0;i<s.length;i++){ h = ((h<<5)+h) + s.charCodeAt(i); h = h & h; }
  return 'h' + Math.abs(h).toString(36);
}
function escapeHtml(s){
  return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function toast(msg, icon){
  const host = document.getElementById('toastHost');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = '<span class="ic">' + (icon||'&#9201;') + '</span><span>' + escapeHtml(msg) + '</span>';
  host.appendChild(el);
  setTimeout(()=>{ el.style.transition='opacity .3s'; el.style.opacity='0'; setTimeout(()=>el.remove(),300); }, 5000);
}
function dateFromInputs(dateStr, timeStr){
  if(!dateStr) return null;
  const t = timeStr && timeStr.length ? timeStr : '00:00';
  const d = new Date(dateStr + 'T' + t + ':00');
  return isNaN(d.getTime()) ? null : d;
}
function fmtDateLong(d){
  return d.toLocaleDateString('en-US', {weekday:'long', year:'numeric', month:'long', day:'numeric'});
}
function fmtDateShort(d){
  return d.toLocaleDateString('en-US', {year:'numeric', month:'short', day:'numeric'});
}
function fmtTime(d){
  return d.toLocaleTimeString('en-US', {hour:'numeric', minute:'2-digit', second:'2-digit'});
}
function todayISODate(){
  const d = new Date();
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
}

/* ---------------------------- Calculation engine ---------------------------- */
const Calc = {
  isLeapYear(y){ return (y%4===0 && y%100!==0) || y%400===0; },
  daysInMonth(y,m){ return new Date(y, m+1, 0).getDate(); },

  // calendar-accurate breakdown between two Date objects (order-independent)
  diffCalendar(a, b){
    let start = a, end = b, negative = false;
    if(start.getTime() > end.getTime()){ const t=start; start=end; end=t; negative = true; }
    let years = end.getFullYear() - start.getFullYear();
    let months = end.getMonth() - start.getMonth();
    let days = end.getDate() - start.getDate();
    let hours = end.getHours() - start.getHours();
    let minutes = end.getMinutes() - start.getMinutes();
    let seconds = end.getSeconds() - start.getSeconds();
    if(seconds < 0){ seconds += 60; minutes--; }
    if(minutes < 0){ minutes += 60; hours--; }
    if(hours < 0){ hours += 24; days--; }
    if(days < 0){
      const prevMonth = new Date(end.getFullYear(), end.getMonth(), 0);
      days += prevMonth.getDate();
      months--;
    }
    if(months < 0){ months += 12; years--; }
    const totalMs = Math.abs(end.getTime() - start.getTime());
    const totalSeconds = Math.floor(totalMs/1000);
    const totalMinutes = Math.floor(totalSeconds/60);
    const totalHours = Math.floor(totalMinutes/60);
    const totalDays = Math.floor(totalHours/24);
    const weeks = Math.floor(totalDays/7);
    const remDays = totalDays % 7;
    return {years,months,days,hours,minutes,seconds,totalMs,totalSeconds,totalMinutes,totalHours,totalDays,weeks,remDays,negative};
  },

  addToDate(date, parts, sign){
    sign = sign || 1;
    const d = new Date(date.getTime());
    const originalDay = d.getDate();
    const setClampedDate = (year, month) => {
      d.setDate(1);
      d.setFullYear(year, month, 1);
      d.setDate(Math.min(originalDay, this.daysInMonth(d.getFullYear(), d.getMonth())));
    };
    if(parts.years){ setClampedDate(d.getFullYear() + sign*parts.years, d.getMonth()); }
    if(parts.months){
      const monthIndex = d.getFullYear()*12 + d.getMonth() + sign*parts.months;
      setClampedDate(Math.floor(monthIndex/12), monthIndex%12);
    }
    const dayOffset = sign * ((parts.weeks||0)*7 + (parts.days||0));
    d.setDate(d.getDate() + dayOffset);
    const msOffset = sign * (((parts.hours||0)*3600 + (parts.minutes||0)*60 + (parts.seconds||0)) * 1000);
    d.setTime(d.getTime() + msOffset);
    return d;
  },

  nthWeekdayOfMonth(year, month, weekday, n){
    // month 0-indexed, weekday 0=Sun. n>0 = nth occurrence, n=-1 = last occurrence
    if(n > 0){
      const first = new Date(year, month, 1);
      const offset = (weekday - first.getDay() + 7) % 7;
      return new Date(year, month, 1 + offset + (n-1)*7);
    } else {
      const last = new Date(year, month+1, 0);
      const offset = (last.getDay() - weekday + 7) % 7;
      return new Date(year, month+1, 0 - offset);
    }
  },

  observedHoliday(d){
    // if Saturday, observe Friday; if Sunday, observe Monday
    const day = d.getDay();
    if(day === 6) return new Date(d.getFullYear(), d.getMonth(), d.getDate()-1);
    if(day === 0) return new Date(d.getFullYear(), d.getMonth(), d.getDate()+1);
    return d;
  },

  usFederalHolidays(year){
    const H = this;
    const list = [
      {name:"New Year's Day", date: H.observedHoliday(new Date(year,0,1))},
      {name:"Martin Luther King Jr. Day", date: H.nthWeekdayOfMonth(year,0,1,3)},
      {name:"Washington's Birthday", date: H.nthWeekdayOfMonth(year,1,1,3)},
      {name:"Memorial Day", date: H.nthWeekdayOfMonth(year,4,1,-1)},
      {name:"Juneteenth", date: H.observedHoliday(new Date(year,5,19))},
      {name:"Independence Day", date: H.observedHoliday(new Date(year,6,4))},
      {name:"Labor Day", date: H.nthWeekdayOfMonth(year,8,1,1)},
      {name:"Columbus Day", date: H.nthWeekdayOfMonth(year,9,1,2)},
      {name:"Veterans Day", date: H.observedHoliday(new Date(year,10,11))},
      {name:"Thanksgiving Day", date: H.nthWeekdayOfMonth(year,10,4,4)},
      {name:"Christmas Day", date: H.observedHoliday(new Date(year,11,25))},
    ];
    return list;
  },

  holidaySet(years, customHolidays){
    const set = new Set();
    years.forEach(y => this.usFederalHolidays(y).forEach(h => set.add(h.date.toDateString())));
    (customHolidays||[]).forEach(h => set.add(new Date(h).toDateString()));
    return set;
  },

  isBusinessDay(d, holidaySet){
    const day = d.getDay();
    if(day===0 || day===6) return false;
    if(holidaySet && holidaySet.has(d.toDateString())) return false;
    return true;
  },

  businessDaysBetween(start, end, excludeHolidays){
    let s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    let e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    let sign = 1;
    if(s > e){ const t=s; s=e; e=t; sign=-1; }
    const years = [];
    for(let y=s.getFullYear(); y<=e.getFullYear(); y++) years.push(y);
    const hset = excludeHolidays ? this.holidaySet(years, []) : null;
    let count = 0;
    const cur = new Date(s);
    cur.setDate(cur.getDate()+1);
    while(cur <= e){
      if(this.isBusinessDay(cur, hset)) count++;
      cur.setDate(cur.getDate()+1);
    }
    return count;
  },

  addBusinessDays(start, n, excludeHolidays){
    const yearSpan = Math.ceil(Math.abs(n)/250) + 1;
    const direction = n >= 0 ? 1 : -1;
    const years = [];
    for(let y=start.getFullYear()- (direction < 0 ? yearSpan : 0); y<=start.getFullYear() + (direction > 0 ? yearSpan : 0); y++) years.push(y);
    const hset = excludeHolidays ? this.holidaySet(years, []) : null;
    const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    let remaining = Math.abs(n);
    const dir = n >= 0 ? 1 : -1;
    while(remaining > 0){
      cur.setDate(cur.getDate()+dir);
      if(this.isBusinessDay(cur, hset)) remaining--;
    }
    return cur;
  },

  ageCalc(dob, now){
    const diff = this.diffCalendar(dob, now);
    let next = new Date(now.getFullYear(), dob.getMonth(), dob.getDate());
    if(next.getTime() < new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime()){
      next = new Date(now.getFullYear()+1, dob.getMonth(), dob.getDate());
    }
    const toNext = this.diffCalendar(now, next);
    return {years:diff.years, months:diff.months, days:diff.days, totalDays:diff.totalDays,
      totalHours:diff.totalHours, nextBirthday: next, daysToNext: toNext.totalDays};
  },

  nextOccurrence(base, recurrence, now){
    const anchor = new Date(base.getTime());
    let d = new Date(anchor.getTime());
    if(d >= now) return d;
    let count = 0;
    const stepDays = {daily:1, weekly:7, biweekly:14}[recurrence.type];
    while(d < now && count < 100000){
      count++;
      if(stepDays || recurrence.type === 'custom'){
        const days = stepDays || Math.max(1, recurrence.customDays||1);
        d = new Date(anchor.getTime());
        d.setDate(d.getDate() + count*days);
      } else if(recurrence.type === 'monthly' || recurrence.type === 'quarterly'){
        const interval = recurrence.type === 'monthly' ? 1 : 3;
        const monthIndex = anchor.getFullYear()*12 + anchor.getMonth() + count*interval;
        const year = Math.floor(monthIndex/12);
        const month = monthIndex%12;
        d = new Date(year, month, Math.min(anchor.getDate(), this.daysInMonth(year, month)), anchor.getHours(), anchor.getMinutes(), anchor.getSeconds(), anchor.getMilliseconds());
      } else if(recurrence.type === 'yearly'){
        const year = anchor.getFullYear()+count;
        d = new Date(year, anchor.getMonth(), Math.min(anchor.getDate(), this.daysInMonth(year, anchor.getMonth())), anchor.getHours(), anchor.getMinutes(), anchor.getSeconds(), anchor.getMilliseconds());
      } else { return d; }
    }
    return d;
  }
};

/* ---------------------------- Natural language parser ---------------------------- */
const NL = {
  parse(text, now){
    const q = text.trim().toLowerCase();
    let m;

    m = q.match(/^(\d+)\s*(day|days|week|weeks|month|months|year|years)\s*(?:and\s*(\d+)\s*(day|days|week|weeks|month|months))?\s*(from now|from today|from|ago)?/);
    if(m && (q.includes('from') || q.includes('ago'))){
      const parts = {years:0,months:0,weeks:0,days:0};
      const unitMap = {day:'days',days:'days',week:'weeks',weeks:'weeks',month:'months',months:'months',year:'years',years:'years'};
      parts[unitMap[m[2]]] += parseInt(m[1],10);
      if(m[3] && m[4]) parts[unitMap[m[4]]] += parseInt(m[3],10);
      const isAgo = q.includes('ago');
      const result = Calc.addToDate(now, parts, isAgo ? -1 : 1);
      return {type:'date', label: isAgo ? 'That date was' : 'That date will be', date: result};
    }

    m = q.match(/how long (?:until|till|to)\s+(.+)/);
    if(m){
      const target = this.tryParseDate(m[1], now);
      if(target){
        const diff = Calc.diffCalendar(now, target);
        return {type:'duration', label: diff.negative ? 'That was' : 'Time remaining', diff, target};
      }
    }

    m = q.match(/how long (?:ago|has it been since)\s*(?:was)?\s*(.+)/);
    if(m){
      const target = this.tryParseDate(m[1], now);
      if(target){
        const diff = Calc.diffCalendar(target, now);
        return {type:'duration', label: 'Time elapsed', diff, target};
      }
    }

    m = q.match(/(?:days?|time) between\s+(.+?)\s+and\s+(.+)/);
    if(m){
      const d1 = this.tryParseDate(m[1], now);
      const d2 = this.tryParseDate(m[2], now);
      if(d1 && d2){
        const diff = Calc.diffCalendar(d1, d2);
        return {type:'duration', label:'Difference', diff, target:d2};
      }
    }

    const asDate = this.tryParseDate(q, now);
    if(asDate){
      const diff = Calc.diffCalendar(now, asDate);
      return {type:'duration', label: diff.negative ? 'That was' : 'Time remaining', diff, target: asDate};
    }

    return null;
  },
  tryParseDate(str, now){
    str = str.trim().replace(/^on\s+/,'').replace(/\?+$/,'');
    if(/christmas/.test(str)){ let y=now.getFullYear(); let d=new Date(y,11,25); if(d<now) d=new Date(y+1,11,25); return d; }
    if(/new year/.test(str)){ let y=now.getFullYear(); let d=new Date(y+1,0,1); return d; }
    const d = new Date(str);
    if(!isNaN(d.getTime())) return d;
    return null;
  }
};

/* ---------------------------- Categories ---------------------------- */
const CATEGORIES = {
  birthday:{label:'Birthday', icon:'&#127874;', color:'brass'},
  anniversary:{label:'Anniversary', icon:'&#10084;', color:'rust'},
  work:{label:'Work', icon:'&#128188;', color:'teal'},
  bill:{label:'Bill', icon:'&#128176;', color:'rust'},
  home:{label:'Home', icon:'&#127968;', color:'teal'},
  travel:{label:'Travel', icon:'&#9992;', color:'brass'},
  school:{label:'School', icon:'&#127891;', color:'teal'},
  event:{label:'Event', icon:'&#127881;', color:'brass'},
  appointment:{label:'Appointment', icon:'&#128197;', color:'teal'},
  deadline:{label:'Deadline', icon:'&#9203;', color:'rust'},
  delivery:{label:'Delivery', icon:'&#128230;', color:'teal'},
  custom:{label:'Custom', icon:'&#128221;', color:'muted'}
};
const REMINDER_OPTIONS = [
  {label:'30 days before', minutes:43200},
  {label:'14 days before', minutes:20160},
  {label:'7 days before', minutes:10080},
  {label:'3 days before', minutes:4320},
  {label:'1 day before', minutes:1440},
  {label:'2 hours before', minutes:120},
  {label:'At the time', minutes:0}
];
const THEMES = [
  {id:'brass', name:'Brass', free:true, accent:'#c9a24b'},
  {id:'teal', name:'Deep teal', free:true, accent:'#4f8b87'},
  {id:'rust', name:'Rust', free:false, accent:'#c1502e'},
  {id:'slate', name:'Slate', free:false, accent:'#8891ab'}
];
const TIMEZONES = ["America/New_York","America/Chicago","America/Denver","America/Los_Angeles","America/Anchorage",
  "Pacific/Honolulu","America/Sao_Paulo","Europe/London","Europe/Paris","Europe/Berlin","Europe/Moscow",
  "Africa/Cairo","Africa/Lagos","Asia/Dubai","Asia/Kolkata","Asia/Shanghai","Asia/Tokyo","Asia/Seoul",
  "Australia/Sydney","Pacific/Auckland","UTC"];

/* ---------------------------- Store (per-user persistence) ---------------------------- */
const Store = {
  userId: null,
  data: null,
  key(){ return 'timekeep_data_' + this.userId; },
  load(userId){
    this.userId = userId;
    const raw = localStorage.getItem(this.key());
    if(raw){
      this.data = JSON.parse(raw);
    } else {
      this.data = {
        events: [],
        settings: { plan:'free', theme:'brass', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' },
        firedReminders: []
      };
      this.save();
    }
    if(!this.data.settings) this.data.settings = { plan:'free', theme:'brass', timezone:'UTC' };
    if(!this.data.firedReminders) this.data.firedReminders = [];
  },
  save(){ localStorage.setItem(this.key(), JSON.stringify(this.data)); },
  isPro(){ return this.data.settings.plan === 'pro'; },
  limits(){ return this.isPro() ? {events: Infinity} : {events: 10}; }
};

/* ---------------------------- Auth ---------------------------- */
const Auth = {
  users(){ return JSON.parse(localStorage.getItem('timekeep_users') || '[]'); },
  saveUsers(u){ localStorage.setItem('timekeep_users', JSON.stringify(u)); },
  currentUser(){
    const id = localStorage.getItem('timekeep_session');
    if(!id) return null;
    return this.users().find(u => u.id === id) || null;
  },
  signup(name, email, password){
    const users = this.users();
    if(users.find(u => u.email.toLowerCase() === email.toLowerCase())){
      throw new Error('An account with that email already exists.');
    }
    const user = { id: uid(), name, email, passHash: hashStr(password) };
    users.push(user);
    this.saveUsers(users);
    localStorage.setItem('timekeep_session', user.id);
    return user;
  },
  login(email, password){
    const users = this.users();
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if(!user || user.passHash !== hashStr(password)){
      throw new Error('That email and password combination doesn\'t match an account.');
    }
    localStorage.setItem('timekeep_session', user.id);
    return user;
  },
  logout(){ localStorage.removeItem('timekeep_session'); },
  deleteAccount(userId){
    const users = this.users().filter(u => u.id !== userId);
    this.saveUsers(users);
    localStorage.removeItem('timekeep_data_' + userId);
    localStorage.removeItem('timekeep_session');
  }
};

const AuthUI = {
  switchTab(tab){
    document.getElementById('tabLogin').classList.toggle('active', tab==='login');
    document.getElementById('tabSignup').classList.toggle('active', tab==='signup');
    document.getElementById('loginForm').classList.toggle('hidden', tab!=='login');
    document.getElementById('signupForm').classList.toggle('hidden', tab!=='signup');
    document.getElementById('authError').classList.add('hidden');
  },
  showError(msg){
    const el = document.getElementById('authError');
    el.textContent = msg;
    el.classList.remove('hidden');
  },
  login(e){
    e.preventDefault();
    try{
      const user = Auth.login(document.getElementById('loginEmail').value, document.getElementById('loginPassword').value);
      App.boot(user);
    }catch(err){ this.showError(err.message); }
  },
  signup(e){
    e.preventDefault();
    try{
      const user = Auth.signup(document.getElementById('suName').value, document.getElementById('suEmail').value, document.getElementById('suPassword').value);
      App.boot(user);
    }catch(err){ this.showError(err.message); }
  },
  demo(){
    let users = Auth.users();
    let user = users.find(u => u.email === 'demo@timekeep.app');
    if(!user){
      user = { id: uid(), name:'Demo', email:'demo@timekeep.app', passHash: hashStr('demo') };
      users.push(user);
      Auth.saveUsers(users);
      localStorage.setItem('timekeep_session', user.id);
      App.boot(user, true);
    } else {
      localStorage.setItem('timekeep_session', user.id);
      App.boot(user);
    }
  },
  logout(){
    Auth.logout();
    location.reload();
  }
};

/* ---------------------------- Navigation ---------------------------- */
const Nav = {
  go(view){
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-'+view).classList.add('active');
    document.querySelectorAll('.rail-item, .tabbar button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    if(view==='dates') EventsUI.render();
    if(view==='reminders') RemindersUI.render();
    if(view==='home') HomeUI.render();
    if(view==='profile') ProfileUI.render();
  }
};

/* ---------------------------- App boot ---------------------------- */
const App = {
  boot(user, seedDemo){
    Store.load(user.id);
    if(seedDemo) Seed.plant();
    document.getElementById('authScreen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('railAvatar').textContent = (user.name||'?').charAt(0).toUpperCase();
    document.getElementById('railName').textContent = user.name;
    document.getElementById('profName').value = user.name;
    document.getElementById('profEmail').value = user.email;
    ThemeUI.apply(Store.data.settings.theme);
    updatePlanChrome();
    populateTimezones();
    EventsUI.initCategoryFilter();
    setDefaultDates();
    HomeUI.render();
    Reminders.init();
    setInterval(Ticker.tick, 1000);
    Ticker.tick();
  }
};

function updatePlanChrome(){
  const pro = Store.isPro();
  document.getElementById('railPlanText').innerHTML = pro ? 'Pro plan <span class="plan-pill pro">Pro</span>' : 'Free plan <span class="plan-pill free">Free</span>';
}

function populateTimezones(){
  const sel = document.getElementById('profTz');
  sel.innerHTML = TIMEZONES.map(tz => '<option value="'+tz+'">'+tz.replace('_',' ')+'</option>').join('');
  sel.value = Store.data.settings.timezone;
}

function setDefaultDates(){
  const t = todayISODate();
  ['diffStartDate','addStartDate','subStartDate','bizStartDate'].forEach(id => { const el=document.getElementById(id); if(el) el.value = t; });
  const end = new Date(); end.setDate(end.getDate()+30);
  document.getElementById('diffEndDate').value = end.getFullYear()+'-'+pad(end.getMonth()+1)+'-'+pad(end.getDate());
}

/* ---------------------------- Ticker (live updates) ---------------------------- */
const Ticker = {
  tick(){
    const now = new Date();
    const homeDateEl = document.getElementById('homeDateStr');
    if(homeDateEl){
      homeDateEl.textContent = fmtDateLong(now);
      document.getElementById('homeTimeStr').textContent = fmtTime(now);
      const tz = Store.data ? Store.data.settings.timezone : Intl.DateTimeFormat().resolvedOptions().timeZone;
      document.getElementById('homeTzStr').textContent = tz;
    }
    document.querySelectorAll('[data-countdown-target]').forEach(el => {
      const target = new Date(el.getAttribute('data-countdown-target'));
      renderChrono(el, target, now);
    });
    if(window.__fsTarget){
      renderChrono(document.getElementById('fsChrono'), window.__fsTarget, now);
    }
    if(Store.data) Reminders.checkDue(now);
    if(document.getElementById('view-home').classList.contains('active')) HomeUI.updateMiniStats(now);
  }
};

function renderChrono(el, target, now){
  if(!el) return;
  const diff = Calc.diffCalendar(now, target);
  const size = el.classList.contains('huge') ? 'huge' : (el.classList.contains('tiny') ? 'tiny' : '');
  const totalDaysDisplay = diff.totalDays;
  el.innerHTML =
    cell(totalDaysDisplay, 'days') + sep() +
    cell(pad(diff.hours), 'hrs') + sep() +
    cell(pad(diff.minutes), 'min') + sep() +
    cell(pad(diff.seconds), 'sec', true);
  function cell(v,l,pulse){ return '<div class="cell'+(pulse?' pulse':'')+'"><span class="v">'+v+'</span><span class="l">'+l+'</span></div>'; }
  function sep(){ return '<span class="sep">:</span>'; }
}

/* ---------------------------- Home ---------------------------- */
const HomeUI = {
  render(){
    const user = Auth.currentUser();
    document.getElementById('homeGreeting').textContent = 'Welcome back, ' + (user?user.name:'') + '. Here\'s what\'s ahead.';
    this.renderBanner();
    this.renderUpcoming();
  },
  renderBanner(){
    const el = document.getElementById('upgradeBannerHome');
    el.innerHTML = Store.isPro() ? '' : upgradeBannerHtml();
  },
  updateMiniStats(now){
    const el = document.getElementById('homeMiniStats');
    if(!el) return;
    const events = upcomingEvents();
    if(events.length === 0){ el.innerHTML = ''; return; }
    renderChrono(el, new Date(events[0].targetISO), now);
  },
  renderUpcoming(){
    const grid = document.getElementById('homeUpcoming');
    const events = upcomingEvents().slice(0,6);
    if(events.length === 0){
      grid.innerHTML = '<div class="empty" style="grid-column:1/-1;"><div class="big-ic">&#9201;</div><h4>Nothing on the horizon yet</h4><p>Add a birthday, bill, deadline, or trip to see it counting down here.</p><button class="btn btn-brass" onclick="EventsUI.openEditor()">+ New event</button></div>';
      return;
    }
    grid.innerHTML = events.map(ev => eventCardHtml(ev)).join('');
  }
};

function upcomingEvents(){
  const now = new Date();
  return (Store.data.events||[])
    .map(ev => ({...ev, targetISO: resolveEventDate(ev, now).toISOString()}))
    .filter(ev => new Date(ev.targetISO) >= now || ev.recurrence.type !== 'none')
    .sort((a,b) => new Date(a.targetISO) - new Date(b.targetISO));
}

function resolveEventDate(ev, now){
  const base = new Date(ev.targetISO);
  if(ev.recurrence && ev.recurrence.type !== 'none'){
    return Calc.nextOccurrence(base, ev.recurrence, now);
  }
  return base;
}

function eventCardHtml(ev){
  const cat = CATEGORIES[ev.category] || CATEGORIES.custom;
  return '<div class="event-card" onclick="EventsUI.openFullscreen(\''+ev.id+'\')">'+
    '<div class="event-top">'+
      '<div><span class="event-cat">'+cat.icon+' '+cat.label+'</span>'+
      '<div class="event-name">'+escapeHtml(ev.title)+'</div>'+
      '<div class="event-date">'+fmtDateShort(new Date(ev.targetISO))+'</div></div>'+
      '<div class="event-actions" onclick="event.stopPropagation()">'+
        '<button class="icon-btn" title="Edit" onclick="EventsUI.openEditor(\''+ev.id+'\')">&#9998;</button>'+
        '<button class="icon-btn" title="Delete" onclick="EventsUI.remove(\''+ev.id+'\')">&#128465;</button>'+
      '</div>'+
    '</div>'+
    '<div class="chrono tiny" data-countdown-target="'+ev.targetISO+'"></div>'+
  '</div>';
}

function upgradeBannerHtml(){
  return '<div class="upgrade-banner"><p><strong>You\'re on the Free plan.</strong> Upgrade to Pro for unlimited events, recurring reminders, business-day tools, and every theme.</p><button class="btn btn-brass btn-sm" onclick="Nav.go(\'profile\')">See plans</button></div>';
}

/* ---------------------------- Calculate ---------------------------- */
const CalcUI = {
  switchTool(tool){
    document.querySelectorAll('.tool-tab').forEach(t => t.classList.toggle('active', t.dataset.tool===tool));
    document.querySelectorAll('.tool-panel').forEach(p => p.classList.toggle('active', p.id==='tool-'+tool));
  },
  swapDiff(){
    const sD=document.getElementById('diffStartDate'), sT=document.getElementById('diffStartTime');
    const eD=document.getElementById('diffEndDate'), eT=document.getElementById('diffEndTime');
    [sD.value,eD.value]=[eD.value,sD.value];
    [sT.value,eT.value]=[eT.value,sT.value];
  },
  runDiff(){
    const start = dateFromInputs(document.getElementById('diffStartDate').value, document.getElementById('diffStartTime').value);
    const end = dateFromInputs(document.getElementById('diffEndDate').value, document.getElementById('diffEndTime').value);
    if(!start || !end){ toast('Enter both a start and end date.'); return; }
    const diff = Calc.diffCalendar(start, end);
    document.getElementById('diffResult').innerHTML = resultBoxHtml(
      diff.years+'y '+diff.months+'m '+diff.days+'d, '+diff.hours+'h '+diff.minutes+'m '+diff.seconds+'s' + (diff.negative ? ' (end is before start)' : ''),
      diff
    );
  },
  runAdd(sign){
    const prefix = sign===1 ? 'add' : 'sub';
    const start = dateFromInputs(document.getElementById(prefix+'StartDate').value, document.getElementById(prefix+'StartTime').value);
    if(!start){ toast('Pick a starting date.'); return; }
    const parts = {
      years: Number(document.getElementById(prefix+'Years').value)||0,
      months: Number(document.getElementById(prefix+'Months').value)||0,
      weeks: Number(document.getElementById(prefix+'Weeks').value)||0,
      days: Number(document.getElementById(prefix+'Days').value)||0,
      hours: Number(document.getElementById(prefix+'Hours').value)||0,
      minutes: Number(document.getElementById(prefix+'Minutes').value)||0,
      seconds: Number(document.getElementById(prefix+'Seconds').value)||0
    };
    const result = Calc.addToDate(start, parts, sign);
    const targetId = sign===1 ? 'addResult' : 'subtractResult';
    document.getElementById(targetId).innerHTML =
      '<div class="result-box"><div class="result-headline">'+fmtDateLong(result)+' — '+fmtTime(result)+'</div>'+
      '<div class="hint">'+(sign===1?'Started from':'Counted back from')+' '+fmtDateLong(start)+'</div></div>';
  },
  runElapsed(){
    const target = dateFromInputs(document.getElementById('elapsedDate').value, document.getElementById('elapsedTime').value);
    if(!target){ toast('Pick a date.'); return; }
    const diff = Calc.diffCalendar(target, new Date());
    document.getElementById('elapsedResult').innerHTML = resultBoxHtml(
      diff.years+' years, '+diff.months+' months, '+diff.days+' days', diff
    );
  },
  runAge(){
    const dobStr = document.getElementById('ageDob').value;
    if(!dobStr){ toast('Pick a date of birth.'); return; }
    const dob = new Date(dobStr+'T00:00:00');
    if(dob > new Date()){ toast('Date of birth cannot be in the future.'); return; }
    const age = Calc.ageCalc(dob, new Date());
    document.getElementById('ageResult').innerHTML =
      '<div class="result-box"><div class="result-headline">'+age.years+' years, '+age.months+' months, '+age.days+' days</div>'+
      '<div class="result-grid">'+
        resultUnit(age.totalDays.toLocaleString(),'Total days')+
        resultUnit(age.totalHours.toLocaleString(),'Total hours')+
        resultUnit(fmtDateShort(age.nextBirthday),'Next birthday')+
        resultUnit(age.daysToNext+' days','Until next birthday')+
      '</div></div>';
  },
  toggleBizMode(){
    const mode = document.getElementById('bizMode').value;
    document.getElementById('bizEndWrap').classList.toggle('hidden', mode!=='between');
    document.getElementById('bizNWrap').classList.toggle('hidden', mode!=='addn');
  },
  runBizDays(){
    if(!Store.isPro()){ toast('Business-day tools are a Pro feature.'); return; }
    const startStr = document.getElementById('bizStartDate').value;
    if(!startStr){ toast('Pick a start date.'); return; }
    const start = new Date(startStr+'T00:00:00');
    const mode = document.getElementById('bizMode').value;
    const excludeHolidays = document.getElementById('bizHolidays').checked;
    if(mode === 'between'){
      const endStr = document.getElementById('bizEndDate').value;
      if(!endStr){ toast('Pick an end date.'); return; }
      const end = new Date(endStr+'T00:00:00');
      const n = Calc.businessDaysBetween(start, end, excludeHolidays);
      document.getElementById('bizResult').innerHTML = '<div class="result-box"><div class="result-headline">'+n+' business days</div><div class="hint">Between '+fmtDateShort(start)+' and '+fmtDateShort(end)+(excludeHolidays?', excluding US federal holidays':'')+'</div></div>';
    } else {
      const n = Number(document.getElementById('bizN').value)||0;
      const result = Calc.addBusinessDays(start, n, excludeHolidays);
      document.getElementById('bizResult').innerHTML = '<div class="result-box"><div class="result-headline">'+fmtDateLong(result)+'</div><div class="hint">'+Math.abs(n)+' business days '+(n>=0?'after':'before')+' '+fmtDateShort(start)+(excludeHolidays?', excluding US federal holidays':'')+'</div></div>';
    }
  },
  runNL(){
    const q = document.getElementById('nlInput').value;
    if(!q.trim()){ toast('Type a question first.'); return; }
    const res = NL.parse(q, new Date());
    const box = document.getElementById('nlResult');
    if(!res){ box.innerHTML = '<div class="result-box"><div class="hint">Couldn\'t parse that one — try a phrasing like "45 days from today" or "how long until December 25, 2026".</div></div>'; return; }
    if(res.type === 'date'){
      box.innerHTML = '<div class="result-box"><div class="result-headline">'+res.label+' '+fmtDateLong(res.date)+'</div></div>';
    } else {
      box.innerHTML = resultBoxHtml(res.label+': '+res.diff.years+'y '+res.diff.months+'m '+res.diff.days+'d '+res.diff.hours+'h '+res.diff.minutes+'m', res.diff);
    }
  }
};

function resultUnit(v,l){ return '<div class="result-unit"><div class="v">'+v+'</div><div class="l">'+l+'</div></div>'; }
function resultBoxHtml(headline, diff){
  return '<div class="result-box"><div class="result-headline">'+headline+'</div>'+
    '<div class="result-grid">'+
      resultUnit(diff.weeks+'w '+diff.remDays+'d','Weeks')+
      resultUnit(diff.totalDays.toLocaleString(),'Total days')+
      resultUnit(diff.totalHours.toLocaleString(),'Total hours')+
      resultUnit(diff.totalMinutes.toLocaleString(),'Total minutes')+
    '</div></div>';
}

/* ---------------------------- Events (Important Dates) ---------------------------- */
const EventsUI = {
  activeCategory: 'all',
  initCategoryFilter(){
    const el = document.getElementById('categoryFilter');
    let html = '<button class="chip active" data-cat="all" onclick="EventsUI.filterCategory(\'all\')">All</button>';
    html += Object.keys(CATEGORIES).map(k => '<button class="chip" data-cat="'+k+'" onclick="EventsUI.filterCategory(\''+k+'\')">'+CATEGORIES[k].icon+' '+CATEGORIES[k].label+'</button>').join('');
    el.innerHTML = html;
  },
  filterCategory(cat){
    this.activeCategory = cat;
    document.querySelectorAll('#categoryFilter .chip').forEach(c => c.classList.toggle('active', c.dataset.cat===cat));
    this.render();
  },
  render(){
    document.getElementById('upgradeBannerDates').innerHTML = Store.isPro() ? '' : upgradeBannerHtml();
    const grid = document.getElementById('datesGrid');
    let events = upcomingEvents();
    if(this.activeCategory !== 'all') events = events.filter(e => e.category === this.activeCategory);
    if(events.length === 0){
      grid.innerHTML = '<div class="empty" style="grid-column:1/-1;"><div class="big-ic">&#128197;</div><h4>No events in this view</h4><p>Track birthdays, bills, deadlines, trips — anything with a date.</p><button class="btn btn-brass" onclick="EventsUI.openEditor()">+ New event</button></div>';
      return;
    }
    grid.innerHTML = events.map(ev => eventCardHtml(ev)).join('');
  },
  openEditor(id){
    const limits = Store.limits();
    if(!id && Store.data.events.length >= limits.events){
      toast('Free plan is capped at '+limits.events+' saved events. Upgrade to Pro for unlimited.');
      Nav.go('profile');
      return;
    }
    const ev = id ? Store.data.events.find(e => e.id===id) : null;
    const isEdit = !!ev;
    const catOptions = Object.keys(CATEGORIES).map(k => '<option value="'+k+'" '+(ev&&ev.category===k?'selected':'')+'>'+CATEGORIES[k].label+'</option>').join('');
    const recOptions = [['none','Does not repeat'],['daily','Daily'],['weekly','Weekly'],['biweekly','Every 2 weeks'],['monthly','Monthly'],['quarterly','Quarterly'],['yearly','Yearly'],['custom','Custom interval']]
      .map(([v,l]) => '<option value="'+v+'" '+(ev&&ev.recurrence.type===v?'selected':'')+'>'+l+'</option>').join('');
    const targetDate = ev ? new Date(ev.targetISO) : new Date(Date.now()+7*86400000);
    const dStr = targetDate.getFullYear()+'-'+pad(targetDate.getMonth()+1)+'-'+pad(targetDate.getDate());
    const tStr = pad(targetDate.getHours())+':'+pad(targetDate.getMinutes());
    const remindersChecked = ev ? (ev.reminders||[]) : [1440,60];

    const html =
    '<div class="modal-veil" id="editorVeil" onclick="if(event.target===this) EventsUI.closeEditor()">'+
      '<div class="modal">'+
        '<div class="modal-head"><h3>'+(isEdit?'Edit event':'New event')+'</h3><button class="icon-btn" onclick="EventsUI.closeEditor()">&#10005;</button></div>'+
        '<div class="field"><label>Event name</label><input type="text" id="evTitle" placeholder="e.g. Mom\'s birthday" value="'+(ev?escapeHtml(ev.title):'')+'"></div>'+
        '<div class="field-row"><div class="field"><label>Date</label><input type="date" id="evDate" value="'+dStr+'"></div><div class="field"><label>Time</label><input type="time" id="evTime" value="'+tStr+'"></div></div>'+
        '<div class="field"><label>Category</label><select id="evCategory">'+catOptions+'</select></div>'+
        '<div class="field"><label>Repeats</label><select id="evRecurrence" onchange="EventsUI.toggleCustomRecurrence()">'+recOptions+'</select></div>'+
        '<div class="field hidden" id="evCustomDaysWrap"><label>Repeat every N days</label><input type="number" id="evCustomDays" value="'+(ev&&ev.recurrence.customDays?ev.recurrence.customDays:14)+'" min="1"></div>'+
        '<div class="field"><label>Remind me</label><div class="chip-row" id="evReminders">'+
          REMINDER_OPTIONS.map(r => '<button type="button" class="chip'+(remindersChecked.includes(r.minutes)?' active':'')+'" data-min="'+r.minutes+'" onclick="EventsUI.toggleReminderChip(this)">'+r.label+'</button>').join('')+
        '</div></div>'+
        '<div class="field"><label>Notes</label><textarea id="evNotes" placeholder="Optional">'+(ev&&ev.notes?escapeHtml(ev.notes):'')+'</textarea></div>'+
        '<div class="modal-foot">'+(isEdit?'<button class="btn btn-danger" onclick="EventsUI.remove(\''+ev.id+'\');EventsUI.closeEditor()">Delete</button>':'<span></span>')+
          '<div style="display:flex;gap:10px;"><button class="btn" onclick="EventsUI.closeEditor()">Cancel</button><button class="btn btn-brass" onclick="EventsUI.saveEditor('+(isEdit?"'"+ev.id+"'":'null')+')">Save event</button></div>'+
        '</div>'+
      '</div>'+
    '</div>';
    document.body.insertAdjacentHTML('beforeend', html);
    if(ev && ev.recurrence.type==='custom') document.getElementById('evCustomDaysWrap').classList.remove('hidden');
  },
  toggleCustomRecurrence(){
    document.getElementById('evCustomDaysWrap').classList.toggle('hidden', document.getElementById('evRecurrence').value !== 'custom');
  },
  toggleReminderChip(btn){ btn.classList.toggle('active'); },
  closeEditor(){ const v = document.getElementById('editorVeil'); if(v) v.remove(); },
  saveEditor(id){
    const title = document.getElementById('evTitle').value.trim();
    if(!title){ toast('Give the event a name.'); return; }
    const dateVal = document.getElementById('evDate').value;
    const timeVal = document.getElementById('evTime').value || '09:00';
    const target = dateFromInputs(dateVal, timeVal);
    if(!target){ toast('Pick a valid date.'); return; }
    const reminders = Array.from(document.querySelectorAll('#evReminders .chip.active')).map(c => Number(c.dataset.min));
    const recType = document.getElementById('evRecurrence').value;
    const recurrence = { type: recType, customDays: recType==='custom' ? Number(document.getElementById('evCustomDays').value)||14 : null };
    const payload = {
      title, category: document.getElementById('evCategory').value,
      targetISO: target.toISOString(), recurrence, reminders,
      notes: document.getElementById('evNotes').value.trim()
    };
    if(id){
      const idx = Store.data.events.findIndex(e => e.id===id);
      Store.data.events[idx] = {...Store.data.events[idx], ...payload};
    } else {
      Store.data.events.push({ id: uid(), ...payload });
    }
    Store.save();
    this.closeEditor();
    HomeUI.render();
    this.render();
    toast(id ? 'Event updated.' : 'Event saved.', '&#10003;');
  },
  remove(id){
    Store.data.events = Store.data.events.filter(e => e.id !== id);
    Store.save();
    HomeUI.render();
    this.render();
    RemindersUI.render();
  },
  openFullscreen(id){
    const ev = Store.data.events.find(e => e.id===id);
    if(!ev) return;
    const now = new Date();
    const target = resolveEventDate(ev, now);
    window.__fsTarget = target;
    const cat = CATEGORIES[ev.category] || CATEGORIES.custom;
    const html =
      '<div class="fs-veil" id="fsVeil">'+
        '<button class="icon-btn fs-close" onclick="EventsUI.closeFullscreen()">&#10005;</button>'+
        '<div class="fs-cat">'+cat.icon+' '+cat.label+'</div>'+
        '<div class="fs-name">'+escapeHtml(ev.title)+'</div>'+
        '<div class="chrono huge" id="fsChrono"></div>'+
        '<div class="hint">'+fmtDateLong(target)+' at '+fmtTime(target)+'</div>'+
      '</div>';
    document.body.insertAdjacentHTML('beforeend', html);
    renderChrono(document.getElementById('fsChrono'), target, now);
  },
  closeFullscreen(){
    const v = document.getElementById('fsVeil'); if(v) v.remove();
    window.__fsTarget = null;
  }
};

/* ---------------------------- Reminders ---------------------------- */
const Reminders = {
  permission: 'default',
  init(){
    this.permission = ('Notification' in window) ? Notification.permission : 'unsupported';
    RemindersUI.updateButton();
  },
  requestPermission(){
    if(!('Notification' in window)){ toast('This browser doesn\'t support notifications — TimeKeep will still show in-app alerts.'); return; }
    Notification.requestPermission().then(p => { this.permission = p; RemindersUI.updateButton(); if(p==='granted') toast('Notifications enabled.','&#10003;'); });
  },
  checkDue(now){
    (Store.data.events||[]).forEach(ev => {
      const target = resolveEventDate(ev, now);
      (ev.reminders||[]).forEach(min => {
        const fireTime = new Date(target.getTime() - min*60000);
        const key = ev.id + ':' + target.toISOString() + ':' + min;
        if(now >= fireTime && now.getTime() - fireTime.getTime() < 60000 && !Store.data.firedReminders.includes(key)){
          Store.data.firedReminders.push(key);
          if(Store.data.firedReminders.length > 500) Store.data.firedReminders = Store.data.firedReminders.slice(-300);
          Store.save();
          const msg = ev.title + ' — ' + (min===0 ? 'happening now' : 'in ' + reminderLabel(min));
          toast(msg, '&#128276;');
          if(this.permission === 'granted'){
            try{ new Notification('TimeKeep', {body: msg}); }catch(e){}
          }
          RemindersUI.render();
        }
      });
    });
  }
};
function reminderLabel(min){
  const opt = REMINDER_OPTIONS.find(r => r.minutes===min);
  return opt ? opt.label.replace(' before','') : min+' min';
}
const RemindersUI = {
  updateButton(){
    const btn = document.getElementById('notifBtn');
    const status = document.getElementById('notifStatusText');
    if(!btn) return;
    if(Reminders.permission === 'granted'){ btn.textContent = 'Enabled'; btn.disabled=false; status.textContent='You\'ll get a browser notification and an in-app alert when a reminder fires.'; }
    else if(Reminders.permission === 'denied'){ btn.textContent = 'Blocked in browser settings'; status.textContent='Notifications are blocked — TimeKeep will still show in-app alerts while it\'s open.'; }
    else { btn.textContent = 'Enable notifications'; status.textContent='Turn these on to get alerts when a reminder fires while TimeKeep is open.'; }
  },
  render(){
    this.updateButton();
    const now = new Date();
    const rows = [];
    (Store.data.events||[]).forEach(ev => {
      const target = resolveEventDate(ev, now);
      (ev.reminders||[]).forEach(min => {
        const fireTime = new Date(target.getTime() - min*60000);
        if(fireTime >= now){
          rows.push({title: ev.title, category: ev.category, fireTime, label: min===0?'At the time':reminderLabel(min)+' before'});
        }
      });
    });
    rows.sort((a,b) => a.fireTime - b.fireTime);
    const list = document.getElementById('reminderList');
    if(rows.length === 0){
      list.innerHTML = '<div class="empty"><div class="big-ic">&#128276;</div><h4>No reminders scheduled</h4><p>Add reminders when you create or edit an event.</p></div>';
      return;
    }
    list.innerHTML = rows.slice(0,40).map(r => {
      const cat = CATEGORIES[r.category] || CATEGORIES.custom;
      return '<div class="row-item"><div><div class="row-main">'+cat.icon+' '+escapeHtml(r.title)+'</div><div class="row-sub">'+r.label+' · fires '+fmtDateShort(r.fireTime)+' at '+fmtTime(r.fireTime)+'</div></div></div>';
    }).join('');
  }
};

/* ---------------------------- Profile ---------------------------- */
const ProfileUI = {
  render(){
    const user = Auth.currentUser();
    document.getElementById('profName').value = user.name;
    document.getElementById('profEmail').value = user.email;
    document.getElementById('profTz').value = Store.data.settings.timezone;
    document.getElementById('planDescription').innerHTML = Store.isPro()
      ? 'You\'re on <strong>TimeKeep Pro</strong>. Unlimited events, recurring reminders, business-day and holiday tools, and every theme.'
      : 'You\'re on the <strong>Free</strong> plan — 10 saved events, unlimited calculators, basic themes.';
    document.getElementById('planActionArea').innerHTML = Store.isPro()
      ? '<button class="btn" onclick="ProfileUI.downgrade()">Switch back to Free</button>'
      : '<button class="btn btn-brass" onclick="ProfileUI.upgrade()">Upgrade to Pro</button>';
    this.renderThemes();
  },
  renderThemes(){
    const grid = document.getElementById('themeGrid');
    grid.innerHTML = THEMES.map(t => {
      const locked = !t.free && !Store.isPro();
      return '<div><div class="theme-swatch'+(Store.data.settings.theme===t.id?' selected':'')+'" style="background:'+t.accent+'22;border-color:'+(Store.data.settings.theme===t.id?t.accent:'var(--line)')+';" onclick="ProfileUI.setTheme(\''+t.id+'\','+locked+')">'+(locked?'<span class="lock">&#128274;</span>':'')+'</div><div class="hint" style="text-align:center;margin-top:4px;">'+t.name+'</div></div>';
    }).join('');
  },
  setTheme(id, locked){
    if(locked){ toast('That theme is part of TimeKeep Pro.'); return; }
    Store.data.settings.theme = id;
    Store.save();
    ThemeUI.apply(id);
    this.renderThemes();
  },
  save(){
    const users = Auth.users();
    const idx = users.findIndex(u => u.id===Store.userId);
    users[idx].name = document.getElementById('profName').value.trim() || users[idx].name;
    Auth.saveUsers(users);
    Store.data.settings.timezone = document.getElementById('profTz').value;
    Store.save();
    document.getElementById('railName').textContent = users[idx].name;
    document.getElementById('railAvatar').textContent = users[idx].name.charAt(0).toUpperCase();
    toast('Profile saved.', '&#10003;');
  },
  upgrade(){
    Store.data.settings.plan = 'pro';
    Store.save();
    updatePlanChrome();
    this.render();
    HomeUI.render();
    EventsUI.render();
    toast('Welcome to TimeKeep Pro.', '&#11088;');
  },
  downgrade(){
    Store.data.settings.plan = 'free';
    Store.save();
    updatePlanChrome();
    this.render();
    HomeUI.render();
    EventsUI.render();
    toast('You\'re back on the Free plan.');
  },
  deleteAccount(){
    if(!confirm('This permanently deletes your account and all saved events on this device. This can\'t be undone. Continue?')) return;
    Auth.deleteAccount(Store.userId);
    location.reload();
  }
};

const ThemeUI = {
  apply(id){
    const t = THEMES.find(x => x.id===id) || THEMES[0];
    document.documentElement.style.setProperty('--brass', t.accent);
    const dim = shadeColor(t.accent, -30);
    document.documentElement.style.setProperty('--brass-dim', dim);
  }
};
function shadeColor(hex, percent){
  const num = parseInt(hex.slice(1),16);
  let r = (num>>16) + Math.round(2.55*percent);
  let g = ((num>>8)&0xff) + Math.round(2.55*percent);
  let b = (num&0xff) + Math.round(2.55*percent);
  r=Math.max(0,Math.min(255,r)); g=Math.max(0,Math.min(255,g)); b=Math.max(0,Math.min(255,b));
  return '#' + (r<<16|g<<8|b).toString(16).padStart(6,'0');
}

/* ---------------------------- Demo seed ---------------------------- */
const Seed = {
  plant(){
    const now = new Date();
    const mk = (days, title, category, recurrence, reminders, hours) => {
      const d = new Date(now.getTime() + days*86400000);
      d.setHours(hours||10,0,0,0);
      return { id: uid(), title, category, targetISO: d.toISOString(), recurrence: recurrence||{type:'none',customDays:null}, reminders: reminders||[1440,60], notes:'' };
    };
    Store.data.events = [
      mk(24, "Mom's birthday", 'birthday', {type:'yearly',customDays:null}, [1440,120]),
      mk(46, 'Beach vacation', 'travel', {type:'none',customDays:null}, [43200,1440]),
      mk(5, 'Rent due', 'bill', {type:'monthly',customDays:null}, [4320,1440]),
      mk(72, 'Wedding anniversary', 'anniversary', {type:'yearly',customDays:null}, [1440]),
      mk(138, 'Christmas', 'event', {type:'yearly',customDays:null}, [10080,1440]),
      mk(9, 'Client proposal due', 'deadline', {type:'none',customDays:null}, [1440,120,0])
    ];
    Store.save();
  }
};

/* ---------------------------- Boot check ---------------------------- */
(function init(){
  const user = Auth.currentUser();
  if(user){ App.boot(user); }
})();
