const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const { searchStops, getStopCount, isGTFSLoaded } = require('./stops');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(session({
  secret: 'mark1-suscoin-secret-2025',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── API: stop autocomplete ──────────────────────────────────────────────
app.get('/api/stops', (req, res) => {
  const q = req.query.q || '';
  if (q.length < 2) return res.json([]);
  res.json(searchStops(q, 10));
});

// ── API: GTFS status ────────────────────────────────────────────────────
app.get('/api/gtfs-status', (req, res) => {
  res.json({ loaded: isGTFSLoaded(), stopCount: getStopCount() });
});

// ── Pages ───────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('home');
});

app.use('/', require('./routes/auth'));
app.use('/', require('./routes/dashboard'));
app.use('/', require('./routes/planner'));

// 404
app.use((req, res) => {
  res.status(404).send(`
    <style>body{font-family:sans-serif;background:#0D1117;color:#E6EDF3;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:1rem;}</style>
    <h1>404 — Page not found</h1>
    <a href="/" style="color:#3FB950">← Go Home</a>
  `);
});

app.listen(PORT, () => {
  console.log(`\n🗺️  Mark 1 × susCoin running at http://localhost:${PORT}`);
  console.log(`   GTFS bus stops: ${isGTFSLoaded() ? getStopCount() + ' loaded' : 'not loaded — run: node scripts/load-gtfs.js'}`);
  console.log(`   Smart commute optimization for Delhi NCR\n`);
});
