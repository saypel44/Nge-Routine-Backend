# Quick Tracker — Backend Setup & Railway Deployment Guide

## Project Structure

```
your-project/
├── backend/          ← This folder — deploy this to Railway
│   ├── server.js
│   ├── package.json
│   ├── .env.example
│   ├── .gitignore
│   └── api.js        ← Copy this to your FRONTEND folder
│
└── frontend/         ← Your existing files
    ├── index.html
    ├── spttool.css
    ├── spttool.js
    └── api.js        ← Paste api.js here
```

---

## Step 1 — Edit index.html

Find the two `<script>` lines near the bottom of `index.html` and make sure they look like this:

```html
<script src="spttool.js" defer></script>
<script src="api.js" defer></script>   <!-- uncomment / add this line -->
```

The `api.js` file overrides the localStorage-only functions with real API calls.

---

## Step 2 — Local Development (optional but recommended)

### 2a. Install Node.js
<!-- Download from https://nodejs.org (v18 or newer) -->

### 2b. Create a local MySQL database
```sql
CREATE DATABASE quick_tracker;
```

### 2c. Set up environment variables
```bash
cd backend
cp .env.example .env
# Now edit .env with your local MySQL credentials
```

### 2d. Install dependencies and start
```bash
cd backend
npm install
npm run dev     # uses nodemon for auto-restart
```

The server starts at http://localhost:3001

### 2e. Test it
```
GET http://localhost:3001/health
```
Should return: `{"status":"ok","time":"..."}`

---

## Step 3 — Push to GitHub

```bash
# From the backend/ folder
git init
git add .
git commit -m "Initial backend"
git remote add origin https://github.com/YOUR_USERNAME/quick-tracker-backend.git
git push -u origin main
```

> ⚠️ Make sure `.gitignore` includes `.env` — never commit secrets!

---

## Step 4 — Deploy Backend on Railway

1. Go to https://railway.app and sign in (free account works)
2. Click **New Project → Deploy from GitHub repo**
3. Select your `quick-tracker-backend` repository
4. Railway auto-detects Node.js and sets `npm start`

### 4a. Add MySQL database
In your Railway project:
- Click **+ New** → **Database** → **MySQL**
- Railway creates the DB and auto-injects these environment variables into your app:
  - `MYSQLHOST`
  - `MYSQLPORT`
  - `MYSQLUSER`
  - `MYSQLPASSWORD`
  - `MYSQLDATABASE`

> `server.js` already reads these Railway variable names — no config change needed.

### 4b. Add your own environment variables
In Railway → your backend service → **Variables** tab, add:

| Variable       | Value                                      |
|----------------|--------------------------------------------|
| `JWT_SECRET`   | A long random string (e.g. 64 random chars)|
| `FRONTEND_URL` | Your frontend URL (see Step 5)             |

Generate a strong secret:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 4c. Get your Railway URL
Railway → your backend service → **Settings** → **Domains**
It looks like: `https://quick-tracker-backend-production.up.railway.app`

---

## Step 5 — Deploy Frontend

You can host the frontend for free on any of these:

### Option A: GitHub Pages (easiest)
1. Put `index.html`, `spttool.css`, `spttool.js`, `api.js` in a GitHub repo
2. Go to repo **Settings → Pages → Source: main branch / root**
3. Your site is live at `https://USERNAME.github.io/REPO_NAME`

### Option B: Netlify
1. Drag-and-drop your frontend folder at https://app.netlify.com
2. Get a URL like `https://your-site.netlify.app`

### Option C: Vercel
```bash
npm install -g vercel
cd frontend
vercel
```

https://stately-centaur-64f469.netlify.app/ 

---

## Step 6 — Connect Frontend to Backend

Open `api.js` in your **frontend** folder and update line 9:

```js
// Before:
const API_BASE = 'https://YOUR-RAILWAY-APP.up.railway.app';

// After (use your actual Railway URL):
const API_BASE = 'https://quick-tracker-backend-production.up.railway.app';
```

Then redeploy/push your frontend.

---

## Step 7 — Update CORS (if needed)

If your browser shows CORS errors, add your frontend URL to Railway environment variables:

```
FRONTEND_URL=https://your-frontend.netlify.app
```

---

## API Reference

| Method | Endpoint         | Auth | Description                    |
|--------|-----------------|------|--------------------------------|
| POST   | /api/auth/signup | —    | Create account                 |
| POST   | /api/auth/login  | —    | Login, get JWT token           |
| GET    | /api/auth/me     | ✓    | Verify token, get user info    |
| PATCH  | /api/auth/update | ✓    | Update name / username         |
| GET    | /api/sync        | ✓    | Load all user data             |
| POST   | /api/sync        | ✓    | Save all user data             |
| GET    | /api/logs        | ✓    | Get time logs                  |
| POST   | /api/logs        | ✓    | Add a single log               |
| DELETE | /api/logs/:id    | ✓    | Delete a log                   |
| GET    | /api/alarms      | ✓    | Get alarms                     |
| PUT    | /api/alarms      | ✓    | Bulk save alarms               |
| GET    | /api/settings    | ✓    | Get user settings              |
| PUT    | /api/settings    | ✓    | Save user settings             |
| GET    | /health          | —    | Health check                   |

All protected routes require: `Authorization: Bearer <token>`

---

## Database Tables

| Table           | Purpose                                    |
|-----------------|--------------------------------------------|
| `users`         | Accounts (hashed passwords, bcrypt)        |
| `time_logs`     | Every tracked time entry per user          |
| `alarms`        | Habit alarms stored as JSON per user       |
| `user_settings` | habitEnabled, sounds, quickAlarms, etc.    |

Tables are created automatically on first server start.

---

## Security Notes

- Passwords are hashed with **bcrypt** (never stored in plain text)
- Authentication uses **JWT tokens** (30-day expiry)
- Each user can only read/write their own data
- CORS is restricted to your `FRONTEND_URL`

---

## Troubleshooting

**"Database connection refused"**
→ Check `MYSQLHOST`, `MYSQLPORT`, `MYSQLUSER`, `MYSQLPASSWORD`, `MYSQLDATABASE` in Railway Variables

**"Invalid or expired token"**
→ User needs to log in again. Tokens last 30 days.

**CORS error in browser**
→ Make sure `FRONTEND_URL` in Railway Variables matches your exact frontend URL (no trailing slash)

**Railway deploy fails**
→ Check the **Deploy Logs** tab in Railway for the error message
