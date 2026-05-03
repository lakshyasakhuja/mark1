const express = require('express');
const router = express.Router();
const { createUser, verifyUser } = require('../db');

router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('login', { error: null });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = verifyUser(username, password);
  if (!user) return res.render('login', { error: 'Invalid username or password' });
  req.session.userId = user.id;
  req.session.username = user.username;
  res.redirect('/dashboard');
});

router.get('/register', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('register', { error: null });
});

router.post('/register', (req, res) => {
  const { username, password, email } = req.body;
  if (!username || !password || !email) return res.render('register', { error: 'All fields required' });
  try {
    const user = createUser({ username, password, email });
    req.session.userId = user.id;
    req.session.username = user.username;
    res.redirect('/dashboard');
  } catch (e) {
    res.render('register', { error: e.message });
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

module.exports = router;
