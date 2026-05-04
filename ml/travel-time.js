/**
 * ml/travel-time.js
 * 
 * Travel time prediction model for Mark 1.
 * 
 * Approach: Gradient-boosted decision tree (implemented in pure JS, no native deps).
 * Features: mode, distKm, hourOfDay, dayOfWeek, isRushHour, isWeekend
 * Target: actual travel time multiplier vs free-flow (1.0 = no delay, 2.0 = double time)
 * 
 * Phase 1: trained on synthetic data with realistic Delhi traffic patterns
 * Phase 2: retrain on real OTD GPS data once collected
 */

'use strict';

const fs = require('fs');
const path = require('path');

const MODEL_FILE = path.join(__dirname, '..', 'data', 'travel-time-model.json');

// ── Feature Engineering ──────────────────────────────────────────────────────

function extractFeatures(mode, distKm, date = new Date()) {
  const hour = date.getHours();
  const dow = date.getDay(); // 0=Sun, 6=Sat
  const isWeekend = dow === 0 || dow === 6 ? 1 : 0;
  const isMorningRush = (!isWeekend && hour >= 8 && hour <= 10) ? 1 : 0;
  const isEveningRush = (!isWeekend && hour >= 17 && hour <= 20) ? 1 : 0;
  const isRushHour = isMorningRush || isEveningRush;
  const isNight = (hour >= 22 || hour <= 5) ? 1 : 0;
  const isAfternoon = (hour >= 12 && hour <= 16) ? 1 : 0;

  // Mode encoding
  const modeEncoding = {
    bus: [1, 0, 0, 0, 0],
    rail: [0, 1, 0, 0, 0],
    metro: [0, 0, 1, 0, 0],
    auto: [0, 0, 0, 1, 0],
    cab: [0, 0, 0, 0, 1],
    walking: [0, 0, 0, 0, 0]
  };

  return [
    ...(modeEncoding[mode] || [0, 0, 0, 0, 0]),
    Math.min(distKm / 50, 1),   // normalized distance
    hour / 23,                   // normalized hour
    isWeekend,
    isMorningRush,
    isEveningRush,
    isNight,
    isAfternoon,
    isRushHour
  ];
}

// ── Synthetic Training Data Generator ───────────────────────────────────────
// Based on real Delhi traffic patterns from research

function generateTrainingData(n = 5000) {
  const data = [];
  const modes = ['bus', 'rail', 'metro', 'auto', 'cab'];

  // Delhi traffic delay multipliers by mode and time
  // Source: approximated from Delhi traffic studies and OTD reports
  const delayPatterns = {
    bus: {
      morningRush: 2.2,  // buses get badly stuck
      eveningRush: 2.4,
      afternoon: 1.4,
      night: 1.0,
      weekend: 1.2
    },
    rail: {
      morningRush: 1.1,  // trains have dedicated tracks mostly
      eveningRush: 1.15,
      afternoon: 1.05,
      night: 1.0,
      weekend: 1.0
    },
    metro: {
      morningRush: 1.05, // metro rarely delayed but crowded
      eveningRush: 1.05,
      afternoon: 1.0,
      night: 1.0,
      weekend: 1.0
    },
    auto: {
      morningRush: 1.8,
      eveningRush: 2.0,
      afternoon: 1.5,
      night: 1.0,
      weekend: 1.3
    },
    cab: {
      morningRush: 1.9,
      eveningRush: 2.1,
      afternoon: 1.5,
      night: 1.0,
      weekend: 1.3
    }
  };

  for (let i = 0; i < n; i++) {
    const mode = modes[Math.floor(Math.random() * modes.length)];
    const distKm = Math.random() * 40 + 0.5;
    const hour = Math.floor(Math.random() * 24);
    const dow = Math.floor(Math.random() * 7);
    const date = new Date(2024, 0, dow + 1, hour, 0, 0);

    const isWeekend = dow === 0 || dow === 6;
    const isMorningRush = !isWeekend && hour >= 8 && hour <= 10;
    const isEveningRush = !isWeekend && hour >= 17 && hour <= 20;
    const isNight = hour >= 22 || hour <= 5;

    const pattern = delayPatterns[mode] || delayPatterns.cab;
    let baseMultiplier = 1.0;
    if (isMorningRush) baseMultiplier = pattern.morningRush;
    else if (isEveningRush) baseMultiplier = pattern.eveningRush;
    else if (isNight) baseMultiplier = pattern.night;
    else if (isWeekend) baseMultiplier = pattern.weekend;
    else baseMultiplier = pattern.afternoon;

    // Add noise (±15%)
    const noise = 0.85 + Math.random() * 0.3;
    const multiplier = baseMultiplier * noise;

    const features = extractFeatures(mode, distKm, date);
    data.push({ features, target: multiplier, mode, distKm, hour, isWeekend });
  }

  return data;
}

// ── Simple Gradient Boosted Tree (pure JS) ───────────────────────────────────
// Implements a small ensemble of regression trees

class RegressionTree {
  constructor(maxDepth = 4, minSamples = 20) {
    this.maxDepth = maxDepth;
    this.minSamples = minSamples;
    this.root = null;
  }

  fit(X, y) {
    this.root = this._buildNode(X, y, 0);
  }

  predict(x) {
    return this._traverse(this.root, x);
  }

  _buildNode(X, y, depth) {
    const mean = y.reduce((s, v) => s + v, 0) / y.length;

    if (depth >= this.maxDepth || y.length < this.minSamples) {
      return { leaf: true, value: mean };
    }

    const { feature, threshold, leftIdx, rightIdx } = this._bestSplit(X, y);

    if (!leftIdx || leftIdx.length === 0 || rightIdx.length === 0) {
      return { leaf: true, value: mean };
    }

    return {
      leaf: false,
      feature,
      threshold,
      left: this._buildNode(leftIdx.map(i => X[i]), leftIdx.map(i => y[i]), depth + 1),
      right: this._buildNode(rightIdx.map(i => X[i]), rightIdx.map(i => y[i]), depth + 1)
    };
  }

  _bestSplit(X, y) {
    const nFeatures = X[0].length;
    let bestVar = Infinity, bestFeature = 0, bestThreshold = 0;
    let bestLeft = [], bestRight = [];

    const totalVar = this._variance(y);
    if (totalVar < 1e-6) return { feature: 0, threshold: 0, leftIdx: [], rightIdx: [] };

    // Sample features for speed
    const featureSample = this._sampleFeatures(nFeatures, Math.ceil(Math.sqrt(nFeatures)));

    for (const f of featureSample) {
      const values = [...new Set(X.map(x => x[f]))].sort((a, b) => a - b);
      const thresholds = values.slice(0, -1).map((v, i) => (v + values[i + 1]) / 2);

      for (const t of thresholds) {
        const leftIdx = [], rightIdx = [];
        X.forEach((x, i) => {
          if (x[f] <= t) leftIdx.push(i); else rightIdx.push(i);
        });
        if (leftIdx.length === 0 || rightIdx.length === 0) continue;

        const lv = this._variance(leftIdx.map(i => y[i]));
        const rv = this._variance(rightIdx.map(i => y[i]));
        const weightedVar = (leftIdx.length * lv + rightIdx.length * rv) / y.length;

        if (weightedVar < bestVar) {
          bestVar = weightedVar;
          bestFeature = f;
          bestThreshold = t;
          bestLeft = leftIdx;
          bestRight = rightIdx;
        }
      }
    }

    return { feature: bestFeature, threshold: bestThreshold, leftIdx: bestLeft, rightIdx: bestRight };
  }

  _variance(arr) {
    if (arr.length === 0) return 0;
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
    return arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
  }

  _sampleFeatures(n, k) {
    const idx = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    return idx.slice(0, k);
  }

  _traverse(node, x) {
    if (node.leaf) return node.value;
    return x[node.feature] <= node.threshold
      ? this._traverse(node.left, x)
      : this._traverse(node.right, x);
  }
}

class GradientBoostingRegressor {
  constructor({ nEstimators = 50, learningRate = 0.1, maxDepth = 4 } = {}) {
    this.nEstimators = nEstimators;
    this.learningRate = learningRate;
    this.maxDepth = maxDepth;
    this.trees = [];
    this.initialPrediction = 0;
  }

  fit(X, y) {
    this.initialPrediction = y.reduce((s, v) => s + v, 0) / y.length;
    let residuals = y.map(v => v - this.initialPrediction);

    for (let i = 0; i < this.nEstimators; i++) {
      const tree = new RegressionTree(this.maxDepth, 10);
      tree.fit(X, residuals);
      const preds = X.map(x => tree.predict(x));
      residuals = residuals.map((r, j) => r - this.learningRate * preds[j]);
      this.trees.push(tree);
    }
    return this;
  }

  predict(x) {
    return this.trees.reduce((pred, tree) => pred + this.learningRate * tree.predict(x), this.initialPrediction);
  }

  // Serialize to JSON
  toJSON() {
    return {
      initialPrediction: this.initialPrediction,
      learningRate: this.learningRate,
      trees: this.trees.map(t => t.root)
    };
  }

  fromJSON(data) {
    this.initialPrediction = data.initialPrediction;
    this.learningRate = data.learningRate;
    this.trees = data.trees.map(root => {
      const tree = new RegressionTree();
      tree.root = root;
      return tree;
    });
    return this;
  }
}

// ── Model Manager ────────────────────────────────────────────────────────────

let _model = null;

function trainModel() {
  console.log('🤖 Generating synthetic training data...');
  const trainData = generateTrainingData(3000);
  const X = trainData.map(d => d.features);
  const y = trainData.map(d => d.target);

  console.log('🤖 Training travel time model (GBT, 50 estimators)...');
  const model = new GradientBoostingRegressor({ nEstimators: 50, learningRate: 0.1, maxDepth: 4 });
  model.fit(X, y);

  // Save model
  const modelData = model.toJSON();
  fs.writeFileSync(MODEL_FILE, JSON.stringify(modelData));
  console.log('✅ Model trained and saved to data/travel-time-model.json');

  // Quick validation
  const testData = generateTrainingData(200);
  const mse = testData.reduce((s, d) => {
    const pred = model.predict(d.features);
    return s + (pred - d.target) ** 2;
  }, 0) / testData.length;
  console.log(`   RMSE: ${Math.sqrt(mse).toFixed(3)} (multiplier units)`);

  return model;
}

function loadModel() {
  if (_model) return _model;

  if (fs.existsSync(MODEL_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(MODEL_FILE, 'utf8'));
      const m = new GradientBoostingRegressor();
      m.fromJSON(data);
      _model = m;
      console.log('🤖 Travel time model loaded from disk');
      return _model;
    } catch (e) {
      console.warn('⚠️  Could not load model, retraining...', e.message);
    }
  }

  _model = trainModel();
  return _model;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Predict travel time multiplier for a given mode, distance and time.
 * Returns multiplier (e.g. 1.8 means 80% longer than free-flow due to traffic).
 */
function predictMultiplier(mode, distKm, date = new Date()) {
  try {
    const model = loadModel();
    const features = extractFeatures(mode, distKm, date);
    const raw = model.predict(features);
    return Math.max(1.0, Math.min(raw, 4.0)); // clamp to [1.0, 4.0]
  } catch (e) {
    return getHeuristicMultiplier(mode, date);
  }
}

/**
 * Adjust a base duration estimate with the ML-predicted traffic multiplier.
 */
function adjustDuration(baseMin, mode, distKm, date = new Date()) {
  const multiplier = predictMultiplier(mode, distKm, date);
  return Math.round(baseMin * multiplier);
}

/**
 * Fallback heuristic if model not available.
 */
function getHeuristicMultiplier(mode, date = new Date()) {
  const h = date.getHours();
  const dow = date.getDay();
  const isWeekend = dow === 0 || dow === 6;
  const isRush = !isWeekend && ((h >= 8 && h <= 10) || (h >= 17 && h <= 20));

  const rushMultipliers = { bus: 2.2, cab: 1.9, auto: 1.8, rail: 1.1, metro: 1.05, walking: 1.0 };
  const normalMultipliers = { bus: 1.4, cab: 1.4, auto: 1.4, rail: 1.0, metro: 1.0, walking: 1.0 };

  return isRush ? (rushMultipliers[mode] || 1.5) : (normalMultipliers[mode] || 1.2);
}

/**
 * Get a human-readable traffic description for the current time.
 */
function getTrafficStatus(date = new Date()) {
  const h = date.getHours();
  const dow = date.getDay();
  const isWeekend = dow === 0 || dow === 6;

  if (isWeekend) return { label: 'Light traffic', color: 'green', multiplier: 1.2 };
  if (h >= 8 && h <= 10) return { label: 'Heavy morning rush', color: 'red', multiplier: 2.0 };
  if (h >= 17 && h <= 20) return { label: 'Heavy evening rush', color: 'red', multiplier: 2.1 };
  if (h >= 11 && h <= 16) return { label: 'Moderate traffic', color: 'yellow', multiplier: 1.4 };
  if (h >= 22 || h <= 5) return { label: 'Night — clear roads', color: 'green', multiplier: 1.0 };
  return { label: 'Normal traffic', color: 'yellow', multiplier: 1.3 };
}

module.exports = {
  predictMultiplier,
  adjustDuration,
  getTrafficStatus,
  getHeuristicMultiplier,
  trainModel,
  loadModel,
  extractFeatures
};
