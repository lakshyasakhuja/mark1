/**
 * load-gtfs.js
 * 
 * Run this ONCE after dropping GTFS files into data/gtfs/:
 *   node scripts/load-gtfs.js
 * 
 * What it does:
 *   - Reads stops.txt  → loads all bus stops (name, lat, lng) into data/stops.json
 *   - Reads routes.txt → loads all bus routes into data/routes.json
 *   - Reads stop_times.txt + trips.txt → maps which stops belong to which route
 * 
 * Required files in data/gtfs/:
 *   stops.txt, routes.txt, trips.txt, stop_times.txt
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const GTFS_DIR = path.join(__dirname, '..', 'data', 'gtfs');
const OUT_DIR = path.join(__dirname, '..', 'data');

// Parse a CSV line respecting quoted fields
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else { current += ch; }
  }
  result.push(current.trim());
  return result;
}

// Read a GTFS txt file into array of objects
async function readGTFS(filename) {
  const filepath = path.join(GTFS_DIR, filename);
  if (!fs.existsSync(filepath)) {
    console.error(`❌  Missing: data/gtfs/${filename}`);
    return null;
  }

  const rows = [];
  const rl = readline.createInterface({ input: fs.createReadStream(filepath), crlfDelay: Infinity });
  let headers = null;

  for await (const line of rl) {
    if (!line.trim()) continue;
    const cols = parseCSVLine(line);
    if (!headers) {
      // Strip BOM if present
      cols[0] = cols[0].replace(/^\uFEFF/, '');
      headers = cols;
    } else {
      const row = {};
      headers.forEach((h, i) => { row[h] = cols[i] || ''; });
      rows.push(row);
    }
  }

  return rows;
}

async function main() {
  console.log('\n🚌  Mark 1 GTFS Loader\n');

  // Check gtfs dir
  if (!fs.existsSync(GTFS_DIR)) {
    console.error('❌  data/gtfs/ folder not found.');
    console.error('   Create it and place your GTFS files inside.\n');
    process.exit(1);
  }

  // ── 1. Load stops.txt ──────────────────────────────────────────────────
  console.log('📍 Loading stops.txt...');
  const stopsRaw = await readGTFS('stops.txt');
  if (!stopsRaw) process.exit(1);

  const stops = stopsRaw.map(s => ({
    id: s.stop_id,
    name: s.stop_name,
    lat: parseFloat(s.stop_lat),
    lng: parseFloat(s.stop_lon),
    code: s.stop_code || '',
    desc: s.stop_desc || ''
  })).filter(s => s.lat && s.lng && s.name);

  fs.writeFileSync(path.join(OUT_DIR, 'stops.json'), JSON.stringify(stops, null, 2));
  console.log(`   ✅  ${stops.length} stops loaded → data/stops.json`);

  // ── 2. Load routes.txt ─────────────────────────────────────────────────
  console.log('🗺️  Loading routes.txt...');
  const routesRaw = await readGTFS('routes.txt');
  if (!routesRaw) process.exit(1);

  const routes = routesRaw.map(r => ({
    id: r.route_id,
    shortName: r.route_short_name,
    longName: r.route_long_name,
    type: r.route_type,
    agency: r.agency_id || ''
  }));

  fs.writeFileSync(path.join(OUT_DIR, 'bus-routes.json'), JSON.stringify(routes, null, 2));
  console.log(`   ✅  ${routes.length} routes loaded → data/bus-routes.json`);

  // ── 3. Load trips + stop_times to map route → stops ───────────────────
  console.log('⏱️  Loading trips.txt + stop_times.txt (this may take a moment)...');
  const tripsRaw = await readGTFS('trips.txt');
  const stopTimesRaw = await readGTFS('stop_times.txt');

  if (tripsRaw && stopTimesRaw) {
    // Map trip_id → route_id
    const tripToRoute = {};
    tripsRaw.forEach(t => { tripToRoute[t.trip_id] = t.route_id; });

    // Map route_id → Set of stop_ids (deduplicated)
    const routeStops = {};
    stopTimesRaw.forEach(st => {
      const routeId = tripToRoute[st.trip_id];
      if (!routeId) return;
      if (!routeStops[routeId]) routeStops[routeId] = new Set();
      routeStops[routeId].add(st.stop_id);
    });

    // Convert sets to arrays
    const routeStopsArr = {};
    Object.entries(routeStops).forEach(([rid, set]) => {
      routeStopsArr[rid] = Array.from(set);
    });

    fs.writeFileSync(path.join(OUT_DIR, 'route-stops.json'), JSON.stringify(routeStopsArr, null, 2));
    console.log(`   ✅  Route→stop mapping saved → data/route-stops.json`);
  }

  // ── 4. Summary ─────────────────────────────────────────────────────────
  console.log('\n✅  GTFS data loaded successfully!\n');
  console.log('   Next: restart the server with  node server.js');
  console.log('   Bus stops will now appear in the route planner autocomplete.\n');
}

main().catch(err => {
  console.error('❌  Error:', err.message);
  process.exit(1);
});
