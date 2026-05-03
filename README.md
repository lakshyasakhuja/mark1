# Mark 1 🗺️

> **Status: Active Development — Prototype Phase**

**Mark 1** is a multi-modal commute optimizer for daily commuters in Delhi NCR — think of it as the smartest way to get from A to B, combining metro, auto, bus, and cab into a single optimized journey. Built on top of **susCoin**, it rewards you with coins every time you choose an eco-friendly route over a solo cab.

---

## What is Mark 1?

Most commuters juggle 5+ apps — Google Maps to plan, Uber to book, a metro app to check timings, and still end up overpaying or stuck in traffic. Mark 1 brings it all into one place:

- **Plan** — Enter your origin and destination. Get 3 route options: Cheapest, Fastest, and Balanced.
- **Earn** — Every time you choose metro or bus over a cab, you earn **susCoins** based on the CO₂ you saved.
- **Track** — Your dashboard shows total money saved, CO₂ avoided, trips completed, and your susCoin wallet.
- **Compete** — A city leaderboard ranks Delhi NCR commuters by their green impact.

The core insight: no existing app combines routing + cost optimization + real-time execution + sustainability rewards. Mark 1 does all four.

---

## The susCoin Integration

susCoin is a rewards layer for sustainable living — originally built to incentivize low-carbon actions like taking public transport, reducing electricity use, and installing solar. Mark 1 plugs susCoin directly into the commute layer:

- Choosing metro over cab → earn susCoins
- Coins are calculated based on **kg of CO₂ saved** vs a solo cab baseline
- 10 susCoins per kg CO₂ saved
- Coins unlock real-world rewards: coffee, metro passes, shopping vouchers, and more

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express |
| Database | lowdb (JSON, file-based) |
| Auth | bcryptjs + express-session |
| Frontend | EJS templates + vanilla CSS |
| Scoring | Custom CO₂ engine (adapted from susCoin) |

---

## Getting Started

```bash
# 1. Clone the repo
git clone https://github.com/your-username/mark1.git
cd mark1

# 2. Install dependencies
npm install

# 3. Start the server
node server.js

# 4. Open in browser
# http://localhost:3000
```

No environment variables or external services required. The database is a local JSON file that gets created automatically on first run.

---

## Project Structure

```
mark1/
├── server.js              # Express entry point
├── db.js                  # Database helpers (lowdb)
├── scoring.js             # CO₂ + susCoin scoring engine
├── routes/
│   ├── auth.js            # Register / login / logout
│   ├── dashboard.js       # User dashboard + leaderboard
│   └── planner.js         # Route planning + trip booking
├── views/
│   ├── layout.ejs         # Shared navbar + footer
│   ├── home.ejs           # Landing page
│   ├── login.ejs
│   ├── register.ejs
│   ├── planner.ejs        # Core route planner UI
│   ├── dashboard.ejs      # User stats + wallet
│   └── leaderboard.ejs    # City rankings
├── public/
│   └── css/style.css      # Full design system
└── data/
    └── db.json            # Auto-created on first run
```

---

## Current Coverage (Prototype)

The prototype currently supports routes across these Delhi NCR locations:

- Ghaziabad
- Connaught Place (CP / Rajiv Chowk)
- Noida Sector 18
- IGI Airport (T3)

More locations, real-time traffic integration, and API partnerships (Delhi Metro, Ola, DTC) are on the roadmap.

---

## Roadmap

- [x] Core route planning engine
- [x] susCoin rewards integration
- [x] User auth + session management
- [x] Personal dashboard + wallet
- [x] City leaderboard
- [ ] More Delhi NCR locations
- [ ] Delhi Metro API integration
- [ ] Real-time traffic + rerouting
- [ ] Mobile app (React Native)
- [ ] Ola/Uber API for live cab pricing
- [ ] susCoin redemption marketplace
- [ ] Corporate commute programs (B2B)
- [ ] Expand to Bangalore, Mumbai, Hyderabad

---

## Founders

**Shlok Gautam** — Co-founder
**Lakshya Sakhuja** — Co-founder  

---

## Contributing

This project is in active prototype development. If you'd like to contribute, open an issue or reach out to the founders directly.

---

## License

MIT

---

*Mark 1 × susCoin — Smarter commutes, greener cities. 🌿*
