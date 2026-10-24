/* PodLog store — state, persistence, export. No DOM. */
(function (root) {
  'use strict';

  const KEY = 'podlog-state-v1';
  const COLORS = [
    { name: 'White',   hex: '#f5f5f7' },
    { name: 'Indigo',  hex: '#3E2FDC' },
    { name: 'Black',   hex: '#1c1c1e' },
    { name: 'Red',     hex: '#d92d20' },
    { name: 'Green',   hex: '#1f8a3b' },
    { name: 'Gold',    hex: '#d9a821' },
    { name: 'Silver',  hex: '#b9b9c0' },
    { name: 'Charcoal',hex: '#4a4a4e' },
  ];

  function uid() {
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }
  function todayISO() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function blankState() {
    return {
      v: 1,
      pod: null,               // { name, iconDataUrl?, glyph?, color }
      players: [],             // [{ id, name, nickname, photo? }]
      seasons: [],             // [{ id, number, name, type, gameCount?, startDate?, endDate?, status, games: [], champion?, woodenSpoon?, lockedAt? }]
      calendar: [],            // [{ id, date, title, type, color, notes?, quick? }]
      quickActions: [],        // custom quick-add buttons [{ id, title, type, color }]
      settings: { remind: true, milestone: true, theme: 'system' },
      activeSeasonId: null,
      setupDone: false,
    };
  }

  const Store = {
    state: blankState(),

    load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) {
          const s = JSON.parse(raw);
          if (s && s.v === 1) { this.state = s; this.reconcileBegins(); return true; }
        }
      } catch (e) { /* corrupted or unavailable — start fresh */ }
      this.state = blankState();
      return false;
    },

    // Self-healing: game-count seasons get exactly one "begins" marker,
    // dated to the earliest logged game (or none if no games yet).
    reconcileBegins() {
      const st = this.state;
      let changed = false;
      (st.seasons || []).forEach(s => {
        if (s.type !== 'games' || s.status !== 'active') return;
        const begins = st.calendar.filter(e => e.type === 'season' && e.title === s.name + ' begins');
        if (!s.games.length) {
          if (begins.length) {
            begins.forEach(e => st.calendar.splice(st.calendar.indexOf(e), 1));
            changed = true;
          }
          return;
        }
        const first = s.games.slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0)[0];
        const ok = begins.length === 1 && begins[0].date === first.date && begins[0].color === st.pod.color;
        if (ok) return;
        begins.forEach((e, i) => { if (i > 0) st.calendar.splice(st.calendar.indexOf(e), 1); });
        if (begins.length) {
          begins[0].date = first.date; begins[0].color = st.pod.color;
        } else {
          st.calendar.push({ id: uid(), date: first.date, title: s.name + ' begins', type: 'season', color: st.pod.color });
        }
        changed = true;
      });
      if (changed) this.save();
    },

    save() {
      try { localStorage.setItem(KEY, JSON.stringify(this.state)); }
      catch (e) { /* storage full/blocked — data lives in memory this session */ }
    },

    reset() { this.state = blankState(); this.save(); },

    activeSeason() {
      return this.state.seasons.find(s => s.id === this.state.activeSeasonId) || null;
    },

    nextGameNumber() {
      const s = this.activeSeason();
      return s ? s.games.length + 1 : 1;
    },

    logGame(game) {
      const s = this.activeSeason();
      if (!s || s.status !== 'active') return null;
      game.id = uid();
      game.number = s.games.length + 1;
      s.games.push(game);
      this.save();
      return game;
    },

    updateGame(id, data) {
      const s = this.activeSeason();
      if (!s || s.status !== 'active') return null;
      const i = s.games.findIndex(g => g.id === id);
      if (i < 0) return null;
      const keep = { id, number: s.games[i].number };
      s.games[i] = Object.assign({}, s.games[i], data, keep);
      this.save();
      return s.games[i];
    },

    deleteGame(id) {
      const s = this.activeSeason();
      if (!s || s.status !== 'active') return false;
      const i = s.games.findIndex(g => g.id === id);
      if (i < 0) return false;
      s.games.splice(i, 1);
      // renumber
      s.games.forEach((g, n) => { g.number = n + 1; });
      this.reconcileBegins();
      this.save();
      return true;
    },

    // ---- season end ----
    seasonComplete(season) {
      if (season.type === 'games') return season.games.length >= (season.gameCount || 0);
      if (season.type === 'dates' && season.endDate) return todayISO() > season.endDate;
      return false;
    },

    lockSeason(seasonId) {
      const st = this.state;
      const season = st.seasons.find(s => s.id === seasonId);
      if (!season || season.status !== 'active') return null;
      const S = root.PodLogScoring;
      const table = S.computeStandings(st.players, season.games);
      const champ = table.ranked[0] || null;
      const last = table.ranked[table.ranked.length - 1] || table.unranked[table.unranked.length - 1] || null;
      season.status = 'locked';
      season.lockedAt = todayISO();
      season.champion = champ ? champ.id : null;
      season.woodenSpoon = last ? last.id : null;
      // stamp season-end on calendar
      st.calendar.push({
        id: uid(), date: todayISO(),
        title: season.name + ' ends', type: 'season', color: st.pod ? st.pod.color : '#3E2FDC',
        notes: champ ? 'Champion: ' + playerName(st, champ.id) : '',
      });
      this.save();
      return season;
    },

    startNextSeason() {
      const st = this.state;
      const n = st.seasons.length + 1;
      const season = {
        id: uid(), number: n, name: 'Season ' + n,
        type: 'games', gameCount: 20, status: 'active', games: [],
      };
      st.seasons.push(season);
      st.activeSeasonId = season.id;
      this.save();
      return season;
    },

    // ---- export ----
    exportCSVs() {
      const st = this.state;
      const S = root.PodLogScoring;
      const byId = Object.fromEntries(st.players.map(p => [p.id, p.name]));
      const nm = id => byId[id] || '?';
      // game log
      let log = 'season,game,date,placement,player,points,first_blood,turns,deck,colors\n';
      st.seasons.forEach(se => se.games.forEach(g => {
        const pts = S.placementPoints(g);
        g.placements.forEach((pid, i) => {
          log += [csv(se.name), g.number, g.date, i + 1, csv(nm(pid)), pts[pid] || '',
            g.firstBlood === pid ? 'yes' : '', g.turns || '', csv(g.decks ? g.decks[pid] : ''),
            (g.colors ? g.colors[pid] : [] || []).join('+')].join(',') + '\n';
        });
      }));
      // standings (active season)
      let table = 'rank,player,w,l,win_pct,placement_points,streak,qualified\n';
      const s = this.activeSeason();
      if (s) {
        const st2 = S.computeStandings(st.players, s.games);
        st2.ranked.forEach((p, i) => {
          table += [i + 1, csv(p.name), p.wins, p.played - p.wins,
            Math.round(p.winPct * 100) + '%', p.points,
            (p.streakDir || '') + p.streak, 'yes'].join(',') + '\n';
        });
        st2.unranked.forEach(p => {
          table += ['', csv(p.name), p.wins, p.played - p.wins,
            Math.round(p.winPct * 100) + '%', p.points,
            (p.streakDir || '') + p.streak, 'no'].join(',') + '\n';
        });
      }
      return { gameLog: log, standings: table };
    },

    backupJSON() {
      return JSON.stringify(this.state, null, 2);
    },

    restoreJSON(text) {
      const s = JSON.parse(text);
      if (!s || s.v !== 1 || !Array.isArray(s.players)) throw new Error('Not a PodLog backup.');
      this.state = s;
      this.save();
    },
  };

  function csv(v) {
    v = String(v == null ? '' : v);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function playerName(st, id) {
    const p = st.players.find(p => p.id === id);
    return p ? p.name : '?';
  }

  const api = { Store, COLORS, uid, todayISO };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PodLogStore = api;
})(typeof self !== 'undefined' ? self : this);
