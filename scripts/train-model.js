/**
 * scripts/train-model.js
 * Run this to train / retrain the travel time ML model:
 *   node scripts/train-model.js
 */
const { trainModel } = require('../ml/travel-time');
console.log('\n🚀 Mark 1 — Travel Time Model Training\n');
trainModel();
console.log('\nDone! Restart server to use the updated model.\n');
