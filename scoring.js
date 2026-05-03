// scoring.js — susCoin scoring engine adapted for Mark 1 (India, Delhi NCR)

// CO2 emission factors in gCO2e per passenger-km
const CO2_FACTORS = {
  'cab':        171,   // Solo cab/Ola/Uber
  'auto':        80,   // Auto-rickshaw (shared)
  'bus':         45,   // Delhi DTC bus
  'metro':       28,   // Delhi Metro
  'bike':         0,   // Cycling
  'walking':      0,
  'e-bike':       5,
};

const BASELINE = 'cab'; // everything compared against cab

// Typical cost per km in INR
const COST_PER_KM = {
  'cab':     14,
  'auto':     9,
  'bus':      1.5,
  'metro':    3,
  'bike':     0,
  'walking':  0,
  'e-bike':   1,
};

// Typical speed in km/h (for duration estimate)
const SPEED_KMH = {
  'cab':     30,
  'auto':    25,
  'bus':     20,
  'metro':   35,
  'bike':    15,
  'walking':  5,
  'e-bike':  20,
};

// susCoins per kg CO2 saved
const COINS_PER_KG_CO2 = 10;

// Compute score & coins for a single mode+distance
function scoreMode(mode, distanceKm) {
  const factor = CO2_FACTORS[mode] ?? CO2_FACTORS['cab'];
  const baseline_factor = CO2_FACTORS[BASELINE];

  const co2SavedKg = Math.max(((baseline_factor - factor) * distanceKm) / 1000, 0);
  const coins = Math.round(co2SavedKg * COINS_PER_KG_CO2);

  const costINR = Math.round((COST_PER_KM[mode] ?? COST_PER_KM['cab']) * distanceKm);
  const durationMin = Math.round((distanceKm / (SPEED_KMH[mode] ?? 30)) * 60);
  const savingsINR = Math.max(Math.round((COST_PER_KM['cab'] - (COST_PER_KM[mode] ?? COST_PER_KM['cab'])) * distanceKm), 0);

  return { mode, distanceKm, co2SavedKg: parseFloat(co2SavedKg.toFixed(2)), coins, costINR, durationMin, savingsINR };
}

// Delhi NCR route database — realistic multi-modal combos
// Each route is a sequence of legs
const DELHI_ROUTES = {
  // Format: 'ORIGIN_KEY': { 'DEST_KEY': [...legs] }
  'ghaziabad': {
    'igi_airport': [
      {
        name: 'Metro + Auto (Recommended)',
        type: 'balanced',
        legs: [
          { mode: 'metro', label: 'Ghaziabad → Rajiv Chowk (Metro)', distanceKm: 22 },
          { mode: 'auto', label: 'Rajiv Chowk → IGI T3 (Auto)', distanceKm: 15 }
        ]
      },
      {
        name: 'Full Metro',
        type: 'cheapest',
        legs: [
          { mode: 'metro', label: 'Ghaziabad → New Delhi (Metro)', distanceKm: 28 },
          { mode: 'metro', label: 'New Delhi → IGI T3 (Airport Line)', distanceKm: 20 }
        ]
      },
      {
        name: 'Direct Cab',
        type: 'fastest',
        legs: [
          { mode: 'cab', label: 'Ghaziabad → IGI T3 (Cab)', distanceKm: 45 }
        ]
      }
    ],
    'connaught_place': [
      {
        name: 'Metro Express',
        type: 'balanced',
        legs: [
          { mode: 'metro', label: 'Ghaziabad → Rajiv Chowk (Metro)', distanceKm: 22 }
        ]
      },
      {
        name: 'Metro + Walk',
        type: 'cheapest',
        legs: [
          { mode: 'metro', label: 'Ghaziabad → Rajiv Chowk (Metro)', distanceKm: 22 },
          { mode: 'walking', label: 'Rajiv Chowk → CP (Walk)', distanceKm: 0.5 }
        ]
      },
      {
        name: 'Direct Cab',
        type: 'fastest',
        legs: [
          { mode: 'cab', label: 'Ghaziabad → CP (Cab)', distanceKm: 25 }
        ]
      }
    ],
    'noida_sector_18': [
      {
        name: 'Metro + Auto',
        type: 'balanced',
        legs: [
          { mode: 'metro', label: 'Ghaziabad → Botanical Garden (Metro)', distanceKm: 10 },
          { mode: 'auto', label: 'Botanical Garden → Sector 18 (Auto)', distanceKm: 4 }
        ]
      },
      {
        name: 'Bus Route',
        type: 'cheapest',
        legs: [
          { mode: 'bus', label: 'Ghaziabad → Sector 18 (Bus)', distanceKm: 16 }
        ]
      },
      {
        name: 'Direct Cab',
        type: 'fastest',
        legs: [
          { mode: 'cab', label: 'Ghaziabad → Sector 18 (Cab)', distanceKm: 15 }
        ]
      }
    ]
  },
  'connaught_place': {
    'igi_airport': [
      {
        name: 'Metro Airport Express',
        type: 'balanced',
        legs: [
          { mode: 'metro', label: 'CP → New Delhi (Walk/Metro)', distanceKm: 2 },
          { mode: 'metro', label: 'New Delhi → IGI T3 (Airport Express)', distanceKm: 23 }
        ]
      },
      {
        name: 'Bus + Auto',
        type: 'cheapest',
        legs: [
          { mode: 'bus', label: 'CP → Dhaula Kuan (Bus)', distanceKm: 10 },
          { mode: 'auto', label: 'Dhaula Kuan → IGI T3 (Auto)', distanceKm: 8 }
        ]
      },
      {
        name: 'Direct Cab',
        type: 'fastest',
        legs: [
          { mode: 'cab', label: 'CP → IGI T3 (Cab)', distanceKm: 22 }
        ]
      }
    ],
    'noida_sector_18': [
      {
        name: 'Metro Blue Line',
        type: 'balanced',
        legs: [
          { mode: 'metro', label: 'Rajiv Chowk → Sector 18 (Metro)', distanceKm: 18 }
        ]
      },
      {
        name: 'Bus Route',
        type: 'cheapest',
        legs: [
          { mode: 'bus', label: 'CP → Sector 18 (Bus)', distanceKm: 20 }
        ]
      },
      {
        name: 'Direct Cab',
        type: 'fastest',
        legs: [
          { mode: 'cab', label: 'CP → Sector 18 (Cab)', distanceKm: 18 }
        ]
      }
    ]
  },
  'noida_sector_18': {
    'igi_airport': [
      {
        name: 'Metro + Airport Express',
        type: 'balanced',
        legs: [
          { mode: 'metro', label: 'Sector 18 → Rajiv Chowk (Metro)', distanceKm: 18 },
          { mode: 'metro', label: 'New Delhi → IGI T3 (Airport Express)', distanceKm: 23 }
        ]
      },
      {
        name: 'Bus Route',
        type: 'cheapest',
        legs: [
          { mode: 'bus', label: 'Sector 18 → IGI T3 (Bus)', distanceKm: 38 }
        ]
      },
      {
        name: 'Direct Cab',
        type: 'fastest',
        legs: [
          { mode: 'cab', label: 'Sector 18 → IGI T3 (Cab)', distanceKm: 36 }
        ]
      }
    ]
  }
};

// Normalise location names to keys
function normaliseLocation(input) {
  const s = input.toLowerCase().trim();
  if (s.includes('ghaziabad')) return 'ghaziabad';
  if (s.includes('igi') || s.includes('airport') || s.includes('t3') || s.includes('t2') || s.includes('t1')) return 'igi_airport';
  if (s.includes('connaught') || s.includes('cp') || s.includes('rajiv chowk')) return 'connaught_place';
  if (s.includes('noida') || s.includes('sector 18') || s.includes('sector18')) return 'noida_sector_18';
  return null;
}

// Compute full route options between two locations
function getRoutes(originRaw, destinationRaw) {
  const originKey = normaliseLocation(originRaw);
  const destKey = normaliseLocation(destinationRaw);

  if (!originKey || !destKey || originKey === destKey) return null;

  const routes = (DELHI_ROUTES[originKey] && DELHI_ROUTES[originKey][destKey])
    || (DELHI_ROUTES[destKey] && DELHI_ROUTES[destKey][originKey]);

  if (!routes) return null;

  return routes.map(route => {
    const legResults = route.legs.map(leg => scoreMode(leg.mode, leg.distanceKm));

    const totalCost = legResults.reduce((s, l) => s + l.costINR, 0);
    const totalDuration = legResults.reduce((s, l) => s + l.durationMin, 0) + (route.legs.length - 1) * 5; // transfer time
    const totalCO2Saved = parseFloat(legResults.reduce((s, l) => s + l.co2SavedKg, 0).toFixed(2));
    const totalCoins = legResults.reduce((s, l) => s + l.coins, 0);
    const totalSavings = legResults.reduce((s, l) => s + l.savingsINR, 0);
    const totalDistance = parseFloat(legResults.reduce((s, l) => s + l.distanceKm, 0).toFixed(1));

    return {
      name: route.name,
      type: route.type,
      legs: route.legs.map((leg, i) => ({
        ...leg,
        ...legResults[i]
      })),
      totalCost,
      totalDuration,
      totalCO2Saved,
      totalCoins,
      totalSavings,
      totalDistance
    };
  });
}

// Available locations for the UI
const LOCATIONS = [
  { key: 'ghaziabad', label: 'Ghaziabad' },
  { key: 'connaught_place', label: 'Connaught Place (CP)' },
  { key: 'noida_sector_18', label: 'Noida Sector 18' },
  { key: 'igi_airport', label: 'IGI Airport (T3)' }
];

const MODE_ICONS = {
  'cab': '🚖',
  'auto': '🛺',
  'bus': '🚌',
  'metro': '🚇',
  'bike': '🚲',
  'walking': '🚶',
  'e-bike': '⚡'
};

module.exports = { getRoutes, scoreMode, LOCATIONS, MODE_ICONS, CO2_FACTORS, normaliseLocation };
