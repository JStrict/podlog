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
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, (n >> 16) + amt));
    const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
    const b = Math.max(0, Math.min(255, (n & 255) + amt));
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  }
  function relLum(hex) {
    const n = parseInt(hex.slice(1), 16);
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(n >> 16) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
  }
  function applyPodColor() {
    const c = (Store.state.pod && Store.state.pod.color) || '#3E2FDC';
    const root = document.documentElement.style;
    root.setProperty('--pod', c);
    root.setProperty('--blue', c);
    root.setProperty('--blue-dark', shade(c, -40));
    root.setProperty('--on-blue', relLum(c) > 0.35 ? '#1c1c1e' : '#ffffff');
  }

  // ---------- CREATE FLOW ----------
  const draft = { name: '', iconDataUrl: null, glyph: null, color: '#3E2FDC', count: 6, players: [], len: 'games', games: 20, start: '', end: '' };

  // Wraps a text input with an × clear button (iOS-style). Idempotent.
  function clearable(input) {
    if (!input || input.dataset.clearable) return input;
    input.dataset.clearable = '1';
    const wrap = document.createElement('div');
    wrap.className = 'field-wrap';
    if (input.style.maxWidth) { wrap.style.maxWidth = input.style.maxWidth; input.style.maxWidth = ''; }
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    const x = document.createElement('button');
    x.type = 'button'; x.className = 'field-clear hidden'; x.textContent = '×';
    x.setAttribute('aria-label', 'Clear field');
    const sync = () => x.classList.toggle('hidden', !input.value);
    x.onclick = e => { e.preventDefault(); input.value = ''; sync(); input.focus(); };
    input.addEventListener('input', sync);
    wrap.appendChild(x); sync();
    return input;
  }

  function swatchRow(el, sel, cb) {    el.innerHTML = '';
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
    clearable($('c1-name'));
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
      openCropEditor(f, dataUrl => {
        draft.iconDataUrl = dataUrl; draft.glyph = null;
        $('c1-upload').classList.add('sel'); $('c1-generic').classList.remove('sel');
        gg.classList.add('hidden');
      });
      e.target.value = '';
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
    $('c2-plus').disabled = draft.count >= 10;
    while (draft.players.length < draft.count) draft.players.push({ name: '', nickname: '', photo: null });
    draft.players.length = draft.count;
    const rows = $('c2-rows'); rows.innerHTML = '';
    draft.players.forEach((p, i) => {
      const row = document.createElement('div'); row.className = 'player-row';
      const av = document.createElement('button'); av.className = 'avatar';
      av.innerHTML = p.photo ? '<img src="' + p.photo + '">' : esc(initials(p.name) === '?' ? String(i + 1) : p.name);
      av.title = 'Add photo';
      av.onclick = () => {
        pendingAvatarSave = dataUrl => { p.photo = dataUrl; renderCreate2(); };
        $('set-avatar-file').click();
      };
      const nm = document.createElement('input'); nm.className = 'field'; nm.placeholder = 'Player ' + (i + 1); nm.value = p.name;
      nm.oninput = () => { p.name = nm.value; };
      const nn = document.createElement('input'); nn.className = 'field'; nn.placeholder = 'Nickname (optional)'; nm.style.marginTop = '0';
      nn.style.maxWidth = '38%'; nn.value = p.nickname; nn.oninput = () => { p.nickname = nn.value; };
      row.appendChild(av); row.appendChild(nm); row.appendChild(nn);
      clearable(nm); clearable(nn);
      rows.appendChild(row);
    });
  }

  function initCreate2() {
    $('c2-minus').onclick = () => { if (draft.count > 1) { draft.count--; renderCreate2(); } };
    $('c2-plus').onclick = () => { if (draft.count < 10) { draft.count++; renderCreate2(); } };
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
    morphOpen = false;
    show('s-main');
    switchTab(tab || 'standings');
  }

  const TAB_ORDER = ['standings', 'hof', 'calendar', 'settings'];
  let currentTab = 'standings';
  let tabAnimId = 0;
  function switchTab(name) {
    $$('#folder-tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    $('fab-log').style.display = name === 'standings' ? '' : 'none';
    const prev = currentTab;
    currentTab = name;
    if (name === 'standings') renderStandings();
    if (name === 'hof') renderHOF();
    if (name === 'calendar') renderCalendar();
    if (name === 'settings') renderSettings();
    const panes = TAB_ORDER.map(t => $('tab-' + t));
    panes.forEach(el => el.classList.remove('pane-anim', 'pane-abs', 'pane-from-right', 'pane-from-left', 'pane-to-left', 'pane-to-right'));
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prev === name || reduced) {
      panes.forEach((el, i) => el.classList.toggle('hidden', TAB_ORDER[i] !== name));
      return;
    }
    const dir = TAB_ORDER.indexOf(name) > TAB_ORDER.indexOf(prev) ? 1 : -1;
    const outEl = $('tab-' + prev), inEl = $('tab-' + name);
    panes.forEach(el => { if (el !== outEl && el !== inEl) el.classList.add('hidden'); });
    outEl.classList.remove('hidden');
    inEl.classList.remove('hidden');
    inEl.classList.add('pane-anim', dir === 1 ? 'pane-from-right' : 'pane-from-left');
    outEl.classList.add('pane-anim', 'pane-abs', dir === 1 ? 'pane-to-left' : 'pane-to-right');
    void inEl.offsetWidth;
    inEl.classList.remove('pane-from-right', 'pane-from-left');
    const myId = ++tabAnimId;
    setTimeout(() => {
      if (myId !== tabAnimId) return;
      outEl.classList.add('hidden');
      outEl.classList.remove('pane-anim', 'pane-abs', 'pane-to-left', 'pane-to-right');
      inEl.classList.remove('pane-anim');
    }, 340);
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
      $('lb-lock').onclick = () => { Store.lockSeason(season.id); renderSeasonEnd(season.id); show('s-end'); showBackupNudge(season, 'lock'); };
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

    const table = S.computeStandings(S.seasonPlayers(st.players, season), season.games);
    const fab = $('fab-log');
    if (locked) {
      fab.textContent = 'Start ' + 'Season ' + (season.number + 1);
      fab.onclick = () => { Store.startNextSeason(); enterMain('standings'); };
    } else {
      fab.textContent = 'Log Game ' + (season.games.length + 1);
      fab.onclick = () => openLogMorph();
    }
    $('cal-logbtn').textContent = locked ? 'Season locked' : 'Log Game ' + (season.games.length + 1);

    if (!season.games.length) {
      $('st-table').innerHTML = '<div class="empty-box"><h3>No games logged yet</h3><p class="muted">Log your first game to start the season. Ten seconds, done.</p></div>';
      $('st-recent').textContent = '—';
      $('st-allgames').classList.add('hidden');
      return;
    }
    $('st-allgames').classList.remove('hidden');

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

  // ---------- GAMES LEDGER ----------
  function renderGames() {
    const st = Store.state; const season = Store.activeSeason();
    const wrap = $('games-list');
    $('games-title').textContent = season ? season.name + ' · Games' : 'Games';
    if (!season || !season.games.length) {
      wrap.innerHTML = '<div class="empty-box"><h3>No games logged yet</h3><p class="muted">Games you log will live here as the season ledger.</p></div>';
      return;
    }
    const ord = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];
    wrap.innerHTML = '';
    season.games.slice().reverse().forEach(g => {
      const row = document.createElement('div'); row.className = 'game-row';
      const places = g.placements.map((pid, i) => ord[i] + ' ' + esc(playerName(pid)) +
        (g.decks && g.decks[pid] ? ' (' + esc(g.decks[pid]) + ')' : '')).join(' · ');
      row.innerHTML = '<div class="game-main"><div class="game-title">Game ' + g.number +
        ' <span class="muted">· ' + fmtDate(g.date) + '</span></div><div class="game-places">' + places + '</div></div>' +
        '<button class="share-btn" aria-label="Share game">↑</button>';
      row.querySelector('.game-main').onclick = () => openLog(g.id);
      row.querySelector('.share-btn').onclick = () => shareGame(g);
      wrap.appendChild(row);
    });
  }

  // ---------- LOG GAME ----------
  const logDraft = { count: 0, players: [], slots: [], date: '', firstBlood: '', turns: '', colors: {}, decks: {}, elimBy: {}, scoops: [] };
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
      logDraft.players = g.placements.slice();
      logDraft.count = logDraft.players.length;
      logDraft.slots = g.placements.slice();
      logDraft.date = g.date;
      logDraft.firstBlood = g.firstBlood || '';
      logDraft.turns = g.turns || '';
      logDraft.colors = Object.assign({}, g.colors);
      logDraft.decks = Object.assign({}, g.decks);
      logDraft.elimBy = Object.assign({}, g.eliminatedBy);
      logDraft.scoops = (g.scooped || []).slice();
      $('log-title').textContent = 'Edit Game ' + g.number;
      $('log-review').textContent = 'Review changes';
    } else {
      logDraft.players = st.players.filter(p => !p.archived).map(p => p.id);
      logDraft.count = logDraft.players.length;
      logDraft.slots = new Array(logDraft.count).fill(null);
      logDraft.date = todayISO();
      logDraft.firstBlood = ''; logDraft.turns = ''; logDraft.colors = {}; logDraft.decks = {}; logDraft.elimBy = {}; logDraft.scoops = [];
      $('log-title').textContent = 'Log Game ' + (season.games.length + 1);
      $('log-review').textContent = 'Review';
    }
    $('log-date').textContent = fmtDateLong(logDraft.date);
    $('log-dateinput').value = logDraft.date;
    $('log-opts').classList.add('hidden');
    $('log-delete').classList.toggle('hidden', !editId);
    renderLogPlayers();
    renderLogSlots();
    renderLogOpts();
    // first log ever: leave the optional stats open so new users discover them
    if (st.seasons.flatMap(s => s.games).length === 0) $('log-opts').classList.remove('hidden');
    show('s-log');
  }

  // ---------- FAB MORPH: the log button grows into its screen ----------
  let morphOpen = false;
  let morphRunning = false;
  const MORPH_EASE = 'cubic-bezier(.32,.72,0,1)';
  function reducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  function morphClone(rect, text) {
    const c = document.createElement('div');
    c.className = 'morph-clone';
    c.textContent = text;
    c.style.left = rect.left + 'px';
    c.style.top = rect.top + 'px';
    c.style.width = rect.width + 'px';
    c.style.height = rect.height + 'px';
    document.body.appendChild(c);
    return c;
  }
  function openLogMorph() {
    if (morphRunning || reducedMotion()) { openLog(); return; }
    morphRunning = true;
    const fab = $('fab-log');
    const c = morphClone(fab.getBoundingClientRect(), fab.textContent);
    c.style.transition = 'all .45s ' + MORPH_EASE;
    void c.offsetWidth;
    c.style.left = '0px'; c.style.top = '0px';
    c.style.width = '100vw'; c.style.height = '100dvh';
    c.style.borderRadius = '0px'; c.style.background = 'var(--bg)';
    c.style.color = 'transparent'; c.style.boxShadow = 'none';
    // reveal the form through the clone as the grow finishes, no black beat
    setTimeout(() => {
      openLog();
      morphOpen = !$('s-log').classList.contains('hidden');
      c.style.transition = 'opacity .25s ease';
      c.style.opacity = '0';
      setTimeout(() => { c.remove(); morphRunning = false; }, 270);
    }, 350);
  }
  function closeLogMorph() {
    $('picker-back').classList.remove('open');
    if (!morphOpen || morphRunning || reducedMotion()) { morphOpen = false; show('s-main'); return; }
    morphRunning = true;
    morphOpen = false;
    // cover the log screen, swap to standings underneath, then shrink:
    // the shrink reveals standings (the destination), never the log screen
    const fab = $('fab-log');
    const c = morphClone({ left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }, fab.textContent);
    c.style.borderRadius = '0px'; c.style.background = 'var(--bg)';
    c.style.color = 'transparent'; c.style.boxShadow = 'none'; c.style.opacity = '0';
    c.style.transition = 'opacity .2s ease';
    void c.offsetWidth;
    c.style.opacity = '1';
    setTimeout(() => {
      enterMain('standings');
      const r = fab.getBoundingClientRect();
      c.style.transition = 'all .45s ' + MORPH_EASE;
      c.style.left = r.left + 'px'; c.style.top = r.top + 'px';
      c.style.width = r.width + 'px'; c.style.height = r.height + 'px';
      c.style.borderRadius = '28px'; c.style.background = 'var(--pod)';
      c.style.color = 'var(--on-blue)'; c.style.boxShadow = '0 6px 20px rgba(0,0,0,.25)';
      setTimeout(() => {
        c.remove();
        morphRunning = false;
      }, 470);
    }, 220);
  }

  function renderLogPlayers() {
    const wrap = $('log-players'); wrap.innerHTML = '';
    Store.state.players.filter(p => !p.archived || logDraft.players.includes(p.id)).forEach(p => {
      const on = logDraft.players.includes(p.id);
      const b = document.createElement('button');
      b.className = 'chip' + (on ? ' active' : '');
      b.textContent = p.name;
      b.onclick = () => toggleLogPlayer(p.id);
      wrap.appendChild(b);
    });
    const n = logDraft.players.length;
    $('log-pcount').textContent = n + ' in' + (n < 4 ? ' — need at least 4' : '');
  }

  function toggleLogPlayer(pid) {
    const i = logDraft.players.indexOf(pid);
    if (i >= 0) {
      logDraft.players.splice(i, 1);
      logDraft.slots = logDraft.slots.filter(id => id !== pid);
      if (logDraft.slots.length > logDraft.players.length) logDraft.slots.length = logDraft.players.length;
      while (logDraft.slots.length < logDraft.players.length) logDraft.slots.push(null);
      delete logDraft.colors[pid]; delete logDraft.decks[pid]; delete logDraft.elimBy[pid];
      logDraft.scoops = logDraft.scoops.filter(id => id !== pid);
      Object.keys(logDraft.elimBy).forEach(v => { if (logDraft.elimBy[v] === pid) delete logDraft.elimBy[v]; });
      if (logDraft.firstBlood === pid) logDraft.firstBlood = '';
    } else {
      logDraft.players.push(pid);
      const order = Store.state.players.map(p => p.id);
      logDraft.players.sort((a, b) => order.indexOf(a) - order.indexOf(b));
      logDraft.slots.push(null);
    }
    logDraft.count = logDraft.players.length;
    renderLogPlayers(); renderLogSlots(); renderLogOpts();
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
    logDraft.players.forEach(pid => {
      const p = Store.state.players.find(x => x.id === pid);
      if (!p) return;
      const taken = logDraft.slots.includes(p.id);
      const b = document.createElement('button');
      b.textContent = p.nickname ? p.name + ' "' + p.nickname + '"' : p.name;
      b.disabled = taken;
      b.onclick = () => { logDraft.slots[slot] = p.id; $('picker-back').classList.remove('open'); renderLogSlots(); renderLogOpts(); };
      list.appendChild(b);
    });
    $('picker-back').classList.add('open');
  }

  function renderLogOpts() {
    const wrap = $('log-opts');
    const people = logDraft.players.slice();
    if (!people.length) { wrap.innerHTML = '<p class="muted">Pick players above to add optional stats.</p>'; return; }
    let html = '<p class="section-h">First blood</p><select class="field" id="opt-fb"><option value="">—</option>' +
      people.map(id => '<option value="' + id + '"' + (logDraft.firstBlood === id ? ' selected' : '') + '>' + esc(playerName(id)) + '</option>').join('') + '</select>';
    html += '<p class="section-h">Turns</p><input class="field" id="opt-turns" type="number" min="1" placeholder="e.g. 9" value="' + esc(logDraft.turns || '') + '">';
    html += '<p class="section-h">Colors & decks</p>';
    people.forEach(id => {
      const cols = logDraft.colors[id] || [];
      html += '<div style="margin-top:10px"><b>' + esc(playerName(id)) + '</b><div class="mana-row" data-mana="' + id + '">' +
        MANA.map(m => '<button class="mana' + (cols.includes(m) ? ' on' : '') + '" data-m="' + m + '">' + m + '</button>').join('') + '</div>' +
        '<input class="field mt" data-deck="' + id + '" placeholder="Deck nickname (optional)" style="padding:10px 12px;font-size:14px" value="' + esc(logDraft.decks[id] || '') + '"></div>';
    });
    html += '<p class="section-h">Eliminated by</p>';
    people.forEach(id => {
      if (logDraft.slots[0] === id) return; // winner was not eliminated
      html += '<div style="display:flex;align-items:center;gap:10px;margin-top:8px"><span class="muted" style="font-size:13px;flex:1">' + esc(playerName(id)) + '</span>' +
        '<select class="field" data-elimby="' + id + '" style="flex:2;padding:10px 12px;font-size:14px"><option value="">—</option>' +
        people.filter(x => x !== id).map(x => '<option value="' + x + '"' + (logDraft.elimBy[id] === x ? ' selected' : '') + '>' + esc(playerName(x)) + '</option>').join('') + '<option value="__scooped__"' + (logDraft.scoops.includes(id) ? ' selected' : '') + '>Scooped</option></select></div>';
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
    $$('#log-opts [data-deck]').forEach(i => { clearable(i); i.oninput = () => { logDraft.decks[i.dataset.deck] = i.value; }; });
    $$('#log-opts [data-elimby]').forEach(sel => sel.onchange = () => {
      const vid = sel.dataset.elimby;
      if (sel.value === '__scooped__') { delete logDraft.elimBy[vid]; if (!logDraft.scoops.includes(vid)) logDraft.scoops.push(vid); }
      else if (sel.value) { logDraft.elimBy[vid] = sel.value; logDraft.scoops = logDraft.scoops.filter(id => id !== vid); }
      else { delete logDraft.elimBy[vid]; logDraft.scoops = logDraft.scoops.filter(id => id !== vid); }
    });
  }

  function initLog() {
    $('picker-cancel').onclick = () => $('picker-back').classList.remove('open');
    $('picker-back').onclick = e => { if (e.target.id === 'picker-back') $('picker-back').classList.remove('open'); };
    $('log-dateinput').onchange = e => {
      if (e.target.value) { logDraft.date = e.target.value; $('log-date').textContent = fmtDateLong(logDraft.date); }
    };
    $('log-optbtn').onclick = () => { $('log-opts').classList.toggle('hidden'); renderLogOpts(); };
    $('log-review').onclick = () => {
      if (logDraft.players.length < 4) { alert('Pick at least 4 players for a game.'); return; }
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

    // named elimination credit: victim -> killer, sanitized to real placements
    const elimBy = {};
    logDraft.slots.forEach((pid, i) => {
      if (i === 0) return; // winner was not eliminated
      const k = logDraft.elimBy[pid];
      if (k && k !== pid && logDraft.slots.includes(k)) elimBy[pid] = k;
    });
    // scoops: explicitly chosen only, never an eliminator, never counted as a kill
    const scooped = [];
    logDraft.slots.forEach((pid, i) => {
      if (i === 0) return; // winner was not eliminated
      if (logDraft.scoops.includes(pid) && !elimBy[pid]) scooped.push(pid);
    });
    const game = {
      date: logDraft.date, placements: logDraft.slots.slice(),
      firstBlood: logDraft.firstBlood || null,
      turns: parseInt(logDraft.turns, 10) || null,
      colors: Object.assign({}, logDraft.colors),
      decks: Object.assign({}, logDraft.decks),
      eliminatedBy: elimBy,
    };
    if (scooped.length) game.scooped = scooped;
    // editing a legacy count-only game without touching eliminators: keep its counts
    if (editing && !Object.keys(elimBy).length) {
      const orig = season.games.find(g => g.id === logDraft.editingId);
      if (orig && orig.eliminations) game.eliminations = Object.assign({}, orig.eliminations);
    }
    const base = editing ? season.games.filter(g => g.id !== logDraft.editingId) : season.games;
    const pv = S.previewImpact(S.seasonPlayers(st.players, season), base, game);
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
      // game-count seasons: stamp "begins" on first game (guarded — reconcileBegins is the source of truth)
      if (season.type === 'games' && season.games.length === 1) {
        const hasBegins = st.calendar.some(e => e.type === 'season' && e.title === season.name + ' begins');
        if (!hasBegins) st.calendar.push({ id: uid(), date: game.date, title: season.name + ' begins', type: 'season', color: st.pod.color });
        Store.save();
      }
      if (Store.seasonComplete(season)) {
        // season-end ritual
        const locked = Store.lockSeason(season.id);
        renderSeasonEnd(locked.id);
        show('s-end');
        showBackupNudge(season, 'lock');
      } else {
        enterMain('standings');
        showBackupNudge(season, 'half');
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
    const table = S.computeStandings(S.seasonPlayers(st.players, season), season.games);
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
      if (es.length) {
        const dots = document.createElement('span'); dots.className = 'dots';
        es.slice(0, 3).forEach(e => {
          const d = document.createElement('i');
          d.style.background = e.color || st.pod.color;
          dots.appendChild(d);
        });
        b.appendChild(dots);
      }
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
    $('share-cal').onclick = shareCalendar;
    clearable($('entry-title'));
    clearable($('entry-notes'));
    $('entry-cancel').onclick = () => $('ov-entry').classList.remove('open');
    $('entry-delete').onclick = () => {
      if (!entryEditingId) return;
      const e = Store.state.calendar.find(x => x.id === entryEditingId);
      if (e && confirm('Delete "' + e.title + '"?')) {
        Store.state.calendar = Store.state.calendar.filter(x => x.id !== entryEditingId);
        Store.save();
        $('ov-entry').classList.remove('open');
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
      $('ov-entry').classList.remove('open');
      renderCalendar();
    };
  }

  // Drag any bottom sheet down by its grab handle to dismiss it.
  // The sheet follows the finger; past ~110px (or a fast downward
  // flick) it slides away and closes, otherwise it springs back.
  // Touch uses touch events with preventDefault on move, so iOS can
  // never hand the gesture to the page behind the sheet (scroll
  // chaining); mouse/trackpad uses pointer events. Buttons and
  // backdrop taps keep working exactly as before.
  function initSheetDrag() {
    $$('.overlay .sheet, .sheet-back .sheet').forEach(sheet => {
      const grab = sheet.querySelector('.grab');
      if (!grab) return;
      let dragging = false, startY = 0, dy = 0, lastY = 0, lastT = 0, vel = 0, touchId = null;
      const begin = y => {
        dragging = true; startY = y; dy = 0; vel = 0;
        lastY = y; lastT = performance.now();
        sheet.style.transition = 'none';
      };
      const move = y => {
        dy = Math.max(0, y - startY);
        const now = performance.now();
        if (now > lastT) vel = (y - lastY) / (now - lastT);
        lastY = y; lastT = now;
        sheet.style.transform = 'translateY(' + dy + 'px)';
      };
      const end = () => {
        if (!dragging) return;
        dragging = false; touchId = null;
        sheet.style.transition = '';
        if (dy > 110 || (vel > 0.55 && dy > 40)) {
          sheet.style.transform = 'translateY(105%)';
          const ov = sheet.closest('.overlay, .sheet-back');
          setTimeout(() => { if (ov) ov.classList.remove('open'); sheet.style.transform = ''; }, 340);
        } else {
          sheet.style.transform = '';
        }
      };
      grab.addEventListener('touchstart', e => {
        const t = e.changedTouches[0];
        touchId = t.identifier;
        begin(t.clientY);
      }, { passive: true });
      grab.addEventListener('touchmove', e => {
        if (!dragging) return;
        const t = Array.from(e.touches).find(x => x.identifier === touchId);
        if (!t) return;
        e.preventDefault();
        move(t.clientY);
      }, { passive: false });
      grab.addEventListener('touchend', e => {
        if (touchId === null) return;
        if (Array.from(e.changedTouches).some(x => x.identifier === touchId)) end();
      });
      grab.addEventListener('touchcancel', end);
      grab.addEventListener('pointerdown', e => {
        if (e.pointerType !== 'mouse') return;
        begin(e.clientY);
        try { grab.setPointerCapture(e.pointerId); } catch (err) {}
      });
      grab.addEventListener('pointermove', e => {
        if (!dragging || e.pointerType !== 'mouse') return;
        move(e.clientY);
      });
      grab.addEventListener('pointerup', e => { if (e.pointerType === 'mouse') end(); });
      grab.addEventListener('pointercancel', e => { if (e.pointerType === 'mouse') end(); });
    });
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
    $('ov-entry').classList.add('open');
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
    $('ov-entry').classList.add('open');
  }

  // ---------- PLAYER PROFILE ----------  // ---------- PLAYER PROFILE ----------
  function openProfile(pid) {
    const st = Store.state;
    const p = st.players.find(x => x.id === pid);
    const season = Store.activeSeason();
    $('pp-avatar').innerHTML = p.photo ? '<img src="' + p.photo + '">' : esc(initials(p.name));
    $('pp-name').textContent = p.name;
    $('pp-share').onclick = () => sharePlayer(pid);
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
    const vs = S.eliminationVs(pid, all);
    const vsLine = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1])
      .map(([id, n]) => esc(playerName(id)) + ' ' + n).join(' · ');
    const elimVs = vsLine(vs.eliminated), elimBy = vsLine(vs.eliminatedBy);
    if (elimVs || elimBy) {
      $('pp-fun').innerHTML += (elimVs ? '<p class="kv">Eliminated <b>' + elimVs + '</b></p>' : '') +
        (elimBy ? '<p class="kv">Eliminated by <b>' + elimBy + '</b></p>' : '');
    }
    $('ov-player').classList.add('open');
  }

  async function sharePlayer(pid) {
    const st = Store.state;
    const p = st.players.find(x => x.id === pid); if (!p) return;
    const season = Store.activeSeason();
    const rows = [];
    let context = st.pod.name;
    if (season) {
      const s = S.playerStats(pid, season.games);
      const t = S.computeStandings(S.seasonPlayers(st.players, season), season.games);
      const all = t.ranked.concat(t.unranked || []);
      const rank = all.findIndex(x => x.id === pid);
      rows.push(['Season record', S.fmtWL(s) + ' · ' + S.fmtPct(s.winPct)]);
      rows.push(['Season points', s.points + ' pts']);
      if (rank >= 0) {
        const n = rank + 1;
        const ord = n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');
        rows.push(['Season rank', ord + ' of ' + all.length]);
      }
      rows.push(['Streak', s.streak ? s.streakDir + s.streak : '—']);
      context = st.pod.name + ' · ' + season.name;
    }
    const allGames = st.seasons.flatMap(se => se.games);
    const c = S.playerStats(pid, allGames);
    const chips = st.seasons.filter(se => se.champion === pid).length;
    rows.push(['Career record', S.fmtWL(c) + ' · ' + S.fmtPct(c.winPct)]);
    rows.push(['Championships', String(chips)]);
    rows.push(['Eliminations', String(c.eliminations)]);
    rows.push(['First bloods', String(c.firstBloods)]);
    const text = p.name + ' — ' + context + '\n' + rows.map(r => r[0] + ': ' + r[1]).join('\n');
    const photoImg = await loadImg(p.photo);
    const markImg = await loadImg('./assets/icon-tile.png');
    let ctx = context; if (ctx.length > 30) ctx = ctx.slice(0, 29) + '…';
    const slug = (p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'player');
    drawCard('', '', rows,
      { header: { pod: { name: p.name, color: st.pod.color }, seasonName: ctx, iconImg: photoImg, markImg }, noHighlight: true })
      .then(b => shareImage(b, 'podlog-player-' + slug + '.png', text));
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
  async function shareBackup() {
    const json = Store.backupJSON();
    const file = new File([json], 'podlog-backup.json', { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'PodLog backup' }); return; }
      catch (err) { if (err && err.name === 'AbortError') return; }
    }
    download('podlog-backup.json', json, 'application/json');
  }

  // ---- Photo crop editor: drag to move, pinch or slider to zoom, square
  // export (displays as a circle via the avatar CSS). Used by every photo
  // upload: pod icon and player photos, setup and Settings.
  // Player photos share one persistent picker input: iOS drops picks from
  // inputs created on the fly, which made new uploads flaky.
  let pendingAvatarSave = null;
  const cropState = { img: null, url: null, onSave: null, W: 0, H: 0, S: 0, zoom: 1, ox: 0, oy: 0, pointers: new Map(), pinchD: 0, pinchZoom: 1 };
  function cropBaseScale() { return Math.max(cropState.S / cropState.W, cropState.S / cropState.H); }
  function cropScale() { return cropBaseScale() * cropState.zoom; }
  function cropClamp() {
    const s = cropScale();
    const mx = Math.max(0, (cropState.W * s - cropState.S) / 2);
    const my = Math.max(0, (cropState.H * s - cropState.S) / 2);
    cropState.ox = Math.min(mx, Math.max(-mx, cropState.ox));
    cropState.oy = Math.min(my, Math.max(-my, cropState.oy));
  }
  function cropRender() {
    const st = cropState, s = cropScale(), img = $('crop-img');
    img.style.width = (st.W * s) + 'px';
    img.style.height = (st.H * s) + 'px';
    img.style.transform = 'translate(' + ((st.S - st.W * s) / 2 + st.ox) + 'px,' + ((st.S - st.H * s) / 2 + st.oy) + 'px)';
    $('crop-zoom').value = Math.round((st.zoom - 1) / 3 * 100);
  }
  function openCropEditor(file, onSave) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      cropState.img = img; cropState.url = url; cropState.onSave = onSave;
      cropState.W = img.naturalWidth; cropState.H = img.naturalHeight;
      cropState.zoom = 1; cropState.ox = 0; cropState.oy = 0;
      $('crop-img').src = url;
      $('ov-crop').classList.add('open');
      requestAnimationFrame(() => {
        cropState.S = $('crop-stage').clientWidth;
        if (!cropState.S) return;
        cropClamp(); cropRender();
      });
    };
    img.onerror = () => { URL.revokeObjectURL(url); alert('Could not load that photo.'); };
    img.src = url;
  }
  function closeCropEditor() {
    $('ov-crop').classList.remove('open');
    if (cropState.url) URL.revokeObjectURL(cropState.url);
    cropState.url = null; cropState.img = null; cropState.onSave = null;
    cropState.pointers.clear(); cropState.pinchD = 0;
  }
  function cropExport() {
    const st = cropState, s = cropScale();
    const left = (st.S - st.W * s) / 2 + st.ox, top = (st.S - st.H * s) / 2 + st.oy;
    const c = document.createElement('canvas'); c.width = 512; c.height = 512;
    c.getContext('2d').drawImage(st.img, (0 - left) / s, (0 - top) / s, st.S / s, st.S / s, 0, 0, 512, 512);
    return c.toDataURL('image/jpeg', 0.85);
  }
  function cropPointerDown(e) {
    if (!cropState.img) return;
    e.preventDefault();
    $('crop-stage').setPointerCapture(e.pointerId);
    cropState.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (cropState.pointers.size === 2) {
      const [a, b] = [...cropState.pointers.values()];
      cropState.pinchD = Math.hypot(a.x - b.x, a.y - b.y);
      cropState.pinchZoom = cropState.zoom;
    }
  }
  function cropPointerMove(e) {
    if (!cropState.pointers.has(e.pointerId)) return;
    e.preventDefault();
    const prev = cropState.pointers.get(e.pointerId);
    cropState.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (cropState.pointers.size === 1) {
      cropState.ox += e.clientX - prev.x;
      cropState.oy += e.clientY - prev.y;
      cropClamp(); cropRender();
    } else if (cropState.pointers.size === 2 && cropState.pinchD > 0) {
      const [a, b] = [...cropState.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const rect = $('crop-stage').getBoundingClientRect();
      const stageX = (a.x + b.x) / 2 - rect.left, stageY = (a.y + b.y) / 2 - rect.top;
      const s0 = cropBaseScale() * cropState.pinchZoom;
      const px = (stageX - (cropState.S - cropState.W * s0) / 2 - cropState.ox) / s0;
      const py = (stageY - (cropState.S - cropState.H * s0) / 2 - cropState.oy) / s0;
      cropState.zoom = Math.min(4, Math.max(1, cropState.pinchZoom * d / cropState.pinchD));
      const s1 = cropScale();
      cropState.ox = stageX - (cropState.S - cropState.W * s1) / 2 - px * s1;
      cropState.oy = stageY - (cropState.S - cropState.H * s1) / 2 - py * s1;
      cropClamp(); cropRender();
    }
  }
  function cropPointerUp(e) {
    cropState.pointers.delete(e.pointerId);
    if (cropState.pointers.size < 2) cropState.pinchD = 0;
  }

  // Backup nudge: once per season at the halfway mark, once at lock.
  // Shown, not nagging: dismissing still counts as shown for that trigger.
  function seasonAtHalfway(season) {
    if (!season || season.status !== 'active') return false;
    if (season.type === 'games') {
      return !!season.gameCount && season.games.length >= Math.ceil(season.gameCount / 2);
    }
    if (season.type === 'dates' && season.startDate && season.endDate) {
      const toMs = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
      return toMs(todayISO()) >= (toMs(season.startDate) + toMs(season.endDate)) / 2;
    }
    return false;
  }

  function showBackupNudge(season, kind) {
    if (!season) return;
    const flag = kind === 'lock' ? 'backupNudgeLock' : 'backupNudgeHalf';
    if (season[flag]) return;
    if (kind === 'half' && !seasonAtHalfway(season)) return;
    season[flag] = true; Store.save();
    $('backup-title').textContent = kind === 'lock' ? 'Season locked' : 'Halfway there';
    $('backup-msg').textContent = kind === 'lock'
      ? 'A full season of games lives on this phone. Save a backup copy to Files before you start the next one.'
      : 'You are halfway through ' + season.name + '. Your season lives on this phone, so a backup is cheap insurance. Save a copy to Files?';
    $('ov-backup').classList.add('open');
  }

  function openActionSheet(p) {
    $('action-title').textContent = p.name;
    $('action-archive').onclick = () => {
      $('ov-action').classList.remove('open');
      const active = Store.state.players.filter(x => !x.archived);
      if (active.length <= 4) { alert('A pod needs at least 4 active players.'); return; }
      p.archived = true; Store.save(); renderSettings();
    };
    $('action-remove').onclick = () => {
      $('ov-action').classList.remove('open');
      const active = Store.state.players.filter(x => !x.archived);
      if (active.length <= 4) { alert('A pod needs at least 4 active players.'); return; }
      const hasGames = Store.state.seasons.some(s => s.games.some(g => g.placements.includes(p.id)));
      if (hasGames) { alert(p.name + ' has logged games, so they can\'t be removed. Archive them instead to keep them in the record but out of new games.'); return; }
      Store.state.players = Store.state.players.filter(x => x.id !== p.id);
      Store.save(); renderSettings();
    };
    $('ov-action').classList.add('open');
  }

  function renderSettings() {
    const s = Store.state.settings;
    $('set-remind').checked = s.remind;
    $('set-milestone').checked = s.milestone;
    // pod
    const pod = Store.state.pod;
    if (pod) {
      $('set-podname').value = pod.name;
      swatchRow($('set-podcolors'), pod.color, hex => {
        pod.color = hex;
        // keep auto season markers on the calendar in sync immediately
        const season = Store.activeSeason();
        if (season) {
          Store.state.calendar.forEach(e => {
            if (e.type === 'season' && (e.title === season.name + ' begins' || e.title === season.name + ' ends')) e.color = hex;
          });
        }
        Store.save(); applyPodColor();
      });
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
    Store.state.players.filter(p => !p.archived).forEach(p => {
      const row = document.createElement('div'); row.className = 'player-row';
      const av = document.createElement('button'); av.className = 'avatar'; av.title = 'Change photo';
      av.innerHTML = p.photo ? '<img src="' + p.photo + '">' : esc(initials(p.name));
      av.onclick = () => {
        pendingAvatarSave = dataUrl => { p.photo = dataUrl; Store.save(); renderSettings(); };
        $('set-avatar-file').click();
      };
      const nm = document.createElement('input'); nm.className = 'field'; nm.value = p.name; nm.placeholder = 'Name';
      nm.onchange = () => { p.name = nm.value.trim() || p.name; Store.save(); renderSettings(); };
      const nn = document.createElement('input'); nn.className = 'field'; nn.placeholder = 'Nickname (optional)';
      nn.style.maxWidth = '38%'; nn.value = p.nickname || '';
      nn.onchange = () => { p.nickname = nn.value.trim(); Store.save(); };
      const rm = document.createElement('button'); rm.className = 'btn-secondary'; rm.textContent = '…'; rm.title = 'Player options';
      rm.style.cssText = 'padding:10px 14px;font-size:18px;flex:none;';
      rm.onclick = () => openActionSheet(p);
      row.appendChild(av); row.appendChild(nm); row.appendChild(nn); row.appendChild(rm); sr.appendChild(row);
      clearable(nm); clearable(nn);
    });
    // add a player (roster is 4-10 active players)
    const addRow = document.createElement('div'); addRow.className = 'player-row';
    const addNm = document.createElement('input'); addNm.className = 'field'; addNm.placeholder = 'New player name'; addNm.maxLength = 40;
    const addBtn = document.createElement('button'); addBtn.className = 'btn-secondary'; addBtn.textContent = 'Add'; addBtn.style.cssText = 'padding:12px 18px;flex:none;';
    const activeCount = () => Store.state.players.filter(x => !x.archived).length;
    addBtn.disabled = activeCount() >= 10;
    addBtn.onclick = () => {
      const name = addNm.value.trim();
      if (!name || activeCount() >= 10) return;
      Store.state.players.push({ id: uid(), name, nickname: '', photo: null });
      Store.save(); renderSettings();
    };
    addRow.appendChild(addNm); addRow.appendChild(addBtn); sr.appendChild(addRow);
    if (activeCount() >= 10) {
      const full = document.createElement('p'); full.className = 'muted'; full.style.cssText = 'font-size:13px;margin:10px 0 0';
      full.textContent = 'Pod is full (10 active players).';
      sr.appendChild(full);
    }
    // archived players: still in the record, out of new games, reversible
    const archived = Store.state.players.filter(p => p.archived);
    if (archived.length) {
      const ah = document.createElement('p'); ah.className = 'section-h'; ah.style.marginTop = '18px'; ah.textContent = 'Archived';
      sr.appendChild(ah);
      archived.forEach(p => {
        const row = document.createElement('div'); row.className = 'player-row';
        const av = document.createElement('div'); av.className = 'avatar';
        av.innerHTML = p.photo ? '<img src="' + p.photo + '">' : esc(initials(p.name));
        const nm = document.createElement('span'); nm.className = 'muted'; nm.style.flex = '1'; nm.textContent = p.name;
        const un = document.createElement('button'); un.className = 'btn-secondary'; un.textContent = 'Unarchive'; un.style.cssText = 'padding:12px 18px;flex:none;';
        un.onclick = () => {
          if (activeCount() >= 10) { alert('Pod is full (10 active players).'); return; }
          p.archived = false; Store.save(); renderSettings();
        };
        row.appendChild(av); row.appendChild(nm); row.appendChild(un); sr.appendChild(row);
      });
    }
  }

  function initSettings() {
    clearable($('set-podname'));
    $('set-podname').onchange = e => {
      const v = e.target.value.trim();
      if (v && Store.state.pod) { Store.state.pod.name = v; Store.save(); }
    };
    $('set-podicon-upload').onclick = () => $('set-podicon-file').click();
    $('set-podicon-file').onchange = e => {
      const f = e.target.files[0]; if (!f || !Store.state.pod) return;
      openCropEditor(f, dataUrl => { Store.state.pod.iconDataUrl = dataUrl; Store.state.pod.glyph = null; Store.save(); renderStandings(); });
      e.target.value = '';
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
    $('set-backup').onclick = shareBackup;
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
  function loadImg(src) {
    if (!src) return Promise.resolve(null);
    return new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  }
  function inkOn(hex) {
    const n = parseInt((hex || '#3E2FDC').slice(1), 16);
    const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return lum > 0.6 ? '#111' : '#fff';
  }
  async function drawCard(title, sub, rows, opts) {
    opts = opts || {};
    const W = 1080, rowH = opts.rowH || 88, H = 320 + rows.length * rowH + 80;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    const cardBg = dark ? '#1c1c1e' : '#ffffff';
    const cardText = dark ? '#f5f5f7' : '#111';
    const cardMuted = dark ? '#98989f' : '#6e6e73';
    const cardLead = dark ? '#0f2e18' : '#e5f4e9';
    c.fillStyle = cardBg; c.fillRect(0, 0, W, H);
    const bandColor = (opts.header && opts.header.pod.color) || opts.bandColor || '#3E2FDC';
    const ink = inkOn(bandColor);
    c.fillStyle = bandColor; c.fillRect(0, 0, W, 220);
    if (opts.header) {
      const pod = opts.header.pod, mark = opts.header.markImg, icon = opts.header.iconImg;
      const cx = 120, cy = 110, r = 60;
      c.save();
      c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.clip();
      if (icon) {
        const s = Math.min(icon.width, icon.height);
        c.drawImage(icon, (icon.width - s) / 2, (icon.height - s) / 2, s, s, cx - r, cy - r, r * 2, r * 2);
      } else {
        c.fillStyle = pod.color || '#3E2FDC'; c.fillRect(cx - r, cy - r, r * 2, r * 2);
        const label = pod.glyph || initials(pod.name);
        c.fillStyle = ink; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.font = '700 ' + (label.length > 1 ? 52 : 72) + 'px -apple-system, sans-serif';
        c.fillText(label, cx, cy + 2);
      }
      c.restore();
      let pname = pod.name || 'My Pod';
      if (pname.length > 16) pname = pname.slice(0, 15) + '…';
      c.fillStyle = ink; c.font = '800 64px -apple-system, sans-serif';
      c.fillText(pname, 210, 118);
      c.font = '500 36px -apple-system, sans-serif'; c.fillStyle = ink === '#fff' ? 'rgba(255,255,255,.85)' : 'rgba(17,17,17,.7)';
      c.fillText(opts.header.seasonName, 210, 178);
      if (mark) {
        c.save();
        roundRect(c, W - 60 - 110, 55, 110, 110, 20); c.clip();
        c.drawImage(mark, W - 60 - 110, 55, 110, 110);
        c.restore();
      }
    } else {
      const wm = await loadImg('./assets/PODLOG-TEXT-BLACKwOUTLINE.png');
      if (wm) {
        c.drawImage(wm, 60, 10, 301, 100);
      } else {
        c.fillStyle = ink; c.font = '800 64px -apple-system, sans-serif';
        c.fillText('PODLOG', 60, 105);
      }
      c.font = '500 36px -apple-system, sans-serif'; c.fillStyle = ink === '#fff' ? 'rgba(255,255,255,.85)' : 'rgba(17,17,17,.7)';
      c.fillText(title, 60, 165);
    }
    c.fillStyle = cardMuted; c.font = '500 32px -apple-system, sans-serif';
    c.fillText(sub, 60, 275);
    const cols = opts.colX || [70, 230, 565, 695, 835, 975];
    rows.forEach((r, i) => {
      const y = 340 + i * rowH;
      if (i === 0 && !opts.noHighlight) { c.fillStyle = cardLead; roundRect(c, 40, y - 58, W - 80, rowH - 8, 18); c.fill(); }
      c.fillStyle = cardText;
      if (r.length > 2) {
        r.forEach((cell, j) => {
          const last = j === r.length - 1;
          c.font = (j === 0 || (opts.boldLast && last)) ? '700 38px -apple-system, sans-serif' : '500 36px -apple-system, sans-serif';
          if (opts.rightLast && last) { c.textAlign = 'right'; c.fillText(cell, 1020, y); c.textAlign = 'left'; }
          else c.fillText(cell, cols[j], y);
        });
      } else {
        c.font = '700 38px -apple-system, sans-serif';
        c.fillText(r[0], 70, y);
        c.font = '500 36px -apple-system, sans-serif';
        c.fillText(r[1], 420, y);
        const sub = opts.subLines && opts.subLines[i];
        if (sub) { c.fillStyle = cardMuted; c.font = '500 28px -apple-system, sans-serif'; c.fillText(sub, 420, y + 38); }
      }
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
  async function shareStandings() {
    const st = Store.state; const season = Store.activeSeason(); if (!season) return;
    const t = S.computeStandings(S.seasonPlayers(st.players, season), season.games);
    const rows = t.ranked.slice(0, 6).map((p, i) => {
      const name = p.name.length > 15 ? p.name.slice(0, 14) + '…' : p.name;
      const streak = p.streakDir ? p.streakDir + p.streak : '—';
      return [(i + 1) + '.', name, S.fmtWL(p), S.fmtPct(p.winPct), p.points + ' pts', streak];
    });
    const text = st.pod.name + ' — ' + season.name + '\n' + rows.map(r => r.join('  ')).join('\n');
    const iconImg = await loadImg(st.pod.iconDataUrl);
    const markImg = await loadImg('./assets/icon-tile.png');
    drawCard('', 'Game ' + season.games.length + (season.type === 'games' ? ' of ' + season.gameCount : ''), rows,
      { header: { pod: st.pod, seasonName: season.name, iconImg, markImg } })
      .then(b => shareImage(b, 'podlog-standings.png', text));
  }
  async function shareEnd(season) {
    const st = Store.state;
    const champ = playerName(season.champion), spoon = playerName(season.woodenSpoon);
    const text = st.pod.name + ' — ' + season.name + ' FINAL\nChampion: ' + champ + '\nWooden spoon: ' + spoon;
    const t = S.computeStandings(S.seasonPlayers(st.players, season), season.games);
    const rows = t.ranked.concat(t.unranked || []).map((p, i) => {
      const name = p.name.length > 15 ? p.name.slice(0, 14) + '…' : p.name;
      const streak = p.streakDir ? p.streakDir + p.streak : '—';
      return [(i + 1) + '.', name, S.fmtWL(p), S.fmtPct(p.winPct), p.points + ' pts', streak];
    });
    const iconImg = await loadImg(st.pod.iconDataUrl);
    const markImg = await loadImg('./assets/icon-tile.png');
    drawCard('', 'Final', rows,
      { header: { pod: st.pod, seasonName: season.name, iconImg, markImg } })
      .then(b => shareImage(b, 'podlog-champion.png', text));
  }
  async function shareGame(g) {
    const st = Store.state; const season = Store.activeSeason(); if (!season) return;
    const ord = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];
    const cardLabel = (pid) => {
      let s = playerName(pid) + (g.decks && g.decks[pid] ? ' (' + g.decks[pid] + ')' : '');
      return s.length > 30 ? s.slice(0, 29) + '…' : s;
    };
    const rows = g.placements.map((pid, i) => [ord[i], cardLabel(pid)]);
    const elimParts = Object.entries(g.eliminatedBy || {}).filter(([, k]) => k)
      .map(([v, k]) => playerName(k) + ' eliminated ' + playerName(v));
    const scooped = (g.scooped || []).filter(id => g.placements.includes(id));
    const subLines = g.placements.map(pid => {
      const k = (g.eliminatedBy || {})[pid];
      if (k) return 'Eliminated by ' + playerName(k);
      if (scooped.includes(pid)) return 'Scooped';
      return null;
    });
    const text = st.pod.name + ' — ' + season.name + ' · Game ' + g.number + ' · ' + fmtDate(g.date) + '\n' +
      rows.map(r => r[0] + ' ' + r[1]).join('\n') +
      (elimParts.length ? '\n' + elimParts.join(' · ') : '') +
      (scooped.length ? '\nScooped: ' + scooped.map(id => playerName(id)).join(', ') : '') +
      (g.firstBlood ? '\nFirst blood: ' + playerName(g.firstBlood) : '');
    const iconImg = await loadImg(st.pod.iconDataUrl);
    const markImg = await loadImg('./assets/icon-tile.png');
    drawCard('', 'Game ' + g.number + ' · ' + fmtDate(g.date), rows,
      { header: { pod: st.pod, seasonName: season.name, iconImg, markImg }, rowH: 112, subLines })
      .then(b => shareImage(b, 'podlog-game-' + g.number + '.png', text));
  }

  function calTypeLabel(t) {
    if (t === 'game') return 'Logged game';
    if (t === 'season') return 'Season';
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  async function shareCalendar() {
    const st = Store.state;
    const prefix = calY + '-' + String(calM + 1).padStart(2, '0');
    const monthName = new Date(calY, calM, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const entries = [];
    st.calendar.forEach(e => { if (e.date.indexOf(prefix) === 0) entries.push(e); });
    (Store.activeSeason() || { games: [] }).games.forEach(g => {
      if (g.date.indexOf(prefix) === 0) entries.push({ date: g.date, title: 'Game ' + g.number + ' · ' + playerName(g.placements[0]) + ' 1st', type: 'game' });
    });
    entries.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    const short = iso => {
      const p = iso.split('-');
      return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };
    const trunc = s => s.length > 32 ? s.slice(0, 31) + '…' : s;
    let rows, subLines;
    if (!entries.length) {
      rows = [['No events this month', '']];
      subLines = [];
    } else {
      rows = entries.map(e => [short(e.date), trunc(e.title)]);
      subLines = entries.map(e => calTypeLabel(e.type));
    }
    const season = Store.activeSeason();
    const text = st.pod.name + ' — ' + monthName + (entries.length ? '\n' + entries.map(e => short(e.date) + '  ' + e.title).join('\n') : '\nNo events this month');
    const iconImg = await loadImg(st.pod.iconDataUrl);
    const markImg = await loadImg('./assets/icon-tile.png');
    drawCard('', season ? season.name : '', rows,
      { header: { pod: st.pod, seasonName: monthName, iconImg, markImg }, noHighlight: true, rowH: 112, subLines })
      .then(b => shareImage(b, 'podlog-calendar-' + prefix + '.png', text));
  }

  // ---------- INIT ----------
  function init() {
    Store.load();
    applyTheme(); applyPodColor();
    if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

    $$('[data-go]').forEach(b => b.onclick = () => show(b.dataset.go));
    $('log-back').onclick = () => closeLogMorph();
    $$('#folder-tabs button').forEach(b => b.onclick = () => switchTab(b.dataset.tab));
    $('btn-create-pod').onclick = () => { show('s-c1'); };
    $('c4-start').onclick = commitCreate;
    $('fab-log').onclick = openLogMorph;
    $('st-allgames').onclick = () => { renderGames(); show('s-games'); };
    $('pp-close').onclick = () => $('ov-player').classList.remove('open');
    $('ov-player').onclick = e => { if (e.target.id === 'ov-player') $('ov-player').classList.remove('open'); };
    $('ov-entry').onclick = e => { if (e.target.id === 'ov-entry') $('ov-entry').classList.remove('open'); };
    $('action-cancel').onclick = () => $('ov-action').classList.remove('open');
    $('ov-action').onclick = e => { if (e.target.id === 'ov-action') $('ov-action').classList.remove('open'); };
    $('backup-now').onclick = () => { $('ov-backup').classList.remove('open'); shareBackup(); };
    $('backup-later').onclick = () => $('ov-backup').classList.remove('open');
    $('ov-backup').onclick = e => { if (e.target.id === 'ov-backup') $('ov-backup').classList.remove('open'); };
    $('crop-cancel').onclick = closeCropEditor;
    $('set-avatar-file').onchange = e => {
      const f = e.target.files[0];
      e.target.value = '';
      const cb = pendingAvatarSave; pendingAvatarSave = null;
      if (!f || !cb) return;
      openCropEditor(f, cb);
    };
    $('set-avatar-file').addEventListener('cancel', () => { pendingAvatarSave = null; });
    $('crop-save').onclick = () => {
      const cb = cropState.onSave;
      const url = cropExport();
      closeCropEditor();
      if (cb) cb(url);
    };
    $('crop-zoom').oninput = e => {
      cropState.zoom = 1 + (e.target.value / 100) * 3;
      cropClamp(); cropRender();
    };
    const cStage = $('crop-stage');
    cStage.addEventListener('pointerdown', cropPointerDown);
    cStage.addEventListener('pointermove', cropPointerMove);
    cStage.addEventListener('pointerup', cropPointerUp);
    cStage.addEventListener('pointercancel', cropPointerUp);
    cStage.addEventListener('wheel', e => {
      if (!cropState.img) return;
      e.preventDefault();
      cropState.zoom = Math.min(4, Math.max(1, cropState.zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
      cropClamp(); cropRender();
    }, { passive: false });
    window.addEventListener('resize', () => {
      if ($('ov-crop').classList.contains('open') && cropState.img) {
        cropState.S = $('crop-stage').clientWidth;
        cropClamp(); cropRender();
      }
    });
    $('share-standings').onclick = shareStandings;
    $('share-hof').onclick = async () => {
      const hof = S.hallOfFame(Store.state.players, Store.state.seasons);
      const trunc = n => (n.length > 15 ? n.slice(0, 14) + '…' : n);
      const rows = hof.rows.slice(0, 6).map(r => [r.label, trunc(r.name), r.value]);
      const text = 'Hall of Fame\n' + hof.rows.slice(0, 6).map(r => r.label + ': ' + r.name + ' (' + r.value + ')').join('\n');
      const iconImg = await loadImg(Store.state.pod.iconDataUrl);
      const markImg = await loadImg('./assets/icon-tile.png');
      drawCard('', 'Career records', rows,
        { header: { pod: Store.state.pod, seasonName: 'Hall of Fame', iconImg, markImg }, noHighlight: true, colX: [70, 600, 900], boldLast: true, rightLast: true })
        .then(b => shareImage(b, 'podlog-hof.png', text));
    };

    initCreate1(); initCreate2(); initCreate3(); initLog(); initCalendar(); initSettings(); initSheetDrag();

    if (Store.state.setupDone && Store.state.pod) { enterMain('standings'); showBackupNudge(Store.activeSeason(), 'half'); }
    else show('s-first');

    // PWA service worker
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
