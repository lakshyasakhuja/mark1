const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getRoutes, LOCATIONS, MODE_ICONS, normaliseLocation } = require('../scoring');
const { findUserById, logTrip } = require('../db');
const { getStopById } = require('../stops');

router.get('/plan', requireAuth, (req, res) => {
  const user = findUserById(req.session.userId);
  res.render('planner', { user, locations: LOCATIONS, routes: null, origin: '', destination: '', error: null });
});

router.post('/plan', requireAuth, (req, res) => {
  const user = findUserById(req.session.userId);
  // origin/destination can be a GTFS stop id OR a preset key OR a label
  let originRaw = req.body.origin || req.body.origin_label || '';
  let destRaw = req.body.destination || req.body.destination_label || '';

  // Display labels
  const originLabel = req.body.origin_label || originRaw;
  const destLabel = req.body.destination_label || destRaw;

  if (!originRaw || !destRaw || originRaw === destRaw) {
    return res.render('planner', {
      user, locations: LOCATIONS, routes: null,
      origin: originLabel, destination: destLabel,
      error: 'Please select different origin and destination.'
    });
  }

  // Try to get routes — normalise both ends
  const routes = getRoutes(originRaw, destRaw);

  if (!routes) {
    return res.render('planner', {
      user, locations: LOCATIONS, routes: null,
      origin: originLabel, destination: destLabel,
      error: 'No optimized routes found for this combination yet. Try the quick routes below, or use: Ghaziabad, Connaught Place, Noida Sector 18, IGI Airport.'
    });
  }

  res.render('planner', {
    user, locations: LOCATIONS, routes,
    origin: originLabel, destination: destLabel,
    error: null, modeIcons: MODE_ICONS
  });
});

router.post('/plan/book', requireAuth, (req, res) => {
  const { origin, destination, routeName, mode, distanceKm, costINR, durationMin, coins, co2SavedKg, savingsINR } = req.body;
  logTrip({
    userId: req.session.userId,
    origin, destination,
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
