/* PodLog app — UI wiring. Requires scoring.js, store.js. */
(function () {
  'use strict';
  const S = window.PodLogScoring;
  const { Store, COLORS, uid, todayISO } = window.PodLogStore;

  const $ = id => document.getElementById(id);
  const $$ = (sel, r) => Array.from((r || document).querySelectorAll(sel));

  // ---------- helpers ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function fmtDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  function fmtDateLong(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function playerName(id) { const p = Store.state.players.find(p => p.id === id); return p ? p.name : '?'; }
  function initials(name) { return (name || '?').trim().charAt(0).toUpperCase(); }

  function show(id) {
    $$('.screen').forEach(s => s.classList.add('hidden'));
    $(id).classList.remove('hidden');
    window.scrollTo(0, 0);
  }

  // ---------- theme + pod color ----------
  function applyTheme() {
    const t = Store.state.settings.theme || 'system';
    let dark = false;
    if (t === 'dark') dark = true;
    else if (t === 'system') dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    $$('#set-theme .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === t));
  }
  function applyPodColor() {
    const c = (Store.state.pod && Store.state.pod.color) || '#3E2FDC';
    document.documentElement.style.setProperty('--pod', c);
  }

  // ---------- CREATE FLOW ----------
  const draft = { name: '', iconDataUrl: null, glyph: null, color: '#3E2FDC', count: 6, players: [], len: 'games', games: 20, start: '', end: '' };

  function swatchRow(el, sel, cb) {
    el.innerHTML = '';
    COLORS.forEach(c => {
      const b = document.createElement('button');
      b.style.background = c.hex; b.title = c.name;
      b.setAttribute('aria-label', c.name);
      if (c.hex === sel) b.classList.add('sel');
      b.onclick = () => { cb(c.hex); swatchRow(el, c.hex, cb); };
      el.appendChild(b);
    });
  }

  function initCreate1() {
    swatchRow($('c1-colors'), draft.color, hex => { draft.color = hex; });
    const glyphs = ['◆', '●', '▲', '■', '♛', '⬟', '⬢', '✦', '☾', '⚑', '❖', '⬣'];
    const gg = $('c1-glyphs');
    gg.innerHTML = '';
    glyphs.forEach(g => {
      const b = document.createElement('button');
      b.textContent = g;
      b.onclick = () => {
        draft.glyph = g; draft.iconDataUrl = null;
        $$('#c1-glyphs button').forEach(x => x.classList.remove('sel'));
        b.classList.add('sel');
        $('c1-upload').classList.remove('sel'); $('c1-generic').classList.add('sel');
      };
      gg.appendChild(b);
    });
    $('c1-generic').onclick = () => { gg.classList.toggle('hidden'); };
    $('c1-upload').onclick = () => $('c1-file').click();
    $('c1-file').onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        draft.iconDataUrl = r.result; draft.glyph = null;
        $('c1-upload').classList.add('sel'); $('c1-generic').classList.remove('sel');
        gg.classList.add('hidden');
      };
      r.readAsDataURL(f);
    };
    $('c1-continue').onclick = () => {
      draft.name = $('c1-name').value.trim() || 'My Pod';
      show('s-c2'); renderCreate2();
    };
  }

  function renderCreate2() {
    $('c2-count').textContent = draft.count;
    const bad = draft.count < 4;
    $('c2-count').classList.toggle('bad', bad);
    $('c2-warn').classList.toggle('hidden', !bad);
    $('c2-continue').disabled = bad;
    $('c2-continue').style.opacity = bad ? .4 : 1;
    $('c2-minus').disabled = draft.count <= 1;
    $('c2-plus').disabled = draft.count >= 8;
    while (draft.players.length < draft.count) draft.players.push({ name: '', nickname: '', photo: null });
    draft.players.length = draft.count;
    const rows = $('c2-rows'); rows.innerHTML = '';
    draft.players.forEach((p, i) => {
      const row = document.createElement('div'); row.className = 'player-row';
      const av = document.createElement('button'); av.className = 'avatar';
      av.innerHTML = p.photo ? '<img src="' + p.photo + '">' : esc(initials(p.name) === '?' ? String(i + 1) : p.name);
      av.title = 'Add photo';
      av.onclick = () => {
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
        inp.onchange = () => {
          const f = inp.files[0]; if (!f) return;
          const r = new FileReader();
          r.onload = () => { p.photo = r.result; renderCreate2(); };
          r.readAsDataURL(f);
        };
        inp.click();
      };
      const nm = document.createElement('input'); nm.className = 'field'; nm.placeholder = 'Player ' + (i + 1); nm.value = p.name;
      nm.oninput = () => { p.name = nm.value; };
      const nn = document.createElement('input'); nn.className = 'field'; nn.placeholder = 'Nickname (optional)'; nm.style.marginTop = '0';
      nn.style.maxWidth = '38%'; nn.value = p.nickname; nn.oninput = () => { p.nickname = nn.value; };
      row.appendChild(av); row.appendChild(nm); row.appendChild(nn);
      rows.appendChild(row);
    });
  }

  function initCreate2() {
    $('c2-minus').onclick = () => { if (draft.count > 1) { draft.count--; renderCreate2(); } };
    $('c2-plus').onclick = () => { if (draft.count < 8) { draft.count++; renderCreate2(); } };
    $('c2-continue').onclick = () => {
      if (draft.count < 4) return;
      draft.players.forEach((p, i) => { if (!p.name.trim()) p.name = 'Player ' + (i + 1); });
      show('s-c3');
    };
  }

  function initCreate3() {
    $$('#s-c3 .seg-btn').forEach(b => b.onclick = () => {
      $$('#s-c3 .seg-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      draft.len = b.dataset.len;
      $('c3-games-wrap').classList.toggle('hidden', draft.len !== 'games');
      $('c3-dates-wrap').classList.toggle('hidden', draft.len !== 'dates');
    });
    $('c3-continue').onclick = () => {
      const name = $('c3-name').value.trim() || 'Season 1';
      if (draft.len === 'games') {
        draft.games = Math.max(1, parseInt($('c3-games').value, 10) || 20);
      } else {
        draft.start = $('c3-start').value || todayISO();
        draft.end = $('c3-end').value || todayISO();
      }
      renderCreate4(name); show('s-c4');
    };
  }

  function renderCreate4(seasonName) {
    draft.seasonName = seasonName;
    const iconHtml = draft.iconDataUrl
      ? '<img src="' + draft.iconDataUrl + '">'
      : esc(draft.glyph || initials(draft.name));
    $('c4-card').innerHTML =
      '<div class="pod-head"><div class="pod-icon" style="background:' + esc(draft.color) + '">' + iconHtml + '</div>' +
      '<div><h2>' + esc(draft.name) + '</h2><p class="muted">' + draft.count + ' players</p></div></div>';
    $('c4-players').textContent = draft.players.map(p => p.nickname ? p.name + ' "' + p.nickname + '"' : p.name).join(' · ');
    $('c4-season').innerHTML = '<p style="margin:0;font-weight:600">' + esc(seasonName) + '</p>' +
      '<p class="muted" style="margin:4px 0 0">' + (draft.len === 'games' ? draft.games + ' games' : fmtDate(draft.start) + ' – ' + fmtDate(draft.end)) + '</p>';
    $('c4-start').textContent = 'Start ' + seasonName;
  }

  function commitCreate() {
    const st = Store.state;
    const pod = { name: draft.name, iconDataUrl: draft.iconDataUrl, glyph: draft.glyph, color: draft.color };
    st.pod = pod;
    st.players = draft.players.map(p => ({ id: uid(), name: p.name, nickname: p.nickname, photo: p.photo }));
    const season = {
      id: uid(), number: 1, name: draft.seasonName, type: draft.len,
      gameCount: draft.len === 'games' ? draft.games : null,
      startDate: draft.len === 'dates' ? draft.start : null,
      endDate: draft.len === 'dates' ? draft.end : null,
      status: 'active', games: [],
    };
    st.seasons = [season];
    st.activeSeasonId = season.id;
    // auto calendar entries for date seasons
    if (draft.len === 'dates') {
      st.calendar.push(
        { id: uid(), date: draft.start, title: season.name + ' begins', type: 'season', color: pod.color },
        { id: uid(), date: draft.end, title: season.name + ' ends', type: 'season', color: pod.color }
      );
    }
    st.setupDone = true;
    Store.save();
    applyPodColor();
    enterMain('standings');
  }

  // ---------- MAIN ----------
  function enterMain(tab) {
    show('s-main');
    switchTab(tab || 'standings');
  }

  function switchTab(name) {
    $$('#folder-tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    ['standings', 'hof', 'calendar', 'settings'].forEach(t => $('tab-' + t).classList.toggle('hidden', t !== name));
    if (name === 'standings') renderStandings();
    if (name === 'hof') renderHOF();
    if (name === 'calendar') renderCalendar();
    if (name === 'settings') renderSettings();
  }

  // ---------- STANDINGS ----------
  function renderStandings() {
    const st = Store.state;
    const season = Store.activeSeason();
    const icon = $('st-podicon');
    if (st.pod.iconDataUrl) icon.innerHTML = '<img src="' + st.pod.iconDataUrl + '">';
    else icon.textContent = st.pod.glyph || initials(st.pod.name);
    icon.style.background = st.pod.color;
    $('st-podname').textContent = st.pod.name;

    if (!season) { $('st-table').innerHTML = ''; return; }
    const locked = season.status === 'locked';
    let prog, progText;
    if (season.type === 'games') {
      prog = Math.min(1, season.games.length / (season.gameCount || 1));
      progText = 'Game ' + season.games.length + ' of ' + season.gameCount + (locked ? ' · Final' : '');
    } else {
      prog = 0; progText = (season.startDate ? fmtDate(season.startDate) : '') + ' – ' + (season.endDate ? fmtDate(season.endDate) : '') + (locked ? ' · Final' : '');
    }
    $('st-seasonline').textContent = season.name + ' · ' + progText;
    $('st-progress').style.width = (prog * 100) + '%';
    $('st-progresstext').textContent = progText;

    // lock banner
    const lb = $('st-lockbanner');
    if (!locked && Store.seasonComplete(season)) {
      lb.classList.remove('hidden');
      lb.innerHTML = '<b>Season complete.</b> Time to crown a champion.<br>' +
        '<button class="btn-primary" id="lb-lock" style="padding:10px 18px;font-size:14px">Crown the champion</button>' +
        (season.type === 'dates' ? ' <button class="btn-secondary" id="lb-extend" style="padding:10px 18px;font-size:14px">Extend 14 days</button>' : '');
      $('lb-lock').onclick = () => { Store.lockSeason(season.id); renderSeasonEnd(season.id); show('s-end'); };
      const ex = $('lb-extend');
      if (ex) ex.onclick = () => {
        const [y, m, d] = season.endDate.split('-').map(Number);
        const dt = new Date(y, m - 1, d + 14);
        season.endDate = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
        const e = st.calendar.find(e => e.type === 'season' && e.title === season.name + ' ends');
        if (e) e.date = season.endDate;
        Store.save(); renderStandings();
      };
    } else lb.classList.add('hidden');

    const table = S.computeStandings(st.players, season.games);
    const fab = $('fab-log');
    if (locked) {
      fab.textContent = 'Start ' + 'Season ' + (season.number + 1);
      fab.onclick = () => { Store.startNextSeason(); enterMain('standings'); };
    } else {
      fab.textContent = 'Log Game ' + (season.games.length + 1);
      fab.onclick = () => openLog();
    }
    $('cal-logbtn').textContent = locked ? 'Season locked' : 'Log Game ' + (season.games.length + 1);

    if (!season.games.length) {
      $('st-table').innerHTML = '<div class="empty-box"><h3>No games logged yet</h3><p class="muted">Log your first game to start the season. Ten seconds, done.</p></div>';
      $('st-recent').textContent = '—';
      return;
    }

    let html = '<table class="standings"><tr><th>Rk</th><th>Player</th><th class="num">W–L</th><th class="num">Win%</th><th class="num">Pts</th><th class="num">Stk</th></tr>';
    table.ranked.forEach((p, i) => {
      const stk = p.streak ? '<span class="' + (p.streakDir === 'W' ? 'streak-w' : 'streak-l') + '">' + p.streakDir + p.streak + '</span>' : '—';
      html += '<tr class="' + (i === 0 ? 'leader' : '') + '"><td class="rk">' + (i + 1) + '</td>' +
        '<td><span class="pname" data-pid="' + p.id + '">' + esc(p.name) + '</span></td>' +
        '<td class="num">' + S.fmtWL(p) + '</td><td class="num">' + S.fmtPct(p.winPct) + '</td>' +
        '<td class="num">' + p.points + '</td><td class="num">' + stk + '</td></tr>';
    });
    table.unranked.forEach(p => {
      html += '<tr><td class="rk">–</td><td><span class="pname unranked" data-pid="' + p.id + '">' + esc(p.name) + ' <small>(unranked)</small></span></td>' +
        '<td class="num">' + S.fmtWL(p) + '</td><td class="num">' + S.fmtPct(p.winPct) + '</td>' +
        '<td class="num">' + p.points + '</td><td class="num">—</td></tr>';
    });
    html += '</table>';
    $('st-table').innerHTML = html;
    $$('#st-table .pname').forEach(el => el.onclick = () => openProfile(el.dataset.pid));

    const recentGames = season.games.slice(-5).reverse();
    $('st-recent').innerHTML = '';
    if (!recentGames.length) { $('st-recent').innerHTML = '<span class="muted">—</span>'; }
    recentGames.forEach(g => {
      const b = document.createElement('button');
      b.className = 'recent-row';
      b.innerHTML = '<b>G' + g.number + '</b><span class="muted">' + fmtDate(g.date) + '</span><span>' + esc(playerName(g.placements[0])) + ' 1st</span><span class="chev">›</span>';
      b.onclick = () => openLog(g.id);
      $('st-recent').appendChild(b);
    });
  }

  // ---------- LOG GAME ----------
  const logDraft = { count: 0, slots: [], date: '', firstBlood: '', turns: '', colors: {}, decks: {}, elims: {} };
  const MANA = ['W', 'U', 'B', 'R', 'G', 'C'];

  function openLog(editId) {
    if (editId && typeof editId !== 'string') editId = null;
    const st = Store.state;
    const season = Store.activeSeason();
    if (!season || season.status !== 'active') return;
    logDraft.editingId = editId || null;
    if (editId) {
      const g = season.games.find(g => g.id === editId);
      if (!g) return;
      logDraft.count = g.placements.length;
      logDraft.slots = g.placements.slice();
      logDraft.date = g.date;
      logDraft.firstBlood = g.firstBlood || '';
      logDraft.turns = g.turns || '';
      logDraft.colors = Object.assign({}, g.colors);
      logDraft.decks = Object.assign({}, g.decks);
      logDraft.elims = Object.assign({}, g.eliminations);
      $('log-title').textContent = 'Edit Game ' + g.number;
      $('log-review').textContent = 'Review changes';
    } else {
      logDraft.count = st.players.length;
      logDraft.slots = new Array(logDraft.count).fill(null);
      logDraft.date = todayISO();
      logDraft.firstBlood = ''; logDraft.turns = ''; logDraft.colors = {}; logDraft.decks = {}; logDraft.elims = {};
      $('log-title').textContent = 'Log Game ' + (season.games.length + 1);
      $('log-review').textContent = 'Review';
    }
    $('log-date').textContent = fmtDateLong(logDraft.date);
    $('log-dateinput').value = logDraft.date;
    $('log-opts').classList.add('hidden');
    $('log-delete').classList.toggle('hidden', !editId);
    renderLogSlots();
    renderLogOpts();
    show('s-log');
  }

  function renderLogSlots() {
    const wrap = $('log-slots'); wrap.innerHTML = '';
    const ord = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];
    for (let i = 0; i < logDraft.count; i++) {
      const b = document.createElement('button');
      b.className = 'slot';
      const pid = logDraft.slots[i];
      b.innerHTML = '<span class="dot" style="background:' + (i === 0 ? '#d9a821' : i === 1 ? '#b9b9c0' : i === 2 ? '#a06a35' : '#e4e4e8') + '"></span>' +
        '<span class="place">' + ord[i] + '</span>' +
        '<span class="who' + (pid ? '' : ' empty') + '">' + (pid ? esc(playerName(pid)) : 'Tap to assign') + '</span><span class="chev">›</span>';
      b.onclick = () => openPicker(i);
      wrap.appendChild(b);
    }
  }

  let pickerSlot = -1;
  function openPicker(slot) {
    pickerSlot = slot;
    const ord = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];
    $('picker-title').textContent = 'Who placed ' + ord[slot] + '?';
    const list = $('picker-list'); list.innerHTML = '';
    Store.state.players.forEach(p => {
      const taken = logDraft.slots.includes(p.id);
      const b = document.createElement('button');
      b.textContent = p.nickname ? p.name + ' "' + p.nickname + '"' : p.name;
      b.disabled = taken;
      b.onclick = () => { logDraft.slots[slot] = p.id; $('picker-back').classList.add('hidden'); renderLogSlots(); renderLogOpts(); };
      list.appendChild(b);
    });
    $('picker-back').classList.remove('hidden');
  }

  function renderLogOpts() {
    const wrap = $('log-opts');
    const assigned = logDraft.slots.filter(Boolean);
    if (!assigned.length) { wrap.innerHTML = ''; return; }
    let html = '<p class="section-h">First blood</p><select class="field" id="opt-fb"><option value="">—</option>' +
      assigned.map(id => '<option value="' + id + '"' + (logDraft.firstBlood === id ? ' selected' : '') + '>' + esc(playerName(id)) + '</option>').join('') + '</select>';
    html += '<p class="section-h">Turns</p><input class="field" id="opt-turns" type="number" min="1" placeholder="e.g. 9" value="' + esc(logDraft.turns || '') + '">';
    html += '<p class="section-h">Colors & decks</p>';
    assigned.forEach(id => {
      const cols = logDraft.colors[id] || [];
      html += '<div style="margin-top:10px"><b>' + esc(playerName(id)) + '</b><div class="mana-row" data-mana="' + id + '">' +
        MANA.map(m => '<button class="mana' + (cols.includes(m) ? ' on' : '') + '" data-m="' + m + '">' + m + '</button>').join('') + '</div>' +
        '<input class="field mt" data-deck="' + id + '" placeholder="Deck nickname (optional)" style="padding:10px 12px;font-size:14px" value="' + esc(logDraft.decks[id] || '') + '">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-top:8px"><span class="muted" style="font-size:13px">Eliminations</span>' +
        '<button class="stepper-btn" data-el="-1" data-p="' + id + '" style="width:34px;height:34px;font-size:18px">−</button>' +
        '<span data-elv="' + id + '">' + (logDraft.elims[id] || 0) + '</span>' +
        '<button class="stepper-btn" data-el="1" data-p="' + id + '" style="width:34px;height:34px;font-size:18px">+</button></div></div>';
    });
    wrap.innerHTML = html;
    const fbSel = wrap.querySelector('#opt-fb');
    if (fbSel) fbSel.onchange = () => { logDraft.firstBlood = fbSel.value; };
    const turnIn = wrap.querySelector('#opt-turns');
    if (turnIn) turnIn.oninput = () => { logDraft.turns = turnIn.value; };
    $$('#log-opts .mana').forEach(b => b.onclick = () => {
      const pid = b.parentElement.dataset.mana;
      logDraft.colors[pid] = logDraft.colors[pid] || [];
      const i = logDraft.colors[pid].indexOf(b.dataset.m);
      if (i >= 0) logDraft.colors[pid].splice(i, 1); else logDraft.colors[pid].push(b.dataset.m);
      b.classList.toggle('on');
    });
    $$('#log-opts [data-deck]').forEach(i => i.oninput = () => { logDraft.decks[i.dataset.deck] = i.value; });
    $$('#log-opts [data-el]').forEach(b => b.onclick = () => {
      const pid = b.dataset.p;
      logDraft.elims[pid] = Math.max(0, (logDraft.elims[pid] || 0) + parseInt(b.dataset.el, 10));
      wrap.querySelector('[data-elv="' + pid + '"]').textContent = logDraft.elims[pid];
    });
  }

  function initLog() {
    $('picker-cancel').onclick = () => $('picker-back').classList.add('hidden');
    $('picker-back').onclick = e => { if (e.target.id === 'picker-back') $('picker-back').classList.add('hidden'); };
    $('log-dateinput').onchange = e => {
      if (e.target.value) { logDraft.date = e.target.value; $('log-date').textContent = fmtDateLong(logDraft.date); }
    };
    $('log-optbtn').onclick = () => { $('log-opts').classList.toggle('hidden'); renderLogOpts(); };
    $('log-review').onclick = () => {
      if (logDraft.slots.some(s => !s)) { alert('Assign every placement slot first.'); return; }
      renderConfirm();
      show('s-confirm');
    };
    $('log-delete').onclick = () => {
      const g = Store.activeSeason().games.find(g => g.id === logDraft.editingId);
      if (g && confirm('Delete Game ' + g.number + '? This cannot be undone.')) {
        Store.deleteGame(logDraft.editingId);
        enterMain('standings');
      }
    };
  }

  // ---------- CONFIRM ----------
  function renderConfirm() {
    const st = Store.state;
    const season = Store.activeSeason();
    const editing = !!logDraft.editingId;
    const n = editing ? season.games.find(g => g.id === logDraft.editingId).number : season.games.length + 1;
    $('confirm-title').textContent = (editing ? 'Edit Game ' : 'Confirm Game ') + n;
    $('confirm-sub').textContent = fmtDateLong(logDraft.date) + ' · ' + logDraft.count + ' players';
    const ord = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];
    $('confirm-slots').innerHTML = logDraft.slots.map((pid, i) =>
      '<div class="kv"><span class="muted">' + ord[i] + '</span> &nbsp;<b>' + esc(playerName(pid)) + '</b></div>').join('');

    const game = {
      date: logDraft.date, placements: logDraft.slots.slice(),
      firstBlood: logDraft.firstBlood || null,
      turns: parseInt(logDraft.turns, 10) || null,
      colors: Object.assign({}, logDraft.colors),
      decks: Object.assign({}, logDraft.decks),
      eliminations: Object.assign({}, logDraft.elims),
    };
    const base = editing ? season.games.filter(g => g.id !== logDraft.editingId) : season.games;
    const pv = S.previewImpact(st.players, base, game);
    $('confirm-impact').innerHTML = pv.moves.map(m => {
      const arrow = m.isNew ? '<span class="flat">new</span>'
        : m.move > 0 ? '<span class="up">▲' + m.move + '</span>'
        : m.move < 0 ? '<span class="down">▼' + Math.abs(m.move) + '</span>' : '<span class="flat">▬</span>';
      return '<div class="impact-row"><span>' + esc(m.name) + '</span><span>' +
        m.beforeW + '–' + m.beforeL + ' → <b>' + m.afterW + '–' + m.afterL + '</b> · ' + Math.round(m.afterPct * 100) + '% ' + arrow + '</span></div>';
    }).join('');
    $('confirm-yes').textContent = editing ? 'Save changes' : 'Confirm';
    $('confirm-yes').onclick = () => {
      if (editing) {
        Store.updateGame(logDraft.editingId, game);
        enterMain('standings');
        return;
      }
      const saved = Store.logGame(game);
      // game-count seasons: stamp "begins" on first game
      if (season.type === 'games' && season.games.length === 1) {
        st.calendar.push({ id: uid(), date: game.date, title: season.name + ' begins', type: 'season', color: st.pod.color });
        Store.save();
      }
      if (Store.seasonComplete(season)) {
        // season-end ritual
        const locked = Store.lockSeason(season.id);
        renderSeasonEnd(locked.id);
        show('s-end');
      } else {
        enterMain('standings');
      }
    };
    $('confirm-edit').onclick = () => show('s-log');
  }

  // ---------- SEASON END ----------
  function renderSeasonEnd(seasonId) {
    const st = Store.state;
    const season = st.seasons.find(s => s.id === seasonId);
    $('end-title').textContent = season.name;
    const champ = st.players.find(p => p.id === season.champion);
    const spoon = st.players.find(p => p.id === season.woodenSpoon);
    const table = S.computeStandings(st.players, season.games);
    const cs = table.ranked.find(p => p.id === season.champion);
    $('end-champ').textContent = champ ? champ.name : '—';
    $('end-champ-line').textContent = cs ? S.fmtWL(cs) + ' · ' + S.fmtPct(cs.winPct) + ' win' : '';
    $('end-spoon').textContent = spoon ? spoon.name : '—';
    $('end-table').innerHTML = '<table class="standings">' + table.ranked.map((p, i) =>
      '<tr><td class="rk">' + (i + 1) + '</td><td>' + esc(p.name) + '</td><td class="num">' + S.fmtWL(p) + '</td><td class="num">' + S.fmtPct(p.winPct) + '</td></tr>'
    ).join('') + '</table>';
    $('end-exit').onclick = () => enterMain('standings');
    $('end-share').onclick = () => shareEnd(season);
  }

  // ---------- CALENDAR ----------
  let calY = new Date().getFullYear(), calM = new Date().getMonth(), calSel = todayISO();

  function renderCalendar() {
    const st = Store.state;
    const monthName = new Date(calY, calM, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    $('cal-month').textContent = monthName;
    $('cal-title').textContent = 'Calendar';
    const grid = $('cal-grid'); grid.innerHTML = '';
    const first = new Date(calY, calM, 1).getDay();
    const days = new Date(calY, calM + 1, 0).getDate();
    const entriesByDate = {};
    st.calendar.forEach(e => { (entriesByDate[e.date] = entriesByDate[e.date] || []).push(e); });
    (Store.activeSeason() || { games: [] }).games.forEach(g => {
      (entriesByDate[g.date] = entriesByDate[g.date] || []).push({ title: 'Game ' + g.number + ' · ' + playerName(g.placements[0]) + ' 1st', type: 'game', color: st.pod.color, gameId: g.id });
    });
    for (let i = 0; i < first; i++) { const b = document.createElement('button'); b.className = 'dim'; b.disabled = true; grid.appendChild(b); }
    for (let d = 1; d <= days; d++) {
      const iso = calY + '-' + String(calM + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      const b = document.createElement('button');
      b.innerHTML = '<span>' + d + '</span>';
      if (iso === todayISO()) b.classList.add('today');
      if (iso === calSel) b.classList.add('sel');
      const es = entriesByDate[iso] || [];
      if (es.length && iso !== todayISO()) { const dot = document.createElement('span'); dot.className = 'dot'; b.appendChild(dot); }
      const se = es.find(e => e.type === 'season');
      if (se) { const m = document.createElement('span'); m.className = 'marker'; m.style.background = se.color; b.appendChild(m); }
      b.onclick = () => { calSel = iso; renderCalendar(); };
      grid.appendChild(b);
    }
    // preview
    const pv = $('cal-preview');
    const es = entriesByDate[calSel] || [];
    if (es.length) {
      pv.classList.remove('hidden');
      pv.innerHTML = '<b>' + fmtDateLong(calSel) + '</b>';
      es.forEach(e => {
        if (e.type === 'game') {
          const b = document.createElement('button');
          b.className = 'entry-row';
          b.innerHTML = '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + esc(e.color || '#3E2FDC') + '"></span> ' + esc(e.title) + '<span class="chev">›</span>';
          b.onclick = () => openLog(e.gameId);
          pv.appendChild(b);
        } else if (e.id && e.type !== 'season') {
          const b = document.createElement('button');
          b.className = 'entry-row';
          b.innerHTML = '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + esc(e.color || '#3E2FDC') + '"></span> ' + esc(e.title) +
            (e.notes ? '<br><span class="muted">' + esc(e.notes) + '</span>' : '') + '<span class="chev">›</span>';
          b.onclick = () => openEntryEdit(e.id);
          pv.appendChild(b);
        } else {
          const d = document.createElement('div');
          d.className = 'kv';
          d.innerHTML = '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + esc(e.color || '#3E2FDC') + '"></span> ' + esc(e.title) +
            (e.notes ? '<br><span class="muted">' + esc(e.notes) + '</span>' : '');
          pv.appendChild(d);
        }
      });
    } else pv.classList.add('hidden');
    // quick actions
    const q = $('cal-quicks'); q.innerHTML = '';
    st.quickActions.forEach(a => {
      const b = document.createElement('button');
      b.className = 'btn-secondary'; b.style.padding = '14px 10px'; b.style.fontSize = '14px';
      b.textContent = a.title;
      b.onclick = () => quickAdd(a);
      q.appendChild(b);
    });
    $('cal-logbtn').onclick = () => { if ((Store.activeSeason() || {}).status === 'active') openLog(); };
  }

  function quickAdd(a) {
    Store.state.calendar.push({ id: uid(), date: calSel, title: a.title, type: a.type, color: a.color });
    Store.save(); renderCalendar();
  }

  function initCalendar() {
    $('cal-prev').onclick = () => { calM--; if (calM < 0) { calM = 11; calY--; } renderCalendar(); };
    $('cal-next').onclick = () => { calM++; if (calM > 11) { calM = 0; calY++; } renderCalendar(); };
    $('cal-newbtn').onclick = () => openEntryNew();
    $('entry-cancel').onclick = () => $('ov-entry').classList.add('hidden');
    $('entry-delete').onclick = () => {
      if (!entryEditingId) return;
      const e = Store.state.calendar.find(x => x.id === entryEditingId);
      if (e && confirm('Delete "' + e.title + '"?')) {
        Store.state.calendar = Store.state.calendar.filter(x => x.id !== entryEditingId);
        Store.save();
        $('ov-entry').classList.add('hidden');
        renderCalendar();
      }
    };
    $$('#entry-types .chip').forEach(c => c.onclick = () => {
      $$('#entry-types .chip').forEach(x => x.classList.remove('active')); c.classList.add('active');
    });
    $('entry-save').onclick = () => {
      const title = $('entry-title').value.trim();
      if (!title) { alert('Give the entry a title.'); return; }
      const activeChip = document.querySelector('#entry-types .chip.active');
      const type = activeChip ? activeChip.dataset.t : 'custom';
      const color = entryColor || Store.state.pod.color;
      const date = $('entry-date').value || calSel;
      const notes = $('entry-notes').value.trim();
      if (entryEditingId) {
        const e = Store.state.calendar.find(x => x.id === entryEditingId);
        if (e) { e.title = title; e.date = date; e.type = type; e.color = color; e.notes = notes; }
      } else {
        const entry = { id: uid(), date, title, type, color, notes };
        Store.state.calendar.push(entry);
        if ($('entry-quick').checked) Store.state.quickActions.push({ id: uid(), title, type, color });
      }
      Store.save();
      $('ov-entry').classList.add('hidden');
      renderCalendar();
    };
  }
  let entryEditingId = null;
  let entryColor = null;

  function openEntryNew() {
    entryEditingId = null;
    entryColor = Store.state.pod.color;
    $('entry-h').textContent = 'Create new';
    $('entry-title').value = '';
    $('entry-date').value = calSel;
    $('entry-notes').value = '';
    $('entry-quick').checked = false;
    $$('#entry-types .chip').forEach(x => x.classList.toggle('active', x.dataset.t === 'custom'));
    swatchRow($('entry-colors'), entryColor, hex => { entryColor = hex; });
    $('entry-delete').classList.add('hidden');
    $('ov-entry').classList.remove('hidden');
  }

  function openEntryEdit(id) {
    const e = Store.state.calendar.find(x => x.id === id);
    if (!e) return;
    entryEditingId = id;
    entryColor = e.color;
    $('entry-h').textContent = 'Edit entry';
    $('entry-title').value = e.title;
    $('entry-date').value = e.date;
    $('entry-notes').value = e.notes || '';
    $('entry-quick').checked = false;
    $$('#entry-types .chip').forEach(x => x.classList.toggle('active', x.dataset.t === e.type));
    swatchRow($('entry-colors'), entryColor, hex => { entryColor = hex; });
    $('entry-delete').classList.remove('hidden');
    $('ov-entry').classList.remove('hidden');
  }

  // ---------- PLAYER PROFILE ----------  // ---------- PLAYER PROFILE ----------
  function openProfile(pid) {
    const st = Store.state;
    const p = st.players.find(x => x.id === pid);
    const season = Store.activeSeason();
    $('pp-avatar').innerHTML = p.photo ? '<img src="' + p.photo + '">' : esc(initials(p.name));
    $('pp-name').textContent = p.name;
    $('pp-nick').textContent = p.nickname ? '"' + p.nickname + '"' : '';
    if (season) {
      $('pp-season-h').textContent = season.name;
      const s = S.playerStats(pid, season.games);
      $('pp-season').innerHTML = [['W–L', S.fmtWL(s)], ['Win %', S.fmtPct(s.winPct)], ['Pts', s.points], ['Streak', s.streak ? s.streakDir + s.streak : '—']]
        .map(x => '<div class="stat"><b>' + x[1] + '</b><span>' + x[0] + '</span></div>').join('');
    }
    // career across all seasons
    const all = st.seasons.flatMap(se => se.games);
    const c = S.playerStats(pid, all);
    const chips = st.seasons.filter(se => se.champion === pid).length;
    $('pp-career').innerHTML = '<p class="kv">Career <b>' + S.fmtWL(c) + '</b> · ' + S.fmtPct(c.winPct) + '</p>' +
      '<p class="kv">Championships <b>' + chips + '</b></p>';
    $('pp-fun').innerHTML = '<p class="kv">First bloods <b>' + c.firstBloods + '</b> · Eliminations <b>' + c.eliminations + '</b></p>';
    $('ov-player').classList.remove('hidden');
  }

  // ---------- HOF ----------
  function renderHOF() {
    const st = Store.state;
    const hof = S.hallOfFame(st.players, st.seasons);
    $('hof-sub').textContent = hof.seasons ? 'Career records · ' + hof.seasons + ' locked season' + (hof.seasons > 1 ? 's' : '') : 'Career records';
    $('hof-list').innerHTML = hof.rows.length
      ? hof.rows.map(r => '<div class="hof-row"><div class="t"><b>' + esc(r.label) + '</b><span>' + esc(r.name) + '</span></div><div class="v">' + esc(r.value) + '</div></div>').join('')
      : '<div class="empty-box"><h3>No locked seasons yet</h3><p class="muted">Records land here when a season is crowned and archived.</p></div>';
  }

  // ---------- SETTINGS ----------
  function renderSettings() {
    const s = Store.state.settings;
    $('set-remind').checked = s.remind;
    $('set-milestone').checked = s.milestone;
    // pod
    const pod = Store.state.pod;
    if (pod) {
      $('set-podname').value = pod.name;
      swatchRow($('set-podcolors'), pod.color, hex => { pod.color = hex; Store.save(); applyPodColor(); });
      const gg = $('set-podglyphs');
      if (!gg.children.length) {
        ['◆', '●', '▲', '■', '♛', '⬟', '⬢', '✦', '☾', '⚑', '❖', '⬣'].forEach(g => {
          const b = document.createElement('button');
          b.textContent = g;
          b.onclick = () => { pod.glyph = g; pod.iconDataUrl = null; Store.save(); $$('#set-podglyphs button').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); };
          gg.appendChild(b);
        });
      }
    }
    // season
    const season = Store.activeSeason();
    const sw = $('set-season');
    if (season && season.status === 'active') {
      if (season.type === 'games') {
        sw.innerHTML = '<p class="muted" style="font-size:14px;margin:0 0 8px">' + esc(season.name) + ' · game count</p>' +
          '<div style="display:flex;gap:10px;align-items:center"><input class="field" id="set-games" type="number" min="1" max="500" value="' + season.gameCount + '" style="max-width:120px">' +
          '<span class="muted" style="font-size:13px">' + season.games.length + ' logged so far</span></div>';
        $('set-games').onchange = e => {
          season.gameCount = Math.max(1, parseInt(e.target.value, 10) || 1);
          Store.save();
        };
      } else {
        sw.innerHTML = '<p class="muted" style="font-size:14px;margin:0 0 8px">' + esc(season.name) + ' · date range</p>' +
          '<input class="field" id="set-start" type="date" value="' + (season.startDate || '') + '">' +
          '<input class="field mt" id="set-end" type="date" value="' + (season.endDate || '') + '">';
        const syncCal = () => {
          const st = Store.state;
          const sEntry = st.calendar.find(e => e.type === 'season' && e.title === season.name + ' begins');
          const eEntry = st.calendar.find(e => e.type === 'season' && e.title === season.name + ' ends');
          if (sEntry) sEntry.date = season.startDate;
          if (eEntry) eEntry.date = season.endDate;
          Store.save();
        };
        $('set-start').onchange = e => { if (e.target.value) { season.startDate = e.target.value; syncCal(); } };
        $('set-end').onchange = e => { if (e.target.value) { season.endDate = e.target.value; syncCal(); } };
      }
    } else if (season) {
      sw.innerHTML = '<p class="muted" style="font-size:14px">' + esc(season.name) + ' is locked. Start a new season from Standings to change the length.</p>';
    } else {
      sw.innerHTML = '';
    }
    const sr = $('set-roster'); sr.innerHTML = '';
    Store.state.players.forEach(p => {
      const row = document.createElement('div'); row.className = 'player-row';
      const av = document.createElement('div'); av.className = 'avatar';
      av.innerHTML = p.photo ? '<img src="' + p.photo + '">' : esc(initials(p.name));
      const nm = document.createElement('input'); nm.className = 'field'; nm.value = p.name;
      nm.onchange = () => { p.name = nm.value.trim() || p.name; Store.save(); };
      row.appendChild(av); row.appendChild(nm); sr.appendChild(row);
    });
  }

  function initSettings() {
    $('set-podname').onchange = e => {
      const v = e.target.value.trim();
      if (v && Store.state.pod) { Store.state.pod.name = v; Store.save(); }
    };
    $('set-podicon-upload').onclick = () => $('set-podicon-file').click();
    $('set-podicon-file').onchange = e => {
      const f = e.target.files[0]; if (!f || !Store.state.pod) return;
      const r = new FileReader();
      r.onload = () => { Store.state.pod.iconDataUrl = r.result; Store.state.pod.glyph = null; Store.save(); };
      r.readAsDataURL(f);
    };
    $('set-podicon-glyph').onclick = () => $('set-podglyphs').classList.toggle('hidden');
    $('set-remind').onchange = e => { Store.state.settings.remind = e.target.checked; Store.save(); };
    $('set-milestone').onchange = e => { Store.state.settings.milestone = e.target.checked; Store.save(); };
    $$('#set-theme .seg-btn').forEach(b => b.onclick = () => {
      Store.state.settings.theme = b.dataset.theme; Store.save(); applyTheme();
    });
    $('set-export').onclick = () => {
      const { gameLog, standings } = Store.exportCSVs();
      download('podlog-games.csv', gameLog, 'text/csv');
      download('podlog-standings.csv', standings, 'text/csv');
    };
    $('set-backup').onclick = () => download('podlog-backup.json', Store.backupJSON(), 'application/json');
    $('set-restore').onclick = () => $('set-restore-file').click();
    $('set-restore-file').onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try { Store.restoreJSON(r.result); applyPodColor(); applyTheme(); enterMain('standings'); }
        catch (err) { alert('Could not restore: ' + err.message); }
      };
      r.readAsText(f);
    };
  }

  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  // ---------- SHARE (image cards) ----------
  function drawCard(title, sub, rows) {
    const W = 1080, rowH = 88, H = 320 + rows.length * rowH + 80;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#3E2FDC'; c.fillRect(0, 0, W, 220);
    c.fillStyle = '#fff'; c.font = '800 64px -apple-system, sans-serif';
    c.fillText('PODLOG', 60, 105);
    c.font = '500 36px -apple-system, sans-serif'; c.fillStyle = 'rgba(255,255,255,.85)';
    c.fillText(title, 60, 165);
    c.fillStyle = '#6e6e73'; c.font = '500 32px -apple-system, sans-serif';
    c.fillText(sub, 60, 275);
    rows.forEach((r, i) => {
      const y = 340 + i * rowH;
      if (i === 0) { c.fillStyle = '#e5f4e9'; roundRect(c, 40, y - 58, W - 80, rowH - 8, 18); c.fill(); }
      c.fillStyle = '#111'; c.font = '700 38px -apple-system, sans-serif';
      c.fillText(r[0], 70, y);
      c.font = '500 36px -apple-system, sans-serif';
      c.fillText(r[1], 420, y);
    });
    return new Promise(res => cv.toBlob(res, 'image/png'));
  }
  function roundRect(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  async function shareImage(blob, name, textFallback) {
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    if (navigator.share) {
      try { await navigator.share({ text: textFallback }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(textFallback); alert('Copied to clipboard.'); }
    catch (e) { alert(textFallback); }
  }
  function shareStandings() {
    const st = Store.state; const season = Store.activeSeason(); if (!season) return;
    const t = S.computeStandings(st.players, season.games);
    const rows = t.ranked.slice(0, 6).map((p, i) => [(i + 1) + '.', p.name + '  ' + S.fmtWL(p) + '  ' + S.fmtPct(p.winPct)]);
    const text = st.pod.name + ' — ' + season.name + '\n' + rows.map(r => r[0] + ' ' + r[1]).join('\n');
    drawCard(st.pod.name + ' · ' + season.name, 'Game ' + season.games.length + (season.type === 'games' ? ' of ' + season.gameCount : ''), rows)
      .then(b => shareImage(b, 'podlog-standings.png', text));
  }
  function shareEnd(season) {
    const st = Store.state;
    const champ = playerName(season.champion), spoon = playerName(season.woodenSpoon);
    const text = st.pod.name + ' — ' + season.name + ' FINAL\nChampion: ' + champ + '\nWooden spoon: ' + spoon;
    drawCard(season.name + ' · FINAL', st.pod.name, [['♛', 'Champion: ' + champ], ['🥄', 'Wooden spoon: ' + spoon]])
      .then(b => shareImage(b, 'podlog-champion.png', text));
  }

  // ---------- INIT ----------
  function init() {
    Store.load();
    applyTheme(); applyPodColor();
    if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

    $$('[data-go]').forEach(b => b.onclick = () => show(b.dataset.go));
    $$('#folder-tabs button').forEach(b => b.onclick = () => switchTab(b.dataset.tab));
    $('btn-create-pod').onclick = () => { show('s-c1'); };
    $('c4-start').onclick = commitCreate;
    $('fab-log').onclick = openLog;
    $('pp-close').onclick = () => $('ov-player').classList.add('hidden');
    $('ov-player').onclick = e => { if (e.target.id === 'ov-player') $('ov-player').classList.add('hidden'); };
    $('ov-entry').onclick = e => { if (e.target.id === 'ov-entry') $('ov-entry').classList.add('hidden'); };
    $('share-standings').onclick = shareStandings;
    $('share-hof').onclick = () => {
      const hof = S.hallOfFame(Store.state.players, Store.state.seasons);
      const rows = hof.rows.slice(0, 6).map(r => ['•', r.label + ': ' + r.name + ' (' + r.value + ')']);
      const text = 'Hall of Fame\n' + rows.map(r => r[1]).join('\n');
      drawCard('Hall of Fame', Store.state.pod.name, rows).then(b => shareImage(b, 'podlog-hof.png', text));
    };
    $('share-cal').onclick = () => {
      const text = Store.state.pod.name + ' — ' + $('cal-month').textContent;
      if (navigator.share) navigator.share({ text }).catch(() => {});
      else alert(text);
    };

    initCreate1(); initCreate2(); initCreate3(); initLog(); initCalendar(); initSettings();

    if (Store.state.setupDone && Store.state.pod) enterMain('standings');
    else show('s-first');

    // PWA service worker
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
