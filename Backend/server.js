'use strict';
require('dotenv').config(); // Reads .env file (rename _env to .env)

const express  = require('express');
const mysql    = require('mysql2/promise');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const cors     = require('cors');
const path     = require('path');
const https = require('https');
const fs = require('fs');

const app = express();

// ── 1. CONFIGURATION ──────────────────────────────────────
const PORT       = process.env.PORT       || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'mew-app-super-secret-key-2024';
const JWT_EXPIRES = '7d';

const DB_CONFIG = {
  host:     process.env.DB_HOST || 'localhost',
  user:     process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '#Kenchosum333',
  database: process.env.DB_NAME || 'mew',
};

// ── 2. MIDDLEWARE ──────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// Serve spttool.html (or index.html) on root
app.get('/', (req, res) => {
  // If your HTML file is spttool.html, serve that; otherwise index.html
  const tryFiles = ['spttool.html', 'index.html'];
  for (const f of tryFiles) {
    const fp = path.join(__dirname, f);
    try {
      require('fs').accessSync(fp);
      return res.sendFile(fp);
    } catch (_) { /* not found, try next */ }
  }
  res.status(404).send('No index found');
});

// ── 3. DATABASE POOL ───────────────────────────────────────
let pool;
async function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      ...DB_CONFIG,
      waitForConnections: true,
      connectionLimit: 10,
    });
  }
  return pool;
}

// ── 4. DATABASE BOOTSTRAP ──────────────────────────────────
async function initDB() {
  const db = await getPool();

  // Users — fullname column included from the start
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id            INT          AUTO_INCREMENT PRIMARY KEY,
      username      VARCHAR(60)  NOT NULL UNIQUE,
      fullname      VARCHAR(120) NOT NULL DEFAULT '',
      password_hash VARCHAR(255) NOT NULL,
      settings_json LONGTEXT,
      created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Safely add fullname if an older DB exists without it
  await db.execute(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS fullname VARCHAR(120) NOT NULL DEFAULT ''
  `).catch(() => {/* ignore if column already exists (older MySQL) */});

  // Activity Logs
  await db.execute(`
    CREATE TABLE IF NOT EXISTS logs (
      id           INT          AUTO_INCREMENT PRIMARY KEY,
      user_id      INT          NOT NULL,
      habit_id     VARCHAR(60),
      habit_name   VARCHAR(120),
      habit_icon   VARCHAR(10),
      date         DATE,
      duration     DOUBLE,
      unit         VARCHAR(20),
      display_unit VARCHAR(20),
      start_time   VARCHAR(10),
      end_time     VARCHAR(10),
      note         TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Check-ins / Survey results
  await db.execute(`
    CREATE TABLE IF NOT EXISTS checkins (
      id         INT       AUTO_INCREMENT PRIMARY KEY,
      user_id    INT       NOT NULL,
      score      INT,
      date       DATE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  console.log('✅ Database & tables verified');
}

// ── 5. AUTH MIDDLEWARE ─────────────────────────────────────
function verifyToken(req, res, next) {
  const auth  = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized Access' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.sub;
    next();
  } catch {
    res.status(401).json({ error: 'Session expired — please log in again' });
  }
}

// ── 6. AUTH ROUTES ─────────────────────────────────────────

// SIGNUP
app.post('/api/signup', async (req, res) => {
  try {
    const { name, username, password } = req.body;
    if (!name || !username || !password)
      return res.status(400).json({ error: 'All fields are required' });

    const db   = await getPool();
    const hash = await bcrypt.hash(password, 10);

    const [result] = await db.execute(
      'INSERT INTO users (username, fullname, password_hash, settings_json) VALUES (?, ?, ?, ?)',
      [username.toLowerCase().trim(), name.trim(), hash, '{}']
    );

    const token = jwt.sign({ sub: result.insertId }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.json({ token, username: username.toLowerCase().trim(), name: name.trim() });
  } catch (err) {
    console.error('/api/signup error:', err.message);
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ error: 'Username already taken' });
    res.status(500).json({ error: 'Server error during signup' });
  }
});

// LOGIN
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });

  try {
    const db     = await getPool();
    const [rows] = await db.execute(
      'SELECT * FROM users WHERE username = ?',
      [username.toLowerCase().trim()]
    );

    if (rows.length === 0)
      return res.status(401).json({ error: 'Invalid credentials' });

    const user  = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match)
      return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.json({ token, username: user.username, name: user.fullname });
  } catch (err) {
    console.error('/api/login error:', err.message);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// RESET PASSWORD (no auth — security-by-knowledge approach)
app.post('/api/reset-password', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password || password.length < 6)
    return res.status(400).json({ error: 'Invalid request' });

  try {
    const db   = await getPool();
    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.execute(
      'UPDATE users SET password_hash = ? WHERE username = ?',
      [hash, username.toLowerCase().trim()]
    );

    if (result.affectedRows === 0)
      return res.status(404).json({ error: 'User not found' });

    res.json({ success: true });
  } catch (err) {
    console.error('/api/reset-password error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ME — returns current user info (used by auto-login)
app.get('/api/me', verifyToken, async (req, res) => {
  try {
    const db     = await getPool();
    const [rows] = await db.execute(
      'SELECT id, username, fullname FROM users WHERE id = ?',
      [req.userId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ id: rows[0].id, username: rows[0].username, name: rows[0].fullname });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── 7. USER-DATA (single blob: alarms, habitEnabled, sounds, checkInHistory, quickAlarms) ──
// The frontend stores everything except logs in settings_json.
// Logs are stored in the dedicated `logs` table.

// GET /api/user-data — merges settings blob + logs from DB
app.get('/api/user-data', verifyToken, async (req, res) => {
  try {
    const db = await getPool();

    const [[user]] = await db.execute(
      'SELECT settings_json FROM users WHERE id = ?',
      [req.userId]
    );
    const settings = JSON.parse(user?.settings_json || '{}');

    const [logs] = await db.execute(
      `SELECT id, habit_id AS habitId, habit_name AS habitName, habit_icon AS habitIcon,
              DATE_FORMAT(date,'%Y-%m-%d') AS date, duration, unit, display_unit AS displayUnit,
              start_time AS startTime, end_time AS endTime, note
       FROM logs WHERE user_id = ? ORDER BY date DESC`,
      [req.userId]
    );

    res.json({
      logs:            logs || [],
      alarms:          settings.alarms          || {},
      habitEnabled:    settings.habitEnabled    || {},
      selectedSounds:  settings.selectedSounds  || {},
      customSounds:    settings.customSounds    || {},
      checkInHistory:  settings.checkInHistory  || [],
      quickAlarms:     settings.quickAlarms     || [],
      schedules:       settings.schedules       || [],
    });
  } catch (err) {
    console.error('/api/user-data GET error:', err.message);
    res.status(500).json({ error: 'Could not load user data' });
  }
});

// POST /api/user-data — saves settings blob; logs are handled separately
app.post('/api/user-data', verifyToken, async (req, res) => {
  try {
    const db = await getPool();
    const { logs, ...settingsOnly } = req.body; // Strip logs from settings blob

    await db.execute(
      'UPDATE users SET settings_json = ? WHERE id = ?',
      [JSON.stringify(settingsOnly), req.userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('/api/user-data POST error:', err.message);
    res.status(500).json({ error: 'Could not save user data' });
  }
});

// ── 8. LOGS ROUTES ─────────────────────────────────────────

// GET all logs
app.get('/api/logs', verifyToken, async (req, res) => {
  try {
    const db = await getPool();
    const [rows] = await db.execute(
      `SELECT id, habit_id AS habitId, habit_name AS habitName, habit_icon AS habitIcon,
              DATE_FORMAT(date,'%Y-%m-%d') AS date, duration, unit, display_unit AS displayUnit,
              start_time AS startTime, end_time AS endTime, note
       FROM logs WHERE user_id = ? ORDER BY date DESC`,
      [req.userId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch logs' });
  }
});

// POST — add new log entry
app.post('/api/logs', verifyToken, async (req, res) => {
  try {
    const { habitId, habitName, habitIcon, date, duration, unit, displayUnit, startTime, endTime, note } = req.body;
    const db = await getPool();
    await db.execute(
      `INSERT INTO logs (user_id, habit_id, habit_name, habit_icon, date, duration, unit, display_unit, start_time, end_time, note)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [req.userId, habitId, habitName, habitIcon, date, duration, unit, displayUnit, startTime, endTime, note || '']
    );
    res.json({ success: true });
  } catch (err) {
    console.error('/api/logs POST error:', err.message);
    res.status(500).json({ error: 'Could not save log' });
  }
});

// DELETE a single log by its DB id
app.delete('/api/logs/:id', verifyToken, async (req, res) => {
  try {
    const db = await getPool();
    await db.execute(
      'DELETE FROM logs WHERE id = ? AND user_id = ?',
      [req.params.id, req.userId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete log' });
  }
});

// ── 9. SETTINGS ROUTES (legacy — kept for backward compat) ─
app.get('/api/settings', verifyToken, async (req, res) => {
  try {
    const db     = await getPool();
    const [rows] = await db.execute('SELECT settings_json FROM users WHERE id = ?', [req.userId]);
    res.json(JSON.parse(rows[0]?.settings_json || '{}'));
  } catch (err) {
    res.status(500).json({ error: 'Could not load settings' });
  }
});

app.post('/api/settings', verifyToken, async (req, res) => {
  try {
    const db = await getPool();
    await db.execute('UPDATE users SET settings_json = ? WHERE id = ?', [JSON.stringify(req.body), req.userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not save settings' });
  }
});

// PUT /api/settings — update profile (name + username)
app.put('/api/settings', verifyToken, async (req, res) => {
  try {
    const { name, username } = req.body;
    if (!name || !username)
      return res.status(400).json({ error: 'Name and username required' });

    const db = await getPool();
    await db.execute(
      'UPDATE users SET fullname = ?, username = ? WHERE id = ?',
      [name.trim(), username.toLowerCase().trim(), req.userId]
    );
    res.json({ name: name.trim(), username: username.toLowerCase().trim() });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ error: 'Username already taken' });
    res.status(500).json({ error: 'Could not update profile' });
  }
});

// ── 10. CHECK-INS ──────────────────────────────────────────
app.post('/api/checkins', verifyToken, async (req, res) => {
  try {
    const { score, date } = req.body;
    const db = await getPool();
    await db.execute(
      'INSERT INTO checkins (user_id, score, date) VALUES (?, ?, ?)',
      [req.userId, score, date]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not save check-in' });
  }
});

app.get('/api/checkins', verifyToken, async (req, res) => {
  try {
    const db     = await getPool();
    const [rows] = await db.execute(
      "SELECT score, DATE_FORMAT(date,'%Y-%m-%d') AS date FROM checkins WHERE user_id = ? ORDER BY date ASC",
      [req.userId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch check-ins' });
  }
});

// ── 11. START SERVER ───────────────────────────────────────
initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n🚀  Mew server running → http://localhost:${PORT}`);
      console.log(`📁  Serving files from: ${__dirname}\n`);
    });
  })
  .catch(err => {
    console.error('❌ Failed to start — DB error:', err.message);
    console.error('💡 Is MySQL/XAMPP running? Does the "mew" database exist?\n');
    process.exit(1);
  });
