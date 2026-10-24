/* PodLog scoring engine — pure functions, no DOM.
   Standings rules (spec):
   - Primary sort: win percentage (wins / games played)
   - Tiebreaker 1 (STRICT): placement points. 1st = N pts (N = players in that game),
     by survival order. Only consulted when win% ties.
   - Tiebreaker 2: head-to-head — highest placement most often in games both played.
   - Tiebreaker 3: most wins.
   - Qualification: fixed 50% games-played floor to be ranked.
   - Draws: no winner; tied players split the average of the tied positions' points.
   - Scoops: eliminated at scoop time (placement recorded as entered).
*/

(function (root) {
  'use strict';

  // game = { id, number, date, placements: [playerId...] in finish order,
  //          ties: [[playerIds]] optional groups sharing a position,
  //          firstBlood: playerId?, eliminatedBy: {victimId: killerId}?,
  //          eliminations: {playerId: n}? (legacy count-only games) }
  // placements lists every player in the game, first element = 1st place.
  // Eliminations are cosmetic only: they never touch standings. Named credit
  // (eliminatedBy) is the source of truth; the count is derived from it so
  // legacy count-only games keep working.

  // { playerId: count } of eliminations credited in one game.
  function eliminationCounts(game) {
    const counts = {};
    if (game.eliminatedBy) {
      Object.values(game.eliminatedBy).forEach(id => { if (id) counts[id] = (counts[id] || 0) + 1; });
      if (Object.keys(counts).length) return counts;
    }
    return Object.assign({}, game.eliminations || {});
  }

  // Rivalry view for one player across games:
  // { eliminated: {otherId: n}, eliminatedBy: {otherId: n} }
  function eliminationVs(playerId, games) {
    const eliminated = {}, eliminatedBy = {};
    games.forEach(g => {
      Object.entries(g.eliminatedBy || {}).forEach(([victim, killer]) => {
        if (!killer) return;
        if (killer === playerId) eliminated[victim] = (eliminated[victim] || 0) + 1;
        if (victim === playerId) eliminatedBy[killer] = (eliminatedBy[killer] || 0) + 1;
      });
    });
    return { eliminated, eliminatedBy };
  }

  function placementPoints(game) {
    // returns { playerId: points }
    const n = game.placements.length;
    const pts = {};
    if (game.ties && game.ties.length) {
      // ties: array of groups; each group shares the average of its positions' points
      const placed = new Set();
      let pos = 1;
      // build position map from placements order, merging tie groups
      const order = game.placements.slice();
      for (const group of game.ties) {
        const idx = group.map(id => order.indexOf(id)).filter(i => i >= 0).sort((a, b) => a - b);
        if (!idx.length) continue;
        const startPos = idx[0] + 1;
        const groupPts = idx.map(i => n - i).reduce((a, b) => a + b, 0) / idx.length;
        idx.forEach(i => { pts[order[i]] = groupPts; placed.add(order[i]); });
      }
      order.forEach((id, i) => { if (!placed.has(id)) pts[id] = n - i; });
      return pts;
    }
    game.placements.forEach((id, i) => { pts[id] = n - i; });
    return pts;
  }

  function gameWinner(game) {
    if (game.ties && game.ties.length) {
      const firstGroup = game.ties.find(g => g.includes(game.placements[0]));
      if (firstGroup && firstGroup.length > 1) return null; // drawn win: no winner
    }
    return game.placements[0] || null;
  }

  function playerStats(playerId, games) {
    const s = {
      id: playerId, played: 0, wins: 0, points: 0,
      firstBloods: 0, eliminations: 0, streak: 0, streakDir: null,
      best: null, worst: null,
    };
    const ordered = games.slice().sort((a, b) => a.number - b.number);
    for (const g of ordered) {
      const idx = g.placements.indexOf(playerId);
      if (idx < 0) continue;
      s.played++;
      const pts = placementPoints(g);
      s.points += pts[playerId] || 0;
      const pos = idx + 1;
      s.best = s.best === null ? pos : Math.min(s.best, pos);
      s.worst = s.worst === null ? pos : Math.max(s.worst, pos);
      if (g.firstBlood === playerId) s.firstBloods++;
      const ec = eliminationCounts(g);
      if (ec[playerId]) s.eliminations += ec[playerId];
      const won = gameWinner(g) === playerId;
      if (won) {
        s.wins++;
        s.streak = s.streakDir === 'W' ? s.streak + 1 : 1;
        s.streakDir = 'W';
      } else {
        s.streak = s.streakDir === 'L' ? s.streak + 1 : 1;
        s.streakDir = 'L';
      }
    }
    s.winPct = s.played ? s.wins / s.played : 0;
    return s;
  }

  function headToHead(aId, bId, games) {
    // times A placed strictly higher than B in games both played
    let a = 0, b = 0;
    for (const g of games) {
      const ia = g.placements.indexOf(aId), ib = g.placements.indexOf(bId);
      if (ia < 0 || ib < 0) continue;
      if (ia < ib) a++; else if (ib < ia) b++;
    }
    return a - b; // >0 means A wins the tiebreak
  }

  function computeStandings(players, games) {
    const totalGames = games.length;
    const floor = Math.ceil(totalGames * 0.5);
    const stats = players.map(p => Object.assign({ name: p.name, nickname: p.nickname }, playerStats(p.id, games)));
    stats.forEach(s => { s.qualified = totalGames === 0 ? true : s.played >= floor; });

    const ranked = stats.filter(s => s.qualified);
    const unranked = stats.filter(s => !s.qualified);

    ranked.sort((a, b) => {
      if (b.winPct !== a.winPct) return b.winPct - a.winPct;
      if (b.points !== a.points) return b.points - a.points;      // strict tiebreak
      const h2h = headToHead(b.id, a.id, games);
      if (h2h !== 0) return h2h;
      return b.wins - a.wins;
    });
    unranked.sort((a, b) => b.winPct - a.winPct || b.points - a.points);

    return { ranked, unranked, totalGames, floor };
  }

  // What would the standings look like if `game` were added? (confirmation preview)
  function previewImpact(players, games, game) {
    const before = computeStandings(players, games);
    const after = computeStandings(players, games.concat([game]));
    const moves = after.ranked.map(s => {
      const bi = before.ranked.findIndex(x => x.id === s.id);
      const ai = after.ranked.findIndex(x => x.id === s.id);
      const b = before.ranked[bi];
      return {
        id: s.id, name: s.name,
        beforeW: b ? b.wins : 0, beforeL: b ? b.played - b.wins : 0,
        afterW: s.wins, afterL: s.played - s.wins,
        beforePct: b ? b.winPct : 0, afterPct: s.winPct,
        move: bi < 0 ? null : bi - ai, // + = climbed
        isNew: bi < 0,
      };
    });
    return { before, after, moves };
  }

  function fmtPct(p) { return Math.round(p * 100) + '%'; }
  function fmtWL(s) { return s.wins + '–' + (s.played - s.wins); }

  // Hall of Fame across LOCKED seasons only
  function hallOfFame(players, seasons) {
    const locked = seasons.filter(s => s.status === 'locked');
    const byId = Object.fromEntries(players.map(p => [p.id, p]));
    const name = id => (byId[id] ? byId[id].name : '?');
    const rec = (label, fn) => {
      let best = null;
      for (const s of locked) {
        const st = computeStandings(players, s.games);
        for (const p of st.ranked.concat(st.unranked)) {
          const v = fn(p, s);
          if (v !== null && (best === null || v.value > best.value)) best = v;
        }
      }
      if (!best) return null;
      return { label, name: name(best.id), value: best.display };
    };
    const rows = [];
    // championships
    const chips = {};
    locked.forEach(s => { if (s.champion) chips[s.champion] = (chips[s.champion] || 0) + 1; });
    const chipTop = Object.entries(chips).sort((a, b) => b[1] - a[1])[0];
    if (chipTop) rows.push({ label: 'Most championships', name: name(chipTop[0]), value: String(chipTop[1]) });
    // total wins
    const wins = {};
    locked.forEach(s => s.games.forEach(g => {
      const w = gameWinner(g);
      if (w) wins[w] = (wins[w] || 0) + 1;
    }));
    const winTop = Object.entries(wins).sort((a, b) => b[1] - a[1])[0];
    if (winTop) rows.push({ label: 'Most total wins', name: name(winTop[0]), value: String(winTop[1]) });
    // eliminations (named credit or legacy counts)
    const elims = {};
    locked.forEach(s => s.games.forEach(g => {
      Object.entries(eliminationCounts(g)).forEach(([id, n]) => { elims[id] = (elims[id] || 0) + n; });
    }));
    const elimTop = Object.entries(elims).sort((a, b) => b[1] - a[1])[0];
    if (elimTop) rows.push({ label: 'Most eliminations', name: name(elimTop[0]), value: String(elimTop[1]) });
    // best single-season record (min 5 games)
    let bestRec = null;
    locked.forEach(s => {
      if (s.games.length < 5) return;
      const st = computeStandings(players, s.games);
      st.ranked.forEach(p => {
        if (!bestRec || p.winPct > bestRec.winPct || (p.winPct === bestRec.winPct && p.wins > bestRec.wins))
          bestRec = { id: p.id, winPct: p.winPct, display: fmtWL(p) + ' · ' + fmtPct(p.winPct) };
      });
    });
    if (bestRec) rows.push({ label: 'Best single-season record', name: name(bestRec.id), value: bestRec.display });
    // longest win streak
    let bestStreak = null;
    locked.forEach(s => {
      const ordered = s.games.slice().sort((a, b) => a.number - b.number);
      const cur = {};
      ordered.forEach(g => {
        const w = gameWinner(g);
        Object.keys(cur).forEach(id => { if (id !== w) cur[id] = 0; });
        if (w) {
          cur[w] = (cur[w] || 0) + 1;
          if (!bestStreak || cur[w] > bestStreak.n) bestStreak = { id: w, n: cur[w] };
        }
      });
    });
    if (bestStreak) rows.push({ label: 'Longest win streak', name: name(bestStreak.id), value: String(bestStreak.n) });
    // most first bloods
    const fb = {};
    locked.forEach(s => s.games.forEach(g => { if (g.firstBlood) fb[g.firstBlood] = (fb[g.firstBlood] || 0) + 1; }));
    const fbTop = Object.entries(fb).sort((a, b) => b[1] - a[1])[0];
    if (fbTop) rows.push({ label: 'Most first bloods', name: name(fbTop[0]), value: String(fbTop[1]) });
    // fastest win (lowest turn count with a winner)
    let fast = null;
    locked.forEach(s => s.games.forEach(g => {
      if (g.turns && gameWinner(g) && (!fast || g.turns < fast.turns)) fast = { id: gameWinner(g), turns: g.turns };
    }));
    if (fast) rows.push({ label: 'Fastest win', name: name(fast.id), value: fast.turns + ' turns' });
    // wooden spoons
    const spoons = {};
    locked.forEach(s => { if (s.woodenSpoon) spoons[s.woodenSpoon] = (spoons[s.woodenSpoon] || 0) + 1; });
    const spoonTop = Object.entries(spoons).sort((a, b) => b[1] - a[1])[0];
    if (spoonTop) rows.push({ label: 'Wooden spoons', name: name(spoonTop[0]), value: String(spoonTop[1]) });
    return { rows, seasons: locked.length };
  }

  const api = { placementPoints, gameWinner, playerStats, headToHead, computeStandings, previewImpact, hallOfFame, fmtPct, fmtWL, eliminationCounts, eliminationVs };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PodLogScoring = api;
})(typeof self !== 'undefined' ? self : this);
