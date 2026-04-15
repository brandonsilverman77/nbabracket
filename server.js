const express = require('express');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Config
const PASSWORD = process.env.BRACKET_PASSWORD || 'playoffs2026';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin2026';
const LOCK_DATE = process.env.LOCK_DATE || '2026-04-18T12:00:00-04:00'; // Noon ET on first game day

// PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://nba_bracket_db_user:rE6Sf3aRg5SbxTRZeaYMo0atWqpK9YzM@dpg-d7fa2clckfvc73fbrd0g-a/nba_bracket_db',
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS entries (
      name TEXT PRIMARY KEY,
      picks JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS results (
      id TEXT PRIMARY KEY DEFAULT 'current',
      data JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `);
  // Ensure results row exists
  await pool.query(`
    INSERT INTO results (id, data) VALUES ('current', '{}'::jsonb)
    ON CONFLICT (id) DO NOTHING
  `);

  // Historical scores table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS historical_scores (
      name TEXT NOT NULL,
      year INTEGER NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      correct INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (name, year)
    )
  `);

  // Seed 2025 scores (computed from original picks vs actual results)
  const seeds2025 = [
    ['Brandon', 2025, 16, 7, 15],
    ['George', 2025, 28, 9, 15],
    ['Matt', 2025, 26, 9, 15],
    ['Will', 2025, 24, 7, 15],
  ];
  for (const [name, year, score, correct, total] of seeds2025) {
    await pool.query(
      `INSERT INTO historical_scores (name, year, score, correct, total) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (name, year) DO NOTHING`,
      [name, year, score, correct, total]
    );
  }

  console.log('Database initialized');
}

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
app.get('/api/entries', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT name, picks, updated_at FROM entries ORDER BY name');
    const entries = {};
    for (const row of rows) {
      entries[row.name] = { picks: row.picks, updatedAt: row.updated_at };
    }
    res.json(entries);
  } catch (err) {
    console.error('Error reading entries:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/entries', requireAuth, async (req, res) => {
  if (isLocked()) {
    return res.status(403).json({ error: 'Bracket is locked — picks can no longer be changed' });
  }
  const { name, picks } = req.body;
  if (!name || !picks) {
    return res.status(400).json({ error: 'Name and picks required' });
  }
  const sanitizedName = name.trim().substring(0, 30);
  try {
    await pool.query(
      `INSERT INTO entries (name, picks, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (name) DO UPDATE SET picks = $2, updated_at = NOW()`,
      [sanitizedName, JSON.stringify(picks)]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error saving entry:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/entries/:name', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM entries WHERE name = $1', [req.params.name]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting entry:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Results (admin only for writing)
app.get('/api/results', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT data FROM results WHERE id = 'current'");
    res.json(rows[0]?.data || {});
  } catch (err) {
    console.error('Error reading results:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/results', requireAdmin, async (req, res) => {
  const { results } = req.body;
  try {
    await pool.query(
      "UPDATE results SET data = $1 WHERE id = 'current'",
      [JSON.stringify(results)]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error saving results:', err);
    res.status(500).json({ error: 'Database error' });
  }
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
    const ppool = [...playinTeams[conf][7]];
    const seed7 = ppool[Math.floor(Math.random() * ppool.length)];
    const remaining = ppool.filter(t => t !== seed7);
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

app.post('/api/generate-random', requireAdmin, async (req, res) => {
  const picks = generateRandomBracket();
  try {
    await pool.query(
      `INSERT INTO entries (name, picks, updated_at) VALUES ('Random Bot', $1, NOW())
       ON CONFLICT (name) DO UPDATE SET picks = $1, updated_at = NOW()`,
      [JSON.stringify(picks)]
    );
    res.json({ success: true, picks });
  } catch (err) {
    console.error('Error saving random bracket:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Scoring: 2pts correct winner, +2pts correct games, +2pts unique pick
app.get('/api/leaderboard', requireAuth, async (req, res) => {
  try {
    const { rows: entryRows } = await pool.query('SELECT name, picks, updated_at FROM entries ORDER BY name');
    const { rows: resultRows } = await pool.query("SELECT data FROM results WHERE id = 'current'");
    const results = resultRows[0]?.data || {};

    // First pass: count how many people picked each winner per matchup
    const winnerCounts = {};
    for (const [matchupId, result] of Object.entries(results)) {
      if (!result.winner) continue;
      winnerCounts[matchupId] = 0;
      for (const row of entryRows) {
        const pick = row.picks[matchupId];
        if (pick && pick.winner === result.winner) {
          winnerCounts[matchupId]++;
        }
      }
    }

    const leaderboard = entryRows.map(row => {
      let score = 0;
      let correct = 0;
      let total = 0;

      for (const [matchupId, result] of Object.entries(results)) {
        if (!result.winner) continue;
        const pick = row.picks[matchupId];
        if (!pick) continue;
        total++;

        if (pick.winner === result.winner) {
          score += 2; // correct winner
          correct++;
          if (pick.games && result.games && pick.games === result.games) {
            score += 2; // correct games
          }
          if (winnerCounts[matchupId] === 1) {
            score += 2; // only person to pick this winner
          }
        }
      }

      return { name: row.name, score, correct, total, updatedAt: row.updated_at };
    });

    leaderboard.sort((a, b) => b.score - a.score);
    res.json(leaderboard);
  } catch (err) {
    console.error('Error computing leaderboard:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Name aliases for all-time merging (maps variant → canonical name)
const NAME_ALIASES = {
  'matt': 'Matt',
  'Will - big Sixers fan': 'Will',
};

function canonicalName(name) {
  return NAME_ALIASES[name] || name;
}

// All-time leaderboard
app.get('/api/leaderboard/all-time', requireAuth, async (req, res) => {
  try {
    // Get historical scores
    const { rows: historicalRows } = await pool.query(
      'SELECT name, SUM(score) as score, SUM(correct) as correct, SUM(total) as total FROM historical_scores GROUP BY name'
    );

    // Get current year scores (same logic as /api/leaderboard)
    const { rows: entryRows } = await pool.query('SELECT name, picks FROM entries ORDER BY name');
    const { rows: resultRows } = await pool.query("SELECT data FROM results WHERE id = 'current'");
    const results = resultRows[0]?.data || {};

    const winnerCounts = {};
    for (const [matchupId, result] of Object.entries(results)) {
      if (!result.winner) continue;
      winnerCounts[matchupId] = 0;
      for (const row of entryRows) {
        const pick = row.picks[matchupId];
        if (pick && pick.winner === result.winner) winnerCounts[matchupId]++;
      }
    }

    const currentScores = {};
    for (const row of entryRows) {
      let score = 0, correct = 0, total = 0;
      for (const [matchupId, result] of Object.entries(results)) {
        if (!result.winner) continue;
        const pick = row.picks[matchupId];
        if (!pick) continue;
        total++;
        if (pick.winner === result.winner) {
          score += 2;
          correct++;
          if (pick.games && result.games && pick.games === result.games) score += 2;
          if (winnerCounts[matchupId] === 1) score += 2;
        }
      }
      currentScores[row.name] = { score, correct, total };
    }

    // Merge historical + current using canonical names
    const merged = {};
    for (const row of historicalRows) {
      const cn = canonicalName(row.name);
      if (!merged[cn]) merged[cn] = { score: 0, correct: 0, total: 0 };
      merged[cn].score += parseInt(row.score) || 0;
      merged[cn].correct += parseInt(row.correct) || 0;
      merged[cn].total += parseInt(row.total) || 0;
    }
    for (const [name, data] of Object.entries(currentScores)) {
      const cn = canonicalName(name);
      if (!merged[cn]) merged[cn] = { score: 0, correct: 0, total: 0 };
      merged[cn].score += data.score;
      merged[cn].correct += data.correct;
      merged[cn].total += data.total;
    }

    const leaderboard = Object.entries(merged).map(([name, data]) => ({
      name,
      score: data.score,
      correct: data.correct,
      total: data.total,
    }));

    leaderboard.sort((a, b) => b.score - a.score);
    res.json(leaderboard);
  } catch (err) {
    console.error('Error computing all-time leaderboard:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Start server after DB init
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`NBA Bracket app running at http://localhost:${PORT}`);
    console.log(`Password: ${PASSWORD}`);
    console.log(`Admin password: ${ADMIN_PASSWORD}`);
    console.log(`Entries lock at: ${LOCK_DATE}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
