const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getRoutes, LOCATIONS, MODE_ICONS } = require('../scoring');
const { findUserById, logTrip } = require('../db');

router.get('/plan', requireAuth, (req, res) => {
  const user = findUserById(req.session.userId);
  res.render('planner', { user, locations: LOCATIONS, routes: null, origin: '', destination: '', error: null });
});

router.post('/plan', requireAuth, (req, res) => {
  const { origin, destination } = req.body;
  const user = findUserById(req.session.userId);

  if (!origin || !destination || origin === destination) {
    return res.render('planner', {
      user, locations: LOCATIONS, routes: null,
      origin, destination,
      error: 'Please select different origin and destination.'
    });
  }

  const routes = getRoutes(origin, destination);
  if (!routes) {
    return res.render('planner', {
      user, locations: LOCATIONS, routes: null,
      origin, destination,
      error: 'No routes found for this combination yet. Try Ghaziabad, CP, Noida Sector 18, or IGI Airport.'
    });
  }

  res.render('planner', { user, locations: LOCATIONS, routes, origin, destination, error: null, modeIcons: MODE_ICONS });
});

// Log a chosen trip and award coins
router.post('/plan/book', requireAuth, (req, res) => {
  const { origin, destination, routeName, mode, distanceKm, costINR, durationMin, coins, co2SavedKg, savingsINR } = req.body;

  logTrip({
    userId: req.session.userId,
    origin,
    destination,
    mode: routeName,
    distanceKm: parseFloat(distanceKm),
    costINR: parseInt(costINR),
    durationMin: parseInt(durationMin),
    coins: parseInt(coins),
    co2SavedKg: parseFloat(co2SavedKg),
    savingsINR: parseInt(savingsINR)
  });

  res.redirect('/dashboard?booked=1');
});

module.exports = router;
