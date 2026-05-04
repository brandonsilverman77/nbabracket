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
  v2Unlocked: false,
  activeBracket: 'v1',  // 'v1' or 'v2'
  picks: {},
  picksV2: {},
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

  document.querySelectorAll('.subtab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.subtab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.subtab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`${btn.dataset.subtab}-subtab`).classList.add('active');
      if (btn.dataset.subtab === 'all-time') renderAllTimeLeaderboard();
    });
  });

  document.querySelectorAll('.version-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.version-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeBracket = btn.dataset.version;
      const v2Banner = document.getElementById('v2-banner');
      const lockBanner = document.getElementById('lock-banner');
      if (state.activeBracket === 'v2') {
        v2Banner.classList.remove('hidden');
        lockBanner.classList.add('hidden');
      } else {
        v2Banner.classList.add('hidden');
        if (state.locked) lockBanner.classList.remove('hidden');
      }
      renderBracket();
    });
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
  state.v2Unlocked = !!config.v2Unlocked;
  if (state.locked) {
    document.getElementById('lock-banner').classList.remove('hidden');
  }
  updateBracketVersionToggle();

  await loadEntries();
  renderBracket();
  renderLeaderboard();
  if (state.isAdmin) renderAdmin();
}

function updateBracketVersionToggle() {
  const toggle = document.getElementById('bracket-version-toggle');
  if (state.v2Unlocked) {
    toggle.classList.remove('hidden');
  } else {
    toggle.classList.add('hidden');
    // Force back to v1 if v2 was disabled
    state.activeBracket = 'v1';
  }
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

// Returns the picks object for the currently active bracket (v1 or v2)
function activePicks() {
  return state.activeBracket === 'v2' ? state.picksV2 : state.picks;
}

function setActivePicks(newPicks) {
  if (state.activeBracket === 'v2') state.picksV2 = newPicks;
  else state.picks = newPicks;
}

// Whether the user can click/edit picks right now (in the active bracket)
function isEditable() {
  if (state.viewingEntry) return false;
  if (state.activeBracket === 'v2') return state.v2Unlocked;
  return !state.locked;
}

function handleViewEntry() {
  const name = document.getElementById('view-entry-select').value;
  if (!name) {
    state.viewingEntry = null;
    state.picks = {};
    state.picksV2 = {};
    state.playinSelections = { west_7: null, west_8: null, east_7: null, east_8: null };
  } else {
    state.viewingEntry = name;
    const entry = state.entries[name];
    state.picks = JSON.parse(JSON.stringify(entry.picks || {}));
    state.picksV2 = JSON.parse(JSON.stringify(entry.picks_v2 || {}));
    state.playinSelections = entry.picks?._playinSelections || { west_7: null, west_8: null, east_7: null, east_8: null };
  }
  renderBracket();
}

function handleLoad() {
  const name = document.getElementById('entry-name').value.trim();
  if (!name) return;
  if (state.entries[name]) {
    const entry = state.entries[name];
    state.picks = JSON.parse(JSON.stringify(entry.picks || {}));
    state.picksV2 = JSON.parse(JSON.stringify(entry.picks_v2 || {}));
    state.playinSelections = state.picks._playinSelections || { west_7: null, west_8: null, east_7: null, east_8: null };
    state.viewingEntry = null;
    document.getElementById('view-entry-select').value = '';
    renderBracket();
  }
}

async function handleSave() {
  const name = document.getElementById('entry-name').value.trim();
  if (!name) return alert('Enter your name first!');

  if (state.activeBracket === 'v2') {
    if (!state.v2Unlocked) return alert('Bracket 2 is not unlocked yet.');
    try {
      await api('/api/entries/v2', { method: 'POST', body: { name, picks: state.picksV2 } });
      await loadEntries();
      alert('Bracket 2 picks saved!');
    } catch (err) {
      alert(err.message);
    }
    return;
  }

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

// Get team for a seed, factoring in play-in selections (V1: user's picks)
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

// Get team for a seed using ACTUAL play-in results (V2 + admin)
function getActualTeam(conf, seed) {
  if (seed === 7 || seed === 8) {
    const key = `playin_${conf}_${seed}`;
    const result = state.results?.[key];
    if (result?.winner) {
      const team = PLAYIN_TEAMS[conf].find(t => t.abbr === result.winner);
      if (team) return { ...team, seed };
    }
    // Fallback: use the user's V1 play-in selection so something displays
    return getTeam(conf, seed);
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

  // In V2 mode, Round 1 is read-only (results are locked in)
  const isV2Round1 = state.activeBracket === 'v2' && matchupId.startsWith('round1_');
  if (team && isEditable() && !isV2Round1) {
    div.addEventListener('click', () => {
      selectWinner(matchupId, getTeamId(team));
    });
  }

  return div;
}

function createGamesSelector(matchupId) {
  const pick = activePicks()[matchupId];
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

  // In V2, Round 1 games are not editable (results locked)
  const isV2Round1 = state.activeBracket === 'v2' && matchupId.startsWith('round1_');
  if (isEditable() && !isV2Round1) {
    select.addEventListener('change', () => {
      activePicks()[matchupId].games = select.value ? parseInt(select.value) : null;
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

  // Play-in selector only relevant in V1
  if (state.activeBracket === 'v1' && isEditable()) {
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
  const pick = activePicks()[matchupId];
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
    const teamFn = state.activeBracket === 'v2' ? getActualTeam : getTeam;
    const team1 = teamFn(conf, highSeed);
    const team2 = teamFn(conf, lowSeed);
    // In V2 Round 1, "winner" is the actual result, not the user's pick
    const pick = (state.activeBracket === 'v2')
      ? state.results[matchup.id]
      : activePicks()[matchup.id];

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
  // In V2 mode, Round 1 winners come from actual results (locked in)
  let abbr;
  if (state.activeBracket === 'v2' && matchupId.startsWith('round1_')) {
    const result = state.results[matchupId];
    if (!result || !result.winner) return null;
    abbr = result.winner;
  } else {
    const pick = activePicks()[matchupId];
    if (!pick || !pick.winner) return null;
    abbr = pick.winner;
  }

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
    const pick = activePicks()[matchup.id];

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
  const pick = activePicks()[cf.id];

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
  const pick = activePicks()[FINALS.id];

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
  if (!isEditable()) return;
  // V2 Round 1 is read-only (locked to actual results)
  if (state.activeBracket === 'v2' && matchupId.startsWith('round1_')) return;

  if (teamAbbr === 'MIN') {
    showGeorgeModal(() => {
      applyWinner(matchupId, teamAbbr);
    });
    return;
  }

  applyWinner(matchupId, teamAbbr);
}

function applyWinner(matchupId, teamAbbr) {
  activePicks()[matchupId] = { winner: teamAbbr, games: activePicks()[matchupId]?.games || null };

  // Clear downstream picks if they depended on a different winner
  clearDownstream(matchupId);
  renderBracket();
}

function showGeorgeModal(onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal-box';
  modal.innerHTML = `
    <div class="modal-emoji">&#128556;</div>
    <h2>George...are you sure you want to do this?</h2>
    <div class="modal-buttons">
      <button class="modal-btn confirm-btn">Yes, I'm sure</button>
      <button class="modal-btn cancel-btn">You're right, this is probably a bad idea</button>
    </div>
  `;

  modal.querySelector('.confirm-btn').addEventListener('click', () => {
    overlay.remove();
    onConfirm();
  });

  modal.querySelector('.cancel-btn').addEventListener('click', () => {
    overlay.remove();
  });

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
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
      const pick = activePicks()[matchup.id];
      if (pick) {
        // Check if the picked winner is still valid
        const validTeams = matchup.from.map(fromId => {
          const p = activePicks()[fromId];
          return p ? p.winner : null;
        });
        if (!validTeams.includes(pick.winner)) {
          delete activePicks()[matchup.id];
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
          <td>0</td>
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
        <td class="${rankClass}">${entry.score_v1 ?? 0}</td>
        <td class="${rankClass}">${entry.score_v2 ?? 0}</td>
        <td class="${rankClass}"><strong>${entry.score}</strong></td>
        <td>${entry.correct}/${entry.total}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (e) {
    console.error('Failed to load leaderboard:', e);
  }
}

async function renderAllTimeLeaderboard() {
  try {
    const leaderboard = await api('/api/leaderboard/all-time');
    const tbody = document.getElementById('alltime-body');
    tbody.innerHTML = '';

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
    console.error('Failed to load all-time leaderboard:', e);
  }
}

// Admin
function renderAdmin() {
  // Wire up random bot button
  const randomBtn = document.getElementById('generate-random-btn');
  if (randomBtn && !randomBtn.dataset.wired) {
    randomBtn.dataset.wired = 'true';
    randomBtn.addEventListener('click', async () => {
      try {
        await api('/api/generate-random', { method: 'POST' });
        document.getElementById('random-status').textContent = ' Random Bot bracket saved!';
        await loadEntries();
        renderBracket();
      } catch (err) {
        document.getElementById('random-status').textContent = ' Error: ' + err.message;
      }
    });
  }

  // Wire up V2 toggle button
  const v2Btn = document.getElementById('toggle-v2-btn');
  if (v2Btn) {
    v2Btn.textContent = state.v2Unlocked ? 'Lock Bracket 2' : 'Unlock Bracket 2';
    if (!v2Btn.dataset.wired) {
      v2Btn.dataset.wired = 'true';
      v2Btn.addEventListener('click', async () => {
        try {
          const result = await api('/api/admin/toggle-v2', { method: 'POST' });
          state.v2Unlocked = result.v2Unlocked;
          v2Btn.textContent = state.v2Unlocked ? 'Lock Bracket 2' : 'Unlock Bracket 2';
          document.getElementById('v2-status').textContent =
            state.v2Unlocked ? ' Bracket 2 is now unlocked!' : ' Bracket 2 is locked.';
          updateBracketVersionToggle();
        } catch (err) {
          document.getElementById('v2-status').textContent = ' Error: ' + err.message;
        }
      });
    }
  }

  const container = document.getElementById('admin-results');
  container.innerHTML = '';

  // Play-in winners section (actual 7/8 seeds)
  const playinDiv = document.createElement('div');
  playinDiv.className = 'admin-round';
  playinDiv.innerHTML = '<h3>Actual Play-In Winners</h3>';
  ['west', 'east'].forEach(conf => {
    [7, 8].forEach(seed => {
      const id = `playin_${conf}_${seed}`;
      const div = document.createElement('div');
      div.className = 'admin-matchup';
      const labelSpan = document.createElement('span');
      labelSpan.className = 'matchup-label';
      labelSpan.textContent = `${conf.toUpperCase()} ${seed}-seed`;
      const select = document.createElement('select');
      select.dataset.matchupId = id;
      select.dataset.field = 'winner';
      select.innerHTML = '<option value="">-- Select --</option>';
      PLAYIN_TEAMS[conf].forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.abbr;
        opt.textContent = `${t.city} ${t.name}`;
        if (state.results[id]?.winner === t.abbr) opt.selected = true;
        select.appendChild(opt);
      });
      div.appendChild(labelSpan);
      div.appendChild(select);
      playinDiv.appendChild(div);
    });
  });
  container.appendChild(playinDiv);

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
        const t1 = getActualTeam(conf, s1);
        const t2 = getActualTeam(conf, s2);
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
