// NBA Team IDs for logo CDN
const TEAM_IDS = {
  OKC: 1610612760, SAS: 1610612759, DEN: 1610612743, LAL: 1610612747,
  HOU: 1610612745, MIN: 1610612750, DET: 1610612765, BOS: 1610612738,
  NYK: 1610612752, CLE: 1610612739, TOR: 1610612761, ATL: 1610612737,
  PHX: 1610612756, POR: 1610612757, LAC: 1610612746, GSW: 1610612744,
  PHI: 1610612755, ORL: 1610612753, CHA: 1610612766, MIA: 1610612748,
};

function getLogoUrl(abbr) {
  const id = TEAM_IDS[abbr];
  if (!id) return null;
  return `https://cdn.nba.com/logos/nba/${id}/global/L/logo.svg`;
}

// 2026 NBA Playoff Teams
const TEAMS = {
  west: {
    1: { name: 'Thunder', city: 'Oklahoma City', abbr: 'OKC' },
    2: { name: 'Spurs', city: 'San Antonio', abbr: 'SAS' },
    3: { name: 'Nuggets', city: 'Denver', abbr: 'DEN' },
    4: { name: 'Lakers', city: 'Los Angeles', abbr: 'LAL' },
    5: { name: 'Rockets', city: 'Houston', abbr: 'HOU' },
    6: { name: 'Timberwolves', city: 'Minnesota', abbr: 'MIN' },
  },
  east: {
    1: { name: 'Pistons', city: 'Detroit', abbr: 'DET' },
    2: { name: 'Celtics', city: 'Boston', abbr: 'BOS' },
    3: { name: 'Knicks', city: 'New York', abbr: 'NYK' },
    4: { name: 'Cavaliers', city: 'Cleveland', abbr: 'CLE' },
    5: { name: 'Raptors', city: 'Toronto', abbr: 'TOR' },
    6: { name: 'Hawks', city: 'Atlanta', abbr: 'ATL' },
  }
};

const PLAYIN_TEAMS = {
  west: [
    { name: 'Suns', city: 'Phoenix', abbr: 'PHX' },
    { name: 'Trail Blazers', city: 'Portland', abbr: 'POR' },
    { name: 'Clippers', city: 'Los Angeles', abbr: 'LAC' },
    { name: 'Warriors', city: 'Golden State', abbr: 'GSW' },
  ],
  east: [
    { name: '76ers', city: 'Philadelphia', abbr: 'PHI' },
    { name: 'Magic', city: 'Orlando', abbr: 'ORL' },
    { name: 'Hornets', city: 'Charlotte', abbr: 'CHA' },
    { name: 'Heat', city: 'Miami', abbr: 'MIA' },
  ]
};

// First round matchup structure: [higher seed, lower seed]
const FIRST_ROUND = {
  west: [
    { id: 'round1_w1', seeds: [1, 8] },
    { id: 'round1_w2', seeds: [4, 5] },
    { id: 'round1_w3', seeds: [3, 6] },
    { id: 'round1_w4', seeds: [2, 7] },
  ],
  east: [
    { id: 'round1_e1', seeds: [1, 8] },
    { id: 'round1_e2', seeds: [4, 5] },
    { id: 'round1_e3', seeds: [3, 6] },
    { id: 'round1_e4', seeds: [2, 7] },
  ]
};

// Later round matchup IDs
const ROUND2 = {
  west: [
    { id: 'round2_w1', from: ['round1_w1', 'round1_w2'] },
    { id: 'round2_w2', from: ['round1_w3', 'round1_w4'] },
  ],
  east: [
    { id: 'round2_e1', from: ['round1_e1', 'round1_e2'] },
    { id: 'round2_e2', from: ['round1_e3', 'round1_e4'] },
  ]
};

const CONF_FINALS = {
  west: { id: 'conf_finals_w', from: ['round2_w1', 'round2_w2'] },
  east: { id: 'conf_finals_e', from: ['round2_e1', 'round2_e2'] },
};

const FINALS = { id: 'finals_1', from: ['conf_finals_w', 'conf_finals_e'] };

// App state
let state = {
  authenticated: false,
  isAdmin: false,
  locked: false,
  picks: {},
  entries: {},
  results: {},
  playinSelections: {
    west_7: null, west_8: null,
    east_7: null, east_8: null,
  },
  viewingEntry: null
};

// API helpers
async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// Init
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const me = await api('/api/me');
    if (me.authenticated) {
      state.authenticated = true;
      state.isAdmin = me.isAdmin;
      await enterApp();
    }
  } catch (e) { /* not logged in */ }
  setupEventListeners();
});

function setupEventListeners() {
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('logout-btn').addEventListener('click', handleLogout);
  document.getElementById('save-entry-btn').addEventListener('click', handleSave);
  document.getElementById('load-entry-btn').addEventListener('click', handleLoad);
  document.getElementById('view-entry-select').addEventListener('change', handleViewEntry);

  document.querySelectorAll('.nav-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

async function handleLogin(e) {
  e.preventDefault();
  const pw = document.getElementById('password-input').value;
  const errorEl = document.getElementById('login-error');
  try {
    const data = await api('/api/login', { method: 'POST', body: { password: pw } });
    state.authenticated = true;
    state.isAdmin = data.isAdmin;
    errorEl.classList.add('hidden');
    await enterApp();
  } catch (err) {
    errorEl.textContent = 'Wrong password. Try again.';
    errorEl.classList.remove('hidden');
  }
}

async function handleLogout() {
  await api('/api/logout', { method: 'POST' });
  state.authenticated = false;
  state.isAdmin = false;
  document.getElementById('app-screen').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('password-input').value = '';
}

async function enterApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');

  if (state.isAdmin) {
    document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
  }

  const config = await api('/api/config');
  state.locked = config.locked;
  if (state.locked) {
    document.getElementById('lock-banner').classList.remove('hidden');
  }

  await loadEntries();
  renderBracket();
  renderLeaderboard();
  if (state.isAdmin) renderAdmin();
}

async function loadEntries() {
  state.entries = await api('/api/entries');
  state.results = await api('/api/results');
  populateEntryDropdown();
}

function populateEntryDropdown() {
  const select = document.getElementById('view-entry-select');
  const current = select.value;
  select.innerHTML = '<option value="">-- Select --</option>';
  for (const name of Object.keys(state.entries)) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  }
  if (current && state.entries[current]) select.value = current;
}

function handleViewEntry() {
  const name = document.getElementById('view-entry-select').value;
  if (!name) {
    state.viewingEntry = null;
    state.picks = {};
    state.playinSelections = { west_7: null, west_8: null, east_7: null, east_8: null };
  } else {
    state.viewingEntry = name;
    const entry = state.entries[name];
    state.picks = JSON.parse(JSON.stringify(entry.picks));
    state.playinSelections = entry.picks._playinSelections || { west_7: null, west_8: null, east_7: null, east_8: null };
  }
  renderBracket();
}

function handleLoad() {
  const name = document.getElementById('entry-name').value.trim();
  if (!name) return;
  if (state.entries[name]) {
    state.picks = JSON.parse(JSON.stringify(state.entries[name].picks));
    state.playinSelections = state.picks._playinSelections || { west_7: null, west_8: null, east_7: null, east_8: null };
    state.viewingEntry = null;
    document.getElementById('view-entry-select').value = '';
    renderBracket();
  }
}

async function handleSave() {
  const name = document.getElementById('entry-name').value.trim();
  if (!name) return alert('Enter your name first!');
  if (state.locked) return alert('Picks are locked!');

  const picks = { ...state.picks, _playinSelections: state.playinSelections };
  try {
    await api('/api/entries', { method: 'POST', body: { name, picks } });
    await loadEntries();
    alert('Picks saved!');
  } catch (err) {
    alert(err.message);
  }
}

// Get team for a seed, factoring in play-in selections
function getTeam(conf, seed) {
  if (seed === 7 || seed === 8) {
    const key = `${conf}_${seed}`;
    const selection = state.playinSelections[key];
    if (selection) {
      const team = PLAYIN_TEAMS[conf].find(t => t.abbr === selection);
      if (team) return { ...team, seed };
    }
    return null; // TBD
  }
  const team = TEAMS[conf][seed];
  return team ? { ...team, seed } : null;
}

function getTeamLabel(team, full = false) {
  if (!team) return 'TBD';
  if (full) return `${team.city} ${team.name}`;
  return team.name;
}

function getTeamId(team) {
  return team ? team.abbr : null;
}

// Rendering
function renderBracket() {
  renderFirstRound('west');
  renderFirstRound('east');
  renderLaterRounds('west');
  renderLaterRounds('east');
  renderFinals();
}

function createTeamEl(team, matchupId, isSelected, resultStatus) {
  const div = document.createElement('div');
  div.className = 'matchup-team';
  if (!team) div.classList.add('tbd');
  if (isSelected) div.classList.add('selected');
  if (resultStatus === 'correct') div.classList.add('correct');
  if (resultStatus === 'incorrect') div.classList.add('incorrect');

  const seedSpan = document.createElement('span');
  seedSpan.className = 'seed';
  seedSpan.textContent = team ? team.seed : '?';

  div.appendChild(seedSpan);

  if (team && team.abbr) {
    const logoUrl = getLogoUrl(team.abbr);
    if (logoUrl) {
      const img = document.createElement('img');
      img.className = 'team-logo';
      img.src = logoUrl;
      img.alt = team.name;
      div.appendChild(img);
    }
  }

  const nameSpan = document.createElement('span');
  nameSpan.className = 'team-name';
  nameSpan.textContent = team ? getTeamLabel(team) : 'TBD';

  div.appendChild(nameSpan);

  if (team && !state.locked && !state.viewingEntry) {
    div.addEventListener('click', () => {
      selectWinner(matchupId, getTeamId(team));
    });
  }

  return div;
}

function createGamesSelector(matchupId) {
  const pick = state.picks[matchupId];
  if (!pick || !pick.winner) return null;

  const div = document.createElement('div');
  div.className = 'games-selector';

  const label = document.createElement('span');
  label.textContent = 'Games:';

  const select = document.createElement('select');
  select.innerHTML = '<option value="">--</option>';
  for (let g = 4; g <= 7; g++) {
    const opt = document.createElement('option');
    opt.value = g;
    opt.textContent = g;
    if (pick.games === g) opt.selected = true;
    select.appendChild(opt);
  }

  if (!state.locked && !state.viewingEntry) {
    select.addEventListener('change', () => {
      state.picks[matchupId].games = select.value ? parseInt(select.value) : null;
    });
  } else {
    select.disabled = true;
  }

  div.appendChild(label);
  div.appendChild(select);
  return div;
}

function createPlayinSelector(conf, seed) {
  const div = document.createElement('div');
  div.className = 'playin-selector';

  const select = document.createElement('select');
  const key = `${conf}_${seed}`;
  select.innerHTML = `<option value="">Pick ${seed}-seed...</option>`;
  PLAYIN_TEAMS[conf].forEach(team => {
    const opt = document.createElement('option');
    opt.value = team.abbr;
    opt.textContent = team.name;
    if (state.playinSelections[key] === team.abbr) opt.selected = true;
    select.appendChild(opt);
  });

  if (!state.locked && !state.viewingEntry) {
    select.addEventListener('change', () => {
      state.playinSelections[key] = select.value || null;
      renderBracket();
    });
  } else {
    select.disabled = true;
  }

  div.appendChild(select);
  return div;
}

function getResultStatus(matchupId, teamAbbr) {
  const result = state.results[matchupId];
  if (!result || !result.winner) return null;
  const pick = state.picks[matchupId];
  if (!pick || !pick.winner) return null;
  if (pick.winner === teamAbbr) {
    return result.winner === teamAbbr ? 'correct' : 'incorrect';
  }
  return null;
}

function renderFirstRound(conf) {
  const container = document.getElementById(`${conf}-round1`);
  container.innerHTML = '';

  FIRST_ROUND[conf].forEach(matchup => {
    const [highSeed, lowSeed] = matchup.seeds;
    const team1 = getTeam(conf, highSeed);
    const team2 = getTeam(conf, lowSeed);
    const pick = state.picks[matchup.id];

    const matchupEl = document.createElement('div');
    matchupEl.className = 'matchup';
    matchupEl.dataset.matchupId = matchup.id;

    const t1Status = getResultStatus(matchup.id, getTeamId(team1));
    const t2Status = getResultStatus(matchup.id, getTeamId(team2));

    matchupEl.appendChild(createTeamEl(team1, matchup.id,
      pick && pick.winner === getTeamId(team1), t1Status));

    // Play-in selector for 7/8 seeds
    if (lowSeed === 8 && !team2) {
      matchupEl.appendChild(createPlayinSelector(conf, 8));
    } else {
      matchupEl.appendChild(createTeamEl(team2, matchup.id,
        pick && pick.winner === getTeamId(team2), t2Status));
    }

    if (lowSeed === 7 && !team2) {
      // Insert play-in selector before the TBD team
      const existingTeams = matchupEl.querySelectorAll('.matchup-team');
      if (existingTeams.length > 1) {
        matchupEl.removeChild(existingTeams[1]);
      }
      matchupEl.appendChild(createPlayinSelector(conf, 7));
    }

    const gamesEl = createGamesSelector(matchup.id);
    if (gamesEl) matchupEl.appendChild(gamesEl);

    container.appendChild(matchupEl);
  });
}

function getWinnerTeam(matchupId) {
  const pick = state.picks[matchupId];
  if (!pick || !pick.winner) return null;

  // Search all teams + playin teams for the abbreviation
  const abbr = pick.winner;
  for (const conf of ['west', 'east']) {
    for (const [seed, team] of Object.entries(TEAMS[conf])) {
      if (team.abbr === abbr) return { ...team, seed: parseInt(seed) };
    }
    for (const team of PLAYIN_TEAMS[conf]) {
      if (team.abbr === abbr) return { ...team, seed: '?' };
    }
  }
  return null;
}

function renderLaterRounds(conf) {
  // Round 2
  const r2Container = document.getElementById(`${conf}-round2`);
  r2Container.innerHTML = '';
  ROUND2[conf].forEach(matchup => {
    const team1 = getWinnerTeam(matchup.from[0]);
    const team2 = getWinnerTeam(matchup.from[1]);
    const pick = state.picks[matchup.id];

    const matchupEl = document.createElement('div');
    matchupEl.className = 'matchup';

    const t1Status = getResultStatus(matchup.id, getTeamId(team1));
    const t2Status = getResultStatus(matchup.id, getTeamId(team2));

    matchupEl.appendChild(createTeamEl(team1, matchup.id,
      pick && pick.winner === getTeamId(team1), t1Status));
    matchupEl.appendChild(createTeamEl(team2, matchup.id,
      pick && pick.winner === getTeamId(team2), t2Status));

    const gamesEl = createGamesSelector(matchup.id);
    if (gamesEl) matchupEl.appendChild(gamesEl);

    r2Container.appendChild(matchupEl);
  });

  // Conf finals
  const cfContainer = document.getElementById(`${conf}-conf-finals`);
  cfContainer.innerHTML = '';
  const cf = CONF_FINALS[conf];
  const team1 = getWinnerTeam(cf.from[0]);
  const team2 = getWinnerTeam(cf.from[1]);
  const pick = state.picks[cf.id];

  const matchupEl = document.createElement('div');
  matchupEl.className = 'matchup';

  const t1Status = getResultStatus(cf.id, getTeamId(team1));
  const t2Status = getResultStatus(cf.id, getTeamId(team2));

  matchupEl.appendChild(createTeamEl(team1, cf.id,
    pick && pick.winner === getTeamId(team1), t1Status));
  matchupEl.appendChild(createTeamEl(team2, cf.id,
    pick && pick.winner === getTeamId(team2), t2Status));

  const gamesEl = createGamesSelector(cf.id);
  if (gamesEl) matchupEl.appendChild(gamesEl);

  cfContainer.appendChild(matchupEl);
}

function renderFinals() {
  const container = document.getElementById('finals');
  container.innerHTML = '';

  const team1 = getWinnerTeam(FINALS.from[0]);
  const team2 = getWinnerTeam(FINALS.from[1]);
  const pick = state.picks[FINALS.id];

  const matchupEl = document.createElement('div');
  matchupEl.className = 'matchup';

  const t1Status = getResultStatus(FINALS.id, getTeamId(team1));
  const t2Status = getResultStatus(FINALS.id, getTeamId(team2));

  matchupEl.appendChild(createTeamEl(team1, FINALS.id,
    pick && pick.winner === getTeamId(team1), t1Status));
  matchupEl.appendChild(createTeamEl(team2, FINALS.id,
    pick && pick.winner === getTeamId(team2), t2Status));

  const gamesEl = createGamesSelector(FINALS.id);
  if (gamesEl) matchupEl.appendChild(gamesEl);

  container.appendChild(matchupEl);

  // Champion display
  const champContainer = document.getElementById('champion');
  champContainer.innerHTML = '';
  const champion = getWinnerTeam(FINALS.id);
  if (champion) {
    const div = document.createElement('div');
    div.className = 'champion-name';
    const logoUrl = getLogoUrl(champion.abbr);
    if (logoUrl) {
      const img = document.createElement('img');
      img.className = 'champion-logo';
      img.src = logoUrl;
      img.alt = champion.name;
      div.appendChild(img);
    }
    const span = document.createElement('span');
    span.textContent = getTeamLabel(champion, true);
    div.appendChild(span);
    champContainer.appendChild(div);
  } else {
    const div = document.createElement('div');
    div.className = 'champion-placeholder';
    div.textContent = 'Pick your champion';
    champContainer.appendChild(div);
  }
}

function selectWinner(matchupId, teamAbbr) {
  if (state.locked || state.viewingEntry) return;

  state.picks[matchupId] = { winner: teamAbbr, games: state.picks[matchupId]?.games || null };

  // Clear downstream picks if they depended on a different winner
  clearDownstream(matchupId);
  renderBracket();
}

function clearDownstream(changedMatchupId) {
  // Find any later round matchups that feed from this one
  const allLater = [
    ...ROUND2.west, ...ROUND2.east,
    CONF_FINALS.west, CONF_FINALS.east,
    FINALS
  ];

  for (const matchup of allLater) {
    if (matchup.from && matchup.from.includes(changedMatchupId)) {
      const pick = state.picks[matchup.id];
      if (pick) {
        // Check if the picked winner is still valid
        const validTeams = matchup.from.map(fromId => {
          const p = state.picks[fromId];
          return p ? p.winner : null;
        });
        if (!validTeams.includes(pick.winner)) {
          delete state.picks[matchup.id];
          clearDownstream(matchup.id);
        }
      }
    }
  }
}

// Leaderboard
async function renderLeaderboard() {
  try {
    const leaderboard = await api('/api/leaderboard');
    const tbody = document.getElementById('leaderboard-body');
    const noResults = document.getElementById('no-results-msg');

    tbody.innerHTML = '';

    if (leaderboard.length === 0 || leaderboard.every(e => e.total === 0)) {
      noResults.classList.remove('hidden');
      // Still show entries with 0 score
      leaderboard.forEach((entry, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${i + 1}</td>
          <td>${escapeHtml(entry.name)}</td>
          <td>0</td>
          <td>--</td>
        `;
        tbody.appendChild(tr);
      });
      return;
    }

    noResults.classList.add('hidden');
    leaderboard.forEach((entry, i) => {
      const rank = i + 1;
      const tr = document.createElement('tr');
      const rankClass = rank <= 3 ? `rank-${rank}` : '';
      tr.innerHTML = `
        <td class="${rankClass}">${rank === 1 ? '\u{1F947}' : rank === 2 ? '\u{1F948}' : rank === 3 ? '\u{1F949}' : rank}</td>
        <td class="${rankClass}">${escapeHtml(entry.name)}</td>
        <td class="${rankClass}">${entry.score}</td>
        <td>${entry.correct}/${entry.total}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (e) {
    console.error('Failed to load leaderboard:', e);
  }
}

// Admin
function renderAdmin() {
  const container = document.getElementById('admin-results');
  container.innerHTML = '';

  const rounds = [
    { label: 'First Round - West', matchups: FIRST_ROUND.west, conf: 'west', round: 'round1' },
    { label: 'First Round - East', matchups: FIRST_ROUND.east, conf: 'east', round: 'round1' },
    { label: 'Conference Semis - West', matchups: ROUND2.west, conf: 'west', round: 'round2' },
    { label: 'Conference Semis - East', matchups: ROUND2.east, conf: 'east', round: 'round2' },
    { label: 'Conference Finals', matchups: [CONF_FINALS.west, CONF_FINALS.east], conf: null, round: 'conf_finals' },
    { label: 'NBA Finals', matchups: [FINALS], conf: null, round: 'finals' },
  ];

  rounds.forEach(roundDef => {
    const roundDiv = document.createElement('div');
    roundDiv.className = 'admin-round';
    roundDiv.innerHTML = `<h3>${roundDef.label}</h3>`;

    roundDef.matchups.forEach(matchup => {
      const div = document.createElement('div');
      div.className = 'admin-matchup';

      // Get teams for this matchup
      let teams = [];
      if (roundDef.round === 'round1') {
        const [s1, s2] = matchup.seeds;
        const conf = roundDef.conf;
        const t1 = getTeam(conf, s1);
        const t2 = getTeam(conf, s2);
        teams = [t1, t2].filter(Boolean);
      } else {
        teams = matchup.from.map(fromId => getWinnerFromResults(fromId)).filter(Boolean);
      }

      const labelSpan = document.createElement('span');
      labelSpan.className = 'matchup-label';
      labelSpan.textContent = teams.length === 2
        ? `${getTeamLabel(teams[0], true)} vs ${getTeamLabel(teams[1], true)}`
        : matchup.id;

      const winnerSelect = document.createElement('select');
      winnerSelect.dataset.matchupId = matchup.id;
      winnerSelect.dataset.field = 'winner';
      winnerSelect.innerHTML = '<option value="">Winner...</option>';
      teams.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.abbr;
        opt.textContent = getTeamLabel(t, true);
        if (state.results[matchup.id]?.winner === t.abbr) opt.selected = true;
        winnerSelect.appendChild(opt);
      });

      const gamesLabel = document.createElement('label');
      gamesLabel.textContent = 'Games:';

      const gamesSelect = document.createElement('select');
      gamesSelect.dataset.matchupId = matchup.id;
      gamesSelect.dataset.field = 'games';
      gamesSelect.innerHTML = '<option value="">--</option>';
      for (let g = 4; g <= 7; g++) {
        const opt = document.createElement('option');
        opt.value = g;
        opt.textContent = g;
        if (state.results[matchup.id]?.games === g) opt.selected = true;
        gamesSelect.appendChild(opt);
      }

      div.appendChild(labelSpan);
      div.appendChild(winnerSelect);
      div.appendChild(gamesLabel);
      div.appendChild(gamesSelect);
      roundDiv.appendChild(div);
    });

    container.appendChild(roundDiv);
  });

  document.getElementById('save-results-btn').addEventListener('click', handleSaveResults);
}

function getWinnerFromResults(matchupId) {
  const result = state.results[matchupId];
  if (!result || !result.winner) return null;
  const abbr = result.winner;
  for (const conf of ['west', 'east']) {
    for (const [seed, team] of Object.entries(TEAMS[conf])) {
      if (team.abbr === abbr) return { ...team, seed: parseInt(seed) };
    }
    for (const team of PLAYIN_TEAMS[conf]) {
      if (team.abbr === abbr) return { ...team, seed: '?' };
    }
  }
  return null;
}

async function handleSaveResults() {
  const results = {};
  document.querySelectorAll('.admin-matchup select').forEach(select => {
    const id = select.dataset.matchupId;
    const field = select.dataset.field;
    if (!results[id]) results[id] = {};
    if (field === 'games') {
      results[id][field] = select.value ? parseInt(select.value) : null;
    } else {
      results[id][field] = select.value || null;
    }
  });

  try {
    await api('/api/results', { method: 'POST', body: { results } });
    state.results = results;
    renderBracket();
    renderLeaderboard();
    renderAdmin();
    alert('Results saved!');
  } catch (err) {
    alert(err.message);
  }
}

function switchTab(tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn[data-tab]').forEach(el => el.classList.remove('active'));
  document.getElementById(`${tab}-tab`).classList.add('active');
  document.querySelector(`.nav-btn[data-tab="${tab}"]`).classList.add('active');

  if (tab === 'leaderboard') renderLeaderboard();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
