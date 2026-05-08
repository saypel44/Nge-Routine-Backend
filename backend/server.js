const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();

const app = express();

// ── Middleware ──
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json({ limit: '5mb' }));

// ── DB Pool ──
const pool = mysql.createPool({
  host:     process.env.MYSQLHOST     || process.env.DB_HOST,
  port:     process.env.MYSQLPORT     || process.env.DB_PORT     || 3306,
  user:     process.env.MYSQLUSER     || process.env.DB_USER,
  password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD,
  database: process.env.MYSQLDATABASE || process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
});

// ── JWT helper ──
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret_in_production';
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer '))
    return res.status(401).json({ error: 'Missing token' });
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ── DB Init ──
async function initDB() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        username    VARCHAR(50) UNIQUE NOT NULL,
        name        VARCHAR(100) NOT NULL,
        password    VARCHAR(255) NOT NULL,
        joined_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS time_logs (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        user_id      INT NOT NULL,
        habit_id     VARCHAR(100),
        habit_name   VARCHAR(100),
        habit_icon   VARCHAR(10),
        log_date     DATE NOT NULL,
        duration     DECIMAL(10,4) NOT NULL,
        unit         VARCHAR(10) DEFAULT 'hrs',
        start_time   VARCHAR(20),
        end_time     VARCHAR(20),
        note         TEXT,
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS alarms (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        user_id      INT NOT NULL,
        alarm_key    VARCHAR(100) NOT NULL,
        alarm_data   JSON NOT NULL,
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_user_alarm (user_id, alarm_key),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS user_settings (
        user_id      INT PRIMARY KEY,
        settings     JSON NOT NULL,
        updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('✅ Database tables ready');
  } finally {
    conn.release();
  }
}

// ═══════════════════════════════════════
//  AUTH ROUTES
// ═══════════════════════════════════════

// POST /api/auth/signup
app.post('/api/auth/signup', async (req, res) => {
  const { username, name, password } = req.body;
  if (!username || !name || !password)
    return res.status(400).json({ error: 'All fields required' });
  if (username.length < 3)
    return res.status(400).json({ error: 'Username must be at least 3 characters' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });

  try {
    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (username, name, password) VALUES (?, ?, ?)',
      [username.toLowerCase(), name, hash]
    );
    const token = signToken({ id: result.insertId, username: username.toLowerCase(), name });
    res.json({ token, user: { id: result.insertId, username: username.toLowerCase(), name } });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ error: 'Username already taken' });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username.toLowerCase()]);
    if (!rows.length) return res.status(401).json({ error: 'Incorrect username or password' });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Incorrect username or password' });

    const token = signToken({ id: user.id, username: user.username, name: user.name });
    res.json({ token, user: { id: user.id, username: user.username, name: user.name } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/me  — verify token & return user
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, username, name, joined_at FROM users WHERE id = ?', [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({ user: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/auth/update — update name / username
app.patch('/api/auth/update', authMiddleware, async (req, res) => {
  const { name, newUsername } = req.body;
  const userId = req.user.id;
  try {
    if (newUsername && newUsername !== req.user.username) {
      const [exist] = await pool.query('SELECT id FROM users WHERE username = ?', [newUsername.toLowerCase()]);
      if (exist.length) return res.status(409).json({ error: 'Username already taken' });
      await pool.query('UPDATE users SET name = ?, username = ? WHERE id = ?', [name, newUsername.toLowerCase(), userId]);
    } else {
      await pool.query('UPDATE users SET name = ? WHERE id = ?', [name, userId]);
    }
    const finalUsername = newUsername ? newUsername.toLowerCase() : req.user.username;
    const token = signToken({ id: userId, username: finalUsername, name });
    res.json({ token, user: { id: userId, username: finalUsername, name } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════
//  TIME LOGS ROUTES
// ═══════════════════════════════════════

// GET /api/logs — get all logs for current user
app.get('/api/logs', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM time_logs WHERE user_id = ? ORDER BY log_date DESC, created_at DESC',
      [req.user.id]
    );
    // map to frontend shape
    const logs = rows.map(r => ({
      id:        r.id,
      habitId:   r.habit_id,
      habitName: r.habit_name,
      habitIcon: r.habit_icon,
      date:      r.log_date instanceof Date
                   ? r.log_date.toISOString().split('T')[0]
                   : String(r.log_date).split('T')[0],
      duration:  parseFloat(r.duration),
      unit:      r.unit,
      startTime: r.start_time,
      endTime:   r.end_time,
      note:      r.note
    }));
    res.json({ logs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/logs — create a single log entry
app.post('/api/logs', authMiddleware, async (req, res) => {
  const { habitId, habitName, habitIcon, date, duration, unit, startTime, endTime, note } = req.body;
  if (!date || duration === undefined)
    return res.status(400).json({ error: 'date and duration are required' });
  try {
    const [result] = await pool.query(
      `INSERT INTO time_logs (user_id,habit_id,habit_name,habit_icon,log_date,duration,unit,start_time,end_time,note)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [req.user.id, habitId, habitName, habitIcon, date, duration, unit || 'hrs', startTime, endTime, note]
    );
    res.json({ id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/logs/bulk — replace ALL logs for the user (full sync)
app.post('/api/logs/bulk', authMiddleware, async (req, res) => {
  const { logs } = req.body;
  if (!Array.isArray(logs)) return res.status(400).json({ error: 'logs must be an array' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM time_logs WHERE user_id = ?', [req.user.id]);

    if (logs.length) {
      const values = logs.map(l => [
        req.user.id,
        l.habitId, l.habitName, l.habitIcon,
        l.date, l.duration, l.unit || 'hrs',
        l.startTime, l.endTime, l.note
      ]);
      await conn.query(
        `INSERT INTO time_logs (user_id,habit_id,habit_name,habit_icon,log_date,duration,unit,start_time,end_time,note)
         VALUES ?`,
        [values]
      );
    }
    await conn.commit();
    res.json({ saved: logs.length });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
});

// DELETE /api/logs/:id
app.delete('/api/logs/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM time_logs WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════
//  ALARMS ROUTES
// ═══════════════════════════════════════

// GET /api/alarms
app.get('/api/alarms', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT alarm_key, alarm_data FROM alarms WHERE user_id = ?', [req.user.id]);
    const alarms = {};
    rows.forEach(r => { alarms[r.alarm_key] = r.alarm_data; });
    res.json({ alarms });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/alarms/:key  — upsert a single alarm
app.put('/api/alarms/:key', authMiddleware, async (req, res) => {
  const { data } = req.body;
  try {
    await pool.query(
      `INSERT INTO alarms (user_id, alarm_key, alarm_data)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE alarm_data = VALUES(alarm_data), updated_at = NOW()`,
      [req.user.id, req.params.key, JSON.stringify(data)]
    );
    res.json({ saved: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/alarms — bulk replace all alarms
app.put('/api/alarms', authMiddleware, async (req, res) => {
  const { alarms } = req.body; // { habitId: alarmData, ... }
  if (typeof alarms !== 'object') return res.status(400).json({ error: 'alarms must be an object' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM alarms WHERE user_id = ?', [req.user.id]);
    const entries = Object.entries(alarms);
    if (entries.length) {
      const values = entries.map(([k, v]) => [req.user.id, k, JSON.stringify(v)]);
      await conn.query('INSERT INTO alarms (user_id, alarm_key, alarm_data) VALUES ?', [values]);
    }
    await conn.commit();
    res.json({ saved: entries.length });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
});

// DELETE /api/alarms/:key
app.delete('/api/alarms/:key', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM alarms WHERE user_id = ? AND alarm_key = ?', [req.user.id, req.params.key]);
    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════
//  USER SETTINGS (habitEnabled, selectedSounds, etc.)
// ═══════════════════════════════════════

// GET /api/settings
app.get('/api/settings', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT settings FROM user_settings WHERE user_id = ?', [req.user.id]);
    res.json({ settings: rows.length ? rows[0].settings : {} });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/settings
app.put('/api/settings', authMiddleware, async (req, res) => {
  const { settings } = req.body;
  try {
    await pool.query(
      `INSERT INTO user_settings (user_id, settings) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE settings = VALUES(settings), updated_at = NOW()`,
      [req.user.id, JSON.stringify(settings)]
    );
    res.json({ saved: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════
//  FULL DATA SYNC  (single-call load + save)
// ═══════════════════════════════════════

// GET /api/sync — load everything for the logged-in user
app.get('/api/sync', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const [[logsRows], [alarmRows], [settingsRows]] = await Promise.all([
      pool.query('SELECT * FROM time_logs WHERE user_id = ? ORDER BY log_date DESC', [userId]),
      pool.query('SELECT alarm_key, alarm_data FROM alarms WHERE user_id = ?', [userId]),
      pool.query('SELECT settings FROM user_settings WHERE user_id = ?', [userId])
    ]);

    const logs = logsRows.map(r => ({
      id: r.id,
      habitId:   r.habit_id,
      habitName: r.habit_name,
      habitIcon: r.habit_icon,
      date:      r.log_date instanceof Date
                   ? r.log_date.toISOString().split('T')[0]
                   : String(r.log_date).split('T')[0],
      duration:  parseFloat(r.duration),
      unit:      r.unit,
      startTime: r.start_time,
      endTime:   r.end_time,
      note:      r.note
    }));

    const alarms = {};
    alarmRows.forEach(r => { alarms[r.alarm_key] = r.alarm_data; });

    const settings = settingsRows.length ? settingsRows[0].settings : {};

    res.json({ logs, alarms, settings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/sync — save everything in one shot
app.post('/api/sync', authMiddleware, async (req, res) => {
  const { logs = [], alarms = {}, settings = {} } = req.body;
  const userId = req.user.id;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // logs
    await conn.query('DELETE FROM time_logs WHERE user_id = ?', [userId]);
    if (logs.length) {
      const values = logs.map(l => [
        userId,
        l.habitId, l.habitName, l.habitIcon,
        l.date, l.duration, l.unit || 'hrs',
        l.startTime || null, l.endTime || null, l.note || null
      ]);
      await conn.query(
        `INSERT INTO time_logs (user_id,habit_id,habit_name,habit_icon,log_date,duration,unit,start_time,end_time,note)
         VALUES ?`, [values]
      );
    }

    // alarms
    await conn.query('DELETE FROM alarms WHERE user_id = ?', [userId]);
    const alarmEntries = Object.entries(alarms);
    if (alarmEntries.length) {
      const vals = alarmEntries.map(([k, v]) => [userId, k, JSON.stringify(v)]);
      await conn.query('INSERT INTO alarms (user_id, alarm_key, alarm_data) VALUES ?', [vals]);
    }

    // settings
    await conn.query(
      `INSERT INTO user_settings (user_id, settings) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE settings = VALUES(settings), updated_at = NOW()`,
      [userId, JSON.stringify(settings)]
    );

    await conn.commit();
    res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
});

// ── Health check ──
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// ── Start ──
const PORT = process.env.PORT || 3001;
initDB()
  .then(() => {
    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  })
  .catch(err => {
    console.error('DB init failed:', err);
    process.exit(1);
  });
