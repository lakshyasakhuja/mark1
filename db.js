const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');
const bcrypt = require('bcryptjs');

const adapter = new FileSync(path.join(__dirname, 'data', 'db.json'));
const db = low(adapter);

// Default schema
db.defaults({
  users: [],
  trips: [],
  leaderboard: []
}).write();

// Helper: find user by username
function findUser(username) {
  return db.get('users').find({ username }).value();
}

// Helper: find user by id
function findUserById(id) {
  return db.get('users').find({ id }).value();
}

// Helper: create user
function createUser({ username, password, email }) {
  const existing = findUser(username);
  if (existing) throw new Error('Username already taken');
  const hash = bcrypt.hashSync(password, 10);
  const user = {
    id: Date.now().toString(),
    username,
    email,
    password: hash,
    coins: 0,
    co2Saved: 0,
    totalSavingsINR: 0,
    tripsCompleted: 0,
    createdAt: new Date().toISOString()
  };
  db.get('users').push(user).write();
  return user;
}

// Helper: verify password
function verifyUser(username, password) {
  const user = findUser(username);
  if (!user) return null;
  if (!bcrypt.compareSync(password, user.password)) return null;
  return user;
}

// Helper: log a trip and award coins
function logTrip({ userId, origin, destination, mode, distanceKm, costINR, durationMin, coins, co2SavedKg, savingsINR }) {
  const trip = {
    id: Date.now().toString(),
    userId,
    origin,
    destination,
    mode,
    distanceKm,
    costINR,
    durationMin,
    coins,
    co2SavedKg,
    savingsINR,
    createdAt: new Date().toISOString()
  };
  db.get('trips').push(trip).write();

  // Update user stats
  db.get('users').find({ id: userId }).update('coins', n => n + coins)
    .update('co2Saved', n => parseFloat((n + co2SavedKg).toFixed(2)))
    .update('totalSavingsINR', n => n + savingsINR)
    .update('tripsCompleted', n => n + 1)
    .write();

  return trip;
}

// Helper: get user trips
function getUserTrips(userId, limit = 10) {
  return db.get('trips').filter({ userId }).sortBy('createdAt').reverse().take(limit).value();
}

// Helper: get leaderboard
function getLeaderboard() {
  return db.get('users')
    .sortBy('coins')
    .reverse()
    .take(10)
    .map(u => ({ username: u.username, coins: u.coins, co2Saved: u.co2Saved, tripsCompleted: u.tripsCompleted }))
    .value();
}

// Update user coins manually (e.g. redemption)
function updateUser(id, updates) {
  db.get('users').find({ id }).assign(updates).write();
}

module.exports = { db, findUser, findUserById, createUser, verifyUser, logTrip, getUserTrips, getLeaderboard, updateUser };
