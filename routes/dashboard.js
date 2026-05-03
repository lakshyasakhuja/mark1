const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { findUserById, getUserTrips, getLeaderboard } = require('../db');

router.get('/dashboard', requireAuth, (req, res) => {
  const user = findUserById(req.session.userId);
  const trips = getUserTrips(req.session.userId, 5);
  const leaderboard = getLeaderboard();
  const rank = leaderboard.findIndex(u => u.username === user.username) + 1;
  res.render('dashboard', { user, trips, leaderboard, rank });
});

router.get('/leaderboard', requireAuth, (req, res) => {
  const user = findUserById(req.session.userId);
  const leaderboard = getLeaderboard();
  const rank = leaderboard.findIndex(u => u.username === user.username) + 1;
  res.render('leaderboard', { user, leaderboard, rank });
});

module.exports = router;
