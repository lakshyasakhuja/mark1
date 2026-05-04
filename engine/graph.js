/**
 * engine/graph.js
 * 
 * Multi-modal routing graph for Mark 1.
 * Nodes: bus stops (from GTFS) + rail stations + key locations
 * Edges: bus routes, rail lines, walking transfers
 * Algorithm: Dijkstra with multi-objective scoring (cost, time, CO2, coins)
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ── Constants ────────────────────────────────────────────────────────────────

const WALK_SPEED_KMH = 5;
const MAX_WALK_TRANSFER_M = 600;    // max walking distance for a transfer
const TRANSFER_PENALTY_MIN = 5;     // penalty for each mode switch

// CO2 grams per passenger-km
const CO2_G_PER_KM = {
  bus: 45, rail: 20, metro: 28, auto: 80, cab: 171, walking: 0
};

// Cost per km in INR
const COST_PER_KM = {
  bus: 1.5, rail: 0.6, metro: 3.5, auto: 9, cab: 14, walking: 0
};

// Speed km/h
const SPEED_KMH = {
  bus: 18, rail: 45, metro: 35, auto: 22, cab: 28, walking: 5
};

// Base fare
const BASE_FARE = {
  bus: 5, rail: 10, metro: 10, auto: 30, cab: 50, walking: 0
};

// susCoin rate: coins per kg CO2 saved vs cab baseline
const COINS_PER_KG_CO2 = 10;
const CAB_CO2 = CO2_G_PER_KM.cab;

// ── Haversine distance ───────────────────────────────────────────────────────

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Edge / node cost calculation ─────────────────────────────────────────────

function edgeCost(mode, distKm) {
  const cost = BASE_FARE[mode] + (COST_PER_KM[mode] * distKm);
  const timeMin = (distKm / SPEED_KMH[mode]) * 60;
  const co2SavedKg = Math.max(((CAB_CO2 - CO2_G_PER_KM[mode]) * distKm) / 1000, 0);
  const coins = Math.round(co2SavedKg * COINS_PER_KG_CO2);
  return { cost: Math.round(cost), timeMin: Math.round(timeMin), co2SavedKg, coins, distKm };
}

// ── Graph class ──────────────────────────────────────────────────────────────

class TransitGraph {
  constructor() {
    this.nodes = new Map();   // nodeId → { id, name, lat, lng, type }
    this.edges = new Map();   // nodeId → [ { to, mode, routeId, ...cost } ]
    this._built = false;
  }

  addNode(id, data) {
    this.nodes.set(id, { id, ...data });
    if (!this.edges.has(id)) this.edges.set(id, []);
  }

  addEdge(from, to, mode, routeId, distKm) {
    const cost = edgeCost(mode, distKm);
    const edge = { to, mode, routeId, ...cost };
    this.edges.get(from)?.push(edge);
    // Bidirectional for walking and rail
    if (mode === 'walking' || mode === 'rail') {
      this.edges.get(to)?.push({ ...edge, to: from });
    }
  }

  // ── Load data from files ───────────────────────────────────────────────

  build() {
    if (this._built) return;
    console.log('🔨 Building transit graph...');

    this._loadRailStations();
    this._loadBusStops();
    this._loadBusRoutes();
    this._buildWalkingTransfers();

    this._built = true;
    console.log(`✅ Graph built: ${this.nodes.size} nodes, ${this._edgeCount()} edges`);
  }

  _edgeCount() {
    let n = 0;
    for (const edges of this.edges.values()) n += edges.length;
    return n;
  }

  _loadRailStations() {
    const file = path.join(__dirname, '..', 'data', 'rail-stations.json');
    if (!fs.existsSync(file)) return;
    const stations = JSON.parse(fs.readFileSync(file, 'utf8'));

    // Add nodes
    stations.forEach(s => {
      this.addNode('rail_' + s.id, {
        name: s.name, lat: s.lat, lng: s.lng,
        type: 'rail', lines: s.lines, zone: s.zone,
        interchange: s.interchange || []
      });
    });

    // Add rail edges along each line (ordered by distanceFromNDLS)
    const lines = {};
    stations.forEach(s => {
      s.lines.forEach(line => {
        if (!lines[line]) lines[line] = [];
        lines[line].push(s);
      });
    });

    Object.entries(lines).forEach(([line, stops]) => {
      // Sort by distanceFromNDLS for linear lines, or by position for ring
      const sorted = line === 'ring'
        ? stops  // keep original order for ring
        : stops.sort((a, b) => a.distanceFromNDLS - b.distanceFromNDLS);

      for (let i = 0; i < sorted.length - 1; i++) {
        const a = sorted[i], b = sorted[i + 1];
        const dist = haversineKm(a.lat, a.lng, b.lat, b.lng);
        this.addEdge('rail_' + a.id, 'rail_' + b.id, 'rail', line, dist);
      }

      // Close the ring
      if (line === 'ring' && sorted.length > 2) {
        const first = sorted[0], last = sorted[sorted.length - 1];
        const dist = haversineKm(first.lat, first.lng, last.lat, last.lng);
        this.addEdge('rail_' + first.id, 'rail_' + last.id, 'rail', 'ring', dist);
      }
    });

    console.log(`  🚂 ${stations.length} rail stations loaded`);
  }

  _loadBusStops() {
    const file = path.join(__dirname, '..', 'data', 'stops.json');
    if (!fs.existsSync(file)) {
      console.log('  🚌 No bus stops GTFS file found — run: node scripts/load-gtfs.js');
      return;
    }
    const stops = JSON.parse(fs.readFileSync(file, 'utf8'));
    let count = 0;
    stops.forEach(s => {
      if (s.lat && s.lng) {
        this.addNode('bus_' + s.id, {
          name: s.name, lat: s.lat, lng: s.lng, type: 'bus'
        });
        count++;
      }
    });
    console.log(`  🚌 ${count} bus stops loaded`);
  }

  _loadBusRoutes() {
    const routeStopsFile = path.join(__dirname, '..', 'data', 'route-stops.json');
    const stopsFile = path.join(__dirname, '..', 'data', 'stops.json');
    if (!fs.existsSync(routeStopsFile) || !fs.existsSync(stopsFile)) return;

    const routeStops = JSON.parse(fs.readFileSync(routeStopsFile, 'utf8'));
    const stopsArr = JSON.parse(fs.readFileSync(stopsFile, 'utf8'));
    const stopsMap = new Map(stopsArr.map(s => [s.id, s]));

    let edgeCount = 0;
    Object.entries(routeStops).forEach(([routeId, stopIds]) => {
      // For each consecutive pair of stops on a route, add a bus edge
      for (let i = 0; i < stopIds.length - 1; i++) {
        const a = stopsMap.get(stopIds[i]);
        const b = stopsMap.get(stopIds[i + 1]);
        if (!a || !b || !a.lat || !b.lat) continue;
        const dist = haversineKm(a.lat, a.lng, b.lat, b.lng);
        if (dist > 50) continue; // skip obviously wrong edges
        this.addEdge('bus_' + a.id, 'bus_' + b.id, 'bus', routeId, dist);
        edgeCount++;
      }
    });
    console.log(`  🚌 ${edgeCount} bus route edges added`);
  }

  _buildWalkingTransfers() {
    // Connect nearby nodes with walking edges (bus↔bus, bus↔rail, rail↔rail)
    const allNodes = Array.from(this.nodes.values());
    let walkEdges = 0;

    for (let i = 0; i < allNodes.length; i++) {
      for (let j = i + 1; j < allNodes.length; j++) {
        const a = allNodes[i], b = allNodes[j];
        const distKm = haversineKm(a.lat, a.lng, b.lat, b.lng);
        const distM = distKm * 1000;

        if (distM <= MAX_WALK_TRANSFER_M) {
          this.addEdge(a.id, b.id, 'walking', 'walk', distKm);
          walkEdges++;
        }
      }
    }
    console.log(`  🚶 ${walkEdges} walking transfer edges added`);
  }

  // ── Find nearest node to a lat/lng ────────────────────────────────────

  nearestNode(lat, lng, type = null, limit = 3) {
    let candidates = Array.from(this.nodes.values());
    if (type) candidates = candidates.filter(n => n.type === type);

    return candidates
      .map(n => ({ ...n, dist: haversineKm(lat, lng, n.lat, n.lng) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, limit);
  }

  // ── Dijkstra ──────────────────────────────────────────────────────────
  // objective: 'cost' | 'time' | 'balanced'

  dijkstra(startId, endId, objective = 'balanced') {
    if (!this._built) this.build();

    const dist = new Map();
    const prev = new Map();
    const visited = new Set();
    const queue = new MinHeap();

    const score = (cost, timeMin) => {
      if (objective === 'cost') return cost;
      if (objective === 'time') return timeMin;
      // balanced: normalise cost (÷10) + time
      return (cost / 10) + timeMin;
    };

    dist.set(startId, 0);
    queue.push({ id: startId, cost: 0, timeMin: 0, score: 0 });

    while (!queue.isEmpty()) {
      const curr = queue.pop();
      if (visited.has(curr.id)) continue;
      visited.add(curr.id);
      if (curr.id === endId) break;

      const edges = this.edges.get(curr.id) || [];
      for (const edge of edges) {
        if (visited.has(edge.to)) continue;

        // Transfer penalty if switching modes
        const prevEdge = prev.get(curr.id);
        const transferPenalty = (prevEdge && prevEdge.mode !== edge.mode && edge.mode !== 'walking')
          ? TRANSFER_PENALTY_MIN : 0;

        const newCost = (dist.get(curr.id) || 0) + edge.cost;
        const newTime = (prev.get(curr.id)?.cumTime || 0) + edge.timeMin + transferPenalty;
        const newScore = score(newCost, newTime);

        if (newScore < (dist.get(edge.to) ?? Infinity)) {
          dist.set(edge.to, newScore);
          prev.set(edge.to, { ...edge, from: curr.id, cumCost: newCost, cumTime: newTime, score: newScore });
          queue.push({ id: edge.to, cost: newCost, timeMin: newTime, score: newScore });
        }
      }
    }

    if (!prev.has(endId) && startId !== endId) return null;

    // Reconstruct path
    const path = [];
    let cur = endId;
    while (prev.has(cur)) {
      const edge = prev.get(cur);
      path.unshift(edge);
      cur = edge.from;
    }

    // Aggregate stats
    const totalCost = path.reduce((s, e) => s + e.cost, 0);
    const totalTime = path.reduce((s, e) => s + e.timeMin, 0);
    const totalCO2Saved = parseFloat(path.reduce((s, e) => s + (e.co2SavedKg || 0), 0).toFixed(2));
    const totalCoins = path.reduce((s, e) => s + (e.coins || 0), 0);
    const totalDist = parseFloat(path.reduce((s, e) => s + (e.distKm || 0), 0).toFixed(1));
    const savingsVsCab = Math.max(Math.round(totalDist * COST_PER_KM.cab + BASE_FARE.cab - totalCost), 0);

    // Group consecutive legs of same mode
    const legs = groupLegs(path, this.nodes);

    return {
      objective,
      legs,
      totalCost,
      totalDuration: totalTime,
      totalCO2Saved,
      totalCoins,
      totalDistance: totalDist,
      totalSavings: savingsVsCab
    };
  }
}

// ── Group consecutive same-mode edges into legs ──────────────────────────────

function groupLegs(path, nodes) {
  if (!path.length) return [];
  const legs = [];
  let current = null;

  path.forEach(edge => {
    const fromNode = nodes.get(edge.from);
    const toNode = nodes.get(edge.to);
    if (!current || current.mode !== edge.mode || current.routeId !== edge.routeId) {
      if (current) legs.push(current);
      current = {
        mode: edge.mode,
        routeId: edge.routeId,
        fromName: fromNode?.name || edge.from,
        toName: toNode?.name || edge.to,
        distKm: edge.distKm,
        timeMin: edge.timeMin,
        cost: edge.cost,
        co2SavedKg: edge.co2SavedKg || 0,
        coins: edge.coins || 0
      };
    } else {
      current.toName = toNode?.name || edge.to;
      current.distKm += edge.distKm;
      current.timeMin += edge.timeMin;
      current.cost += edge.cost;
      current.co2SavedKg += edge.co2SavedKg || 0;
      current.coins += edge.coins || 0;
    }
  });
  if (current) legs.push(current);

  return legs.map(l => ({
    ...l,
    distKm: parseFloat(l.distKm.toFixed(1)),
    co2SavedKg: parseFloat(l.co2SavedKg.toFixed(2)),
    label: legLabel(l)
  }));
}

function legLabel(leg) {
  const icons = { bus: '🚌', rail: '🚂', metro: '🚇', auto: '🛺', cab: '🚖', walking: '🚶' };
  const icon = icons[leg.mode] || '🚌';
  const via = leg.routeId && leg.routeId !== 'walk' ? ` (${leg.routeId})` : '';
  return `${icon} ${leg.fromName} → ${leg.toName}${via}`;
}

// ── Min-heap for Dijkstra ────────────────────────────────────────────────────

class MinHeap {
  constructor() { this.heap = []; }
  push(item) {
    this.heap.push(item);
    this._bubbleUp(this.heap.length - 1);
  }
  pop() {
    const top = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length > 0) { this.heap[0] = last; this._sinkDown(0); }
    return top;
  }
  isEmpty() { return this.heap.length === 0; }
  _bubbleUp(i) {
    while (i > 0) {
      const p = Math.floor((i - 1) / 2);
      if (this.heap[p].score <= this.heap[i].score) break;
      [this.heap[p], this.heap[i]] = [this.heap[i], this.heap[p]];
      i = p;
    }
  }
  _sinkDown(i) {
    const n = this.heap.length;
    while (true) {
      let min = i, l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this.heap[l].score < this.heap[min].score) min = l;
      if (r < n && this.heap[r].score < this.heap[min].score) min = r;
      if (min === i) break;
      [this.heap[min], this.heap[i]] = [this.heap[i], this.heap[min]];
      i = min;
    }
  }
}

// ── Singleton export ─────────────────────────────────────────────────────────

const graph = new TransitGraph();

module.exports = { graph, TransitGraph, haversineKm, edgeCost };
