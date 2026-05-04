/**
 * engine/router.js
 * 
 * High-level routing API for Mark 1.
 * Takes origin/destination (name or lat/lng) and returns route options.
 * Uses Dijkstra graph search + ML travel time adjustment.
 */

'use strict';

const { graph, haversineKm } = require('./graph');
const { adjustDuration, getTrafficStatus } = require('../ml/travel-time');
const fs = require('fs');
const path = require('path');

// Build graph on first use
let _initialized = false;
function ensureGraph() {
  if (!_initialized) {
    graph.build();
    _initialized = true;
  }
}

// ── Known location registry (name → nodeId) ──────────────────────────────────

const KNOWN_LOCATIONS = {
  // Preset areas — map to nearest rail/bus node
  'ghaziabad':        { railId: 'rail_GZB',  name: 'Ghaziabad' },
  'connaught_place':  { railId: 'rail_NDLS', name: 'Connaught Place' },   // nearest rail is New Delhi
  'noida_sector_18':  { railId: 'rail_ANV',  name: 'Noida Sector 18' },
  'igi_airport':      { railId: 'rail_DEC',  name: 'IGI Airport T3' },    // Delhi Cantt is closest rail
  'new_delhi':        { railId: 'rail_NDLS', name: 'New Delhi' },
  'old_delhi':        { railId: 'rail_DLI',  name: 'Old Delhi' },
  'nizamuddin':       { railId: 'rail_NZM',  name: 'Hazrat Nizamuddin' },
  'faridabad':        { railId: 'rail_FDB',  name: 'Faridabad' },
  'gurgaon':          { railId: 'rail_GGN',  name: 'Gurgaon' },
  'anand_vihar':      { railId: 'rail_ANV',  name: 'Anand Vihar' },
  'shahdara':         { railId: 'rail_DSA',  name: 'Shahdara' },
};

function resolveLocation(input) {
  const s = input.toLowerCase().trim();

  // Direct key match
  if (KNOWN_LOCATIONS[s]) return KNOWN_LOCATIONS[s];

  // Fuzzy match
  for (const [key, val] of Object.entries(KNOWN_LOCATIONS)) {
    if (s.includes(key.replace(/_/g, ' ')) || key.replace(/_/g, ' ').includes(s)) {
      return val;
    }
  }

  // Try to match a rail station name
  for (const [nodeId, node] of graph.nodes) {
    if (node.type === 'rail' && node.name.toLowerCase().includes(s)) {
      return { railId: nodeId, name: node.name };
    }
  }

  // Try bus stop name
  for (const [nodeId, node] of graph.nodes) {
    if (node.type === 'bus' && node.name.toLowerCase().includes(s)) {
      return { busId: nodeId, name: node.name };
    }
  }

  return null;
}

// ── Main route function ───────────────────────────────────────────────────────

function findRoutes(originInput, destinationInput, date = new Date()) {
  ensureGraph();

  const originLoc = resolveLocation(originInput);
  const destLoc = resolveLocation(destinationInput);

  if (!originLoc || !destLoc) return null;

  const originId = originLoc.railId || originLoc.busId;
  const destId = destLoc.railId || destLoc.busId;

  if (!originId || !destId || originId === destId) return null;

  // Run Dijkstra for all 3 objectives
  const objectives = ['cost', 'time', 'balanced'];
  const typeLabels = { cost: 'cheapest', time: 'fastest', balanced: 'balanced' };
  const typeNames = {
    cost: '💸 Cheapest Route',
    time: '⚡ Fastest Route',
    balanced: '⭐ Balanced Route'
  };

  const traffic = getTrafficStatus(date);
  const routes = [];
  const seen = new Set();

  for (const obj of objectives) {
    const result = graph.dijkstra(originId, destId, obj);
    if (!result) continue;

    // Deduplicate routes with same legs
    const fingerprint = result.legs.map(l => `${l.mode}:${l.routeId}`).join('|');
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);

    // Apply ML travel time adjustment per leg
    const adjustedLegs = result.legs.map(leg => {
      const adjustedTime = adjustDuration(leg.timeMin, leg.mode, leg.distKm, date);
      return { ...leg, timeMin: adjustedTime };
    });

    const adjustedDuration = adjustedLegs.reduce((s, l) => s + l.timeMin, 0);

    routes.push({
      name: typeNames[obj],
      type: typeLabels[obj],
      legs: adjustedLegs.map(l => ({
        ...l,
        label: l.label,
        distanceKm: l.distKm,
        durationMin: l.timeMin
      })),
      totalCost: result.totalCost,
      totalDuration: adjustedDuration,
      totalCO2Saved: result.totalCO2Saved,
      totalCoins: result.totalCoins,
      totalDistance: result.totalDistance,
      totalSavings: result.totalSavings,
      traffic
    });
  }

  if (!routes.length) return null;

  return {
    origin: originLoc.name,
    destination: destLoc.name,
    routes,
    traffic,
    generatedAt: date.toISOString()
  };
}

// ── Available locations for UI ────────────────────────────────────────────────

const LOCATIONS = Object.entries(KNOWN_LOCATIONS).map(([key, val]) => ({
  key, label: val.name
}));

module.exports = { findRoutes, resolveLocation, LOCATIONS, KNOWN_LOCATIONS };
