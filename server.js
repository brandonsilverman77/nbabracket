const express = require('express');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Config
const PASSWORD = process.env.BRACKET_PASSWORD || 'playoffs2026';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin2026';
const LOCK_DATE = process.env.LOCK_DATE || '2026-04-18T12:00:00-04:00'; // Noon ET on first game day

// Data file paths
const DATA_DIR = path.join(__dirname, 'data');
const ENTRIES_FILE = path.join(DATA_DIR, 'entries.json');
const RESULTS_FILE = path.join(DATA_DIR, 'results.json');

// Ensure data directory and files exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(ENTRIES_FILE)) fs.writeFileSync(ENTRIES_FILE, '{}');
if (!fs.existsSync(RESULTS_FILE)) fs.writeFileSync(RESULTS_FILE, '{}');

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Stateless signed tokens (survive server restarts)
const SIGN_KEY = crypto.createHash('sha256').update(PASSWORD + ':' + ADMIN_PASSWORD).digest();

function createToken(isAdmin = false) {
  const payload = JSON.stringify({ isAdmin, t: Date.now() });
  const sig = crypto.createHmac('sha256', SIGN_KEY).update(payload).digest('hex');
  return Buffer.from(payload).toString('base64') + '.' + sig;
}

function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [b64, sig] = token.split('.');
  try {
    const payload = Buffer.from(b64, 'base64').toString();
    const expected = crypto.createHmac('sha256', SIGN_KEY).update(payload).digest('hex');
    if (sig !== expected) return null;
    return JSON.parse(payload);
  } catch { return null; }
}

function requireAuth(req, res, next) {
  const session = verifyToken(req.cookies.session);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });
  req.session = session;
  next();
}

function requireAdmin(req, res, next) {
  const session = verifyToken(req.cookies.session);
  if (!session || !session.isAdmin) return res.status(403).json({ error: 'Admin access required' });
  req.session = session;
  next();
}

function readJSON(filepath) {
  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

function writeJSON(filepath, data) {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}

function isLocked() {
  return new Date() >= new Date(LOCK_DATE);
}

// Auth routes
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === PASSWORD || password === ADMIN_PASSWORD) {
    const isAdmin = password === ADMIN_PASSWORD;
    const token = createToken(isAdmin);
    res.cookie('session', token, { httpOnly: true, sameSite: 'strict', maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.json({ success: true, isAdmin });
  } else {
    res.status(401).json({ error: 'Wrong password' });
  }
});

app.get('/api/me', (req, res) => {
  const session = verifyToken(req.cookies.session);
  if (!session) return res.json({ authenticated: false });
  res.json({ authenticated: true, isAdmin: session.isAdmin });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('session');
  res.json({ success: true });
});

// Bracket config
app.get('/api/config', requireAuth, (req, res) => {
  res.json({
    locked: isLocked(),
    lockDate: LOCK_DATE,
    isAdmin: req.session.isAdmin
  });
});

// Entries CRUD
app.get('/api/entries', requireAuth, (req, res) => {
  const entries = readJSON(ENTRIES_FILE);
  res.json(entries);
});

app.post('/api/entries', requireAuth, (req, res) => {
  if (isLocked()) {
    return res.status(403).json({ error: 'Bracket is locked — picks can no longer be changed' });
  }
  const { name, picks } = req.body;
  if (!name || !picks) {
    return res.status(400).json({ error: 'Name and picks required' });
  }
  const sanitizedName = name.trim().substring(0, 30);
  const entries = readJSON(ENTRIES_FILE);
  entries[sanitizedName] = { picks, updatedAt: new Date().toISOString() };
  writeJSON(ENTRIES_FILE, entries);
  res.json({ success: true });
});

app.delete('/api/entries/:name', requireAdmin, (req, res) => {
  const entries = readJSON(ENTRIES_FILE);
  delete entries[req.params.name];
  writeJSON(ENTRIES_FILE, entries);
  res.json({ success: true });
});

// Results (admin only for writing)
app.get('/api/results', requireAuth, (req, res) => {
  const results = readJSON(RESULTS_FILE);
  res.json(results);
});

app.post('/api/results', requireAdmin, (req, res) => {
  const { results } = req.body;
  writeJSON(RESULTS_FILE, results);
  res.json({ success: true });
});

// Random bracket generator
function generateRandomBracket() {
  const teams = {
    west: {
      1: 'OKC', 2: 'SAS', 3: 'DEN', 4: 'LAL', 5: 'HOU', 6: 'MIN',
    },
    east: {
      1: 'DET', 2: 'BOS', 3: 'NYK', 4: 'CLE', 5: 'TOR', 6: 'ATL',
    }
  };
  const playinTeams = {
    west: { 7: ['PHX', 'POR', 'LAC', 'GSW'], 8: ['PHX', 'POR', 'LAC', 'GSW'] },
    east: { 7: ['PHI', 'ORL', 'CHA', 'MIA'], 8: ['PHI', 'ORL', 'CHA', 'MIA'] },
  };

  const pick = (a, b) => Math.random() < 0.5 ? a : b;
  const randGames = () => 4 + Math.floor(Math.random() * 4); // 4-7

  // Pick play-in teams (ensure 7 and 8 are different)
  const playinSelections = {};
  for (const conf of ['west', 'east']) {
    const pool = [...playinTeams[conf][7]];
    const seed7 = pool[Math.floor(Math.random() * pool.length)];
    const remaining = pool.filter(t => t !== seed7);
    const seed8 = remaining[Math.floor(Math.random() * remaining.length)];
    playinSelections[`${conf}_7`] = seed7;
    playinSelections[`${conf}_8`] = seed8;
    teams[conf][7] = seed7;
    teams[conf][8] = seed8;
  }

  const picks = { _playinSelections: playinSelections };

  // Round 1
  const r1Winners = {};
  const r1Matchups = {
    west: [['round1_w1', 1, 8], ['round1_w2', 4, 5], ['round1_w3', 3, 6], ['round1_w4', 2, 7]],
    east: [['round1_e1', 1, 8], ['round1_e2', 4, 5], ['round1_e3', 3, 6], ['round1_e4', 2, 7]],
  };
  for (const conf of ['west', 'east']) {
    for (const [id, s1, s2] of r1Matchups[conf]) {
      const winner = pick(teams[conf][s1], teams[conf][s2]);
      picks[id] = { winner, games: randGames() };
      r1Winners[id] = winner;
    }
  }

  // Round 2
  const r2Winners = {};
  const r2Matchups = [
    ['round2_w1', 'round1_w1', 'round1_w2'],
    ['round2_w2', 'round1_w3', 'round1_w4'],
    ['round2_e1', 'round1_e1', 'round1_e2'],
    ['round2_e2', 'round1_e3', 'round1_e4'],
  ];
  for (const [id, from1, from2] of r2Matchups) {
    const winner = pick(r1Winners[from1], r1Winners[from2]);
    picks[id] = { winner, games: randGames() };
    r2Winners[id] = winner;
  }

  // Conf finals
  const cfWinners = {};
  const cfMatchups = [
    ['conf_finals_w', 'round2_w1', 'round2_w2'],
    ['conf_finals_e', 'round2_e1', 'round2_e2'],
  ];
  for (const [id, from1, from2] of cfMatchups) {
    const winner = pick(r2Winners[from1], r2Winners[from2]);
    picks[id] = { winner, games: randGames() };
    cfWinners[id] = winner;
  }

  // Finals
  const finalsWinner = pick(cfWinners['conf_finals_w'], cfWinners['conf_finals_e']);
  picks['finals_1'] = { winner: finalsWinner, games: randGames() };

  return picks;
}

app.post('/api/generate-random', requireAdmin, (req, res) => {
  const picks = generateRandomBracket();
  const entries = readJSON(ENTRIES_FILE);
  entries['Random Bot'] = { picks, updatedAt: new Date().toISOString() };
  writeJSON(ENTRIES_FILE, entries);
  res.json({ success: true, picks });
});

// Scoring
const ROUND_POINTS = {
  'round1': 2,
  'round2': 4,
  'conf_finals': 8,
  'finals': 16,
  'champion': 32
};

app.get('/api/leaderboard', requireAuth, (req, res) => {
  const entries = readJSON(ENTRIES_FILE);
  const results = readJSON(RESULTS_FILE);

  const leaderboard = Object.entries(entries).map(([name, entry]) => {
    let score = 0;
    let correct = 0;
    let total = 0;

    for (const [matchupId, result] of Object.entries(results)) {
      if (!result.winner) continue;
      const pick = entry.picks[matchupId];
      if (!pick) continue;

      const round = matchupId.split('_')[0];
      const points = ROUND_POINTS[round] || 0;
      total++;

      if (pick.winner === result.winner) {
        score += points;
        correct++;
        if (pick.games && result.games && pick.games === result.games) {
          score += 2;
        }
      }
    }

    return { name, score, correct, total, updatedAt: entry.updatedAt };
  });

  leaderboard.sort((a, b) => b.score - a.score);
  res.json(leaderboard);
});

app.listen(PORT, () => {
  console.log(`NBA Bracket app running at http://localhost:${PORT}`);
  console.log(`Password: ${PASSWORD}`);
  console.log(`Admin password: ${ADMIN_PASSWORD}`);
  console.log(`Entries lock at: ${LOCK_DATE}`);
});
