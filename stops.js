/**
 * stops.js
 * Loads real GTFS stop data if available, falls back to hardcoded locations.
 */

const fs = require('fs');
const path = require('path');

const STOPS_FILE = path.join(__dirname, 'data', 'stops.json');
const ROUTES_FILE = path.join(__dirname, 'data', 'bus-routes.json');
const ROUTE_STOPS_FILE = path.join(__dirname, 'data', 'route-stops.json');

let _stops = null;
let _busRoutes = null;
let _routeStops = null;
let _gtfsLoaded = false;

function loadGTFS() {
  if (_stops !== null) return; // already loaded

  if (fs.existsSync(STOPS_FILE)) {
    try {
      _stops = JSON.parse(fs.readFileSync(STOPS_FILE, 'utf8'));
      _gtfsLoaded = true;
      console.log(`✅  GTFS: ${_stops.length} bus stops loaded from data/stops.json`);
    } catch (e) {
      console.warn('⚠️  Could not parse stops.json:', e.message);
      _stops = [];
    }
  } else {
    _stops = [];
    console.log('ℹ️  No GTFS data found. Run: node scripts/load-gtfs.js');
    console.log('   Using hardcoded Delhi NCR locations for now.');
  }

  if (fs.existsSync(ROUTES_FILE)) {
    try { _busRoutes = JSON.parse(fs.readFileSync(ROUTES_FILE, 'utf8')); } catch (e) {}
  }

  if (fs.existsSync(ROUTE_STOPS_FILE)) {
    try { _routeStops = JSON.parse(fs.readFileSync(ROUTE_STOPS_FILE, 'utf8')); } catch (e) {}
  }
}

/**
 * Search stops by name query (case-insensitive, partial match).
 * Returns up to `limit` results.
 */
function searchStops(query, limit = 10) {
  loadGTFS();
  if (!query || query.length < 2) return [];
  const q = query.toLowerCase().trim();
  return _stops
    .filter(s => s.name.toLowerCase().includes(q))
    .slice(0, limit)
    .map(s => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng }));
}

/**
 * Find a stop by exact id.
 */
function getStopById(id) {
  loadGTFS();
  return _stops.find(s => s.id === id) || null;
}

/**
 * Find routes that serve both stop A and stop B.
 */
function findRoutesBetweenStops(stopIdA, stopIdB) {
  loadGTFS();
  if (!_routeStops) return [];

  const common = [];
  for (const [routeId, stopIds] of Object.entries(_routeStops)) {
    if (stopIds.includes(stopIdA) && stopIds.includes(stopIdB)) {
      const route = _busRoutes ? _busRoutes.find(r => r.id === routeId) : null;
      common.push({ routeId, shortName: route?.shortName || routeId, longName: route?.longName || '' });
    }
  }
  return common;
}

/**
 * Get total stop count (for display).
 */
function getStopCount() {
  loadGTFS();
  return _stops.length;
}

function isGTFSLoaded() {
  loadGTFS();
  return _gtfsLoaded;
}

// Preload on require
loadGTFS();

module.exports = { searchStops, getStopById, findRoutesBetweenStops, getStopCount, isGTFSLoaded };
