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
const SESSION_SECRET = crypto.randomBytes(32).toString('hex');

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

// Simple session tokens
const sessions = new Map();

function createSession(isAdmin = false) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { isAdmin, created: Date.now() });
  return token;
}

function requireAuth(req, res, next) {
  const token = req.cookies.session;
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  req.session = sessions.get(token);
  next();
}

function requireAdmin(req, res, next) {
  const token = req.cookies.session;
  if (!token || !sessions.has(token) || !sessions.get(token).isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  req.session = sessions.get(token);
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
    const token = createSession(isAdmin);
    res.cookie('session', token, { httpOnly: true, sameSite: 'strict', maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.json({ success: true, isAdmin });
  } else {
    res.status(401).json({ error: 'Wrong password' });
  }
});

app.get('/api/me', (req, res) => {
  const token = req.cookies.session;
  if (!token || !sessions.has(token)) {
    return res.json({ authenticated: false });
  }
  const session = sessions.get(token);
  res.json({ authenticated: true, isAdmin: session.isAdmin });
});

app.post('/api/logout', (req, res) => {
  const token = req.cookies.session;
  if (token) sessions.delete(token);
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
