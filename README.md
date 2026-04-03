# SwiftServe POS

An offline-first Point of Sale system built for Indian Quick Service Restaurants. Runs on cheap Android tablets, works without internet, handles real money with GST compliance, and scales from a single dosa shop to a 500-outlet chain.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite 7 |
| Backend | Node.js + Express 5 |
| Local Database | IndexedDB via Dexie.js (offline-first) |
| Cloud Database | PostgreSQL via Supabase |
| Authentication | Supabase Auth (Google OAuth + Email) + PIN-based staff login |
| Payments | UPI QR, Cash, Card (Razorpay), Split payments |
| Deployment | Docker (cloud + edge + postgres) |
| Testing | Vitest (298 unit tests) |
| Monorepo | npm workspaces (edge, cloud, shared) |

## Architecture

```
                    Internet
                       |
              +--------+--------+
              |   Supabase      |
              |  PostgreSQL     |
              |  + Auth + RLS   |
              +--------+--------+
                       |
              +--------+--------+
              |  Cloud Server   |
              |  Express API    |
              |  Sync Engine    |
              +--------+--------+
                       |
          +------+-----+-----+------+
          |      |           |      |
       Tablet  Tablet     Tablet  Tablet
       (POS)   (KDS)     (Kiosk) (Captain)
          |      |           |      |
       Dexie  Dexie      Dexie   Dexie
      IndexedDB          IndexedDB
```

Every tablet runs independently with a local IndexedDB database. Orders, payments, and invoices work 100% offline. When internet is available, a bidirectional delta sync runs every 30 seconds.

## Features

### Core POS
- Full order lifecycle: create, hold, modify, cancel, refund, reorder
- 4 payment methods: Cash (with change calculator), UPI (QR generation), Card (Razorpay), Split
- Order queue with real-time status tracking
- Order search by number
- Held orders management
- Order source tracking: Counter, Zomato, Swiggy, Kiosk, Captain

### Customer-Facing Kiosk Mode
- Self-service ordering on a dedicated tablet
- Bright green/white customer-friendly theme
- Image-rich menu with category browsing and search
- Phone number capture for receipts and loyalty
- UPI QR payment with 5-minute timer
- Cash-at-counter option with unpaid order tracking
- Order confirmation with live countdown and auto-reset
- Fully isolated from staff POS (role-locked)

### Kitchen Display System (KDS)
- Real-time order display with station filtering (Grill, Fryer, Assembly, Counter)
- Per-item status advancement (Pending > Preparing > Ready)
- Age-based color coding: green (<5 min), yellow (5-10 min), red (>10 min)
- Paid/Unpaid badges: green for paid, red for cash-pending
- "Cash Collected" button for kiosk cash orders
- Sound alert on new orders
- Order number in 48px font (readable from 6 feet)

### GST Compliance
- CGST/SGST split on every invoice (Section 15(3) CGST Act)
- Discount applied before tax (legally correct)
- HSN codes on all items (default: 9963 Restaurant Services)
- Gapless invoice numbering with atomic sequence
- Credit notes on refunds (never modifies original invoice)
- Financial year aware (April-March)
- All 37 Indian state codes supported
- GSTIN validation
- FSSAI license number on outlet

### Money Handling
- All currency stored as integer paise (no floating-point errors)
- Indian Rupee formatting with lakh/crore grouping
- Round-off to nearest rupee with tracking
- Pro-rata discount distribution across items
- Cash denomination quick-pick (10, 50, 100, 200, 500)

### Inventory Management
- Stock tracking with current/min/max levels
- Auto-deduction on order completion (recipe-based)
- Low stock alerts on order queue
- Stock adjustment (receive, sale deduct, wastage, manual)
- Wastage logging with reasons
- Supplier tracking
- Cost per unit in paise

### Customer Loyalty
- Earn 1 point per Rs 10 spent (auto-awarded after payment)
- Manual point adjustments with 500-point cap and audit trail
- Redeem points for discounts
- Transaction history (earn/redeem/adjust)
- Customer search by phone
- PII masking (phone shown as ****6789)

### Combo / Meal Deals
- Create combo deals with multiple menu items
- Set combo price with savings display
- Per-item quantity in combos
- Activate/deactivate combos
- Savings percentage calculation

### Staff & Roles
- 6 roles: Owner, Admin, Counter, Captain, Kitchen, Kiosk
- PIN-based authentication with bcrypt hashing
- Role-based screen access enforcement
- Owner PIN override for discounts >20%
- Granular permissions per role
- Force PIN change on first login
- Lockout after 5 failed attempts (persists across refresh)
- 5-minute inactivity timeout (30 min for kiosk)
- 12-hour absolute session limit
- Staff activity tracking (who's active, shift times)

### Table Management
- 20 pre-seeded tables across 3 sections (Main, Patio, Private)
- Visual table timeline/map with live status
- Status control: Available, Occupied, Reserved, Blocked
- Per-table order linking
- Today's per-table revenue tracking
- Auto-release table on payment completion
- Captain access to table management

### Reports & Analytics
- Sales Report: by category, item, hour, payment method (with CSV export)
- Shift Report: per-shift cash reconciliation
- Revenue Summary: revenue vs costs overview
- Daily Summary: end-of-day with top items, busiest hour, source breakdown, staff leaderboard
- Staff Performance: orders/hour, revenue per staff, efficiency metrics

### Customer Feedback
- Rating system (1-5 stars)
- Comment collection with 1000-char limit
- Duplicate feedback prevention per order
- Rating distribution chart
- Date-filtered feedback dashboard
- Feedback QR placeholder on receipts

### Offline & Sync
- 100% offline order-to-payment-to-invoice flow
- Bidirectional delta sync every 30 seconds
- 21 tables synced (orders, payments, invoices, staff, menu, customers, loyalty, combos, feedback, audit)
- Last-write-wins conflict resolution
- Protected columns prevent edge overwriting sensitive data
- Sync status indicator: Offline (red), Syncing (yellow), Synced (green)
- "No internet" banner on order queue when offline
- JSON backup download from settings

### Developer Experience
- 298 unit tests across 6 test suites (money, GST, discount, validators, promo, credit notes)
- React.lazy code splitting (38 chunks)
- Dockerfiles for cloud (Node.js Alpine) and edge (Nginx)
- docker-compose.yml for one-command deployment
- Structured JSON logging with request timing
- Enhanced health endpoint (DB status, memory, uptime)
- .env.example documenting all required variables
- Branded loading screens with animated spinner
- Toast notification system
- Global error boundary with recovery UI

### Security
- JWT authentication (server refuses to start without secret)
- Payment idempotency (duplicate Razorpay callbacks rejected)
- Atomic order numbers (no duplicates across concurrent devices)
- Supabase Row Level Security on all tables
- SQL injection prevention (parameterized queries + column whitelisting)
- SSRF protection on printer proxy (DNS resolution before IP validation)
- Timing-safe signature verification on webhooks
- Rate limiting: 10 login attempts/15 min, 200 API calls/min
- CORS restricted to configured origin
- Non-root Docker containers
- Audit logging on every sensitive operation (37 audit points)

## Quick Start

### Prerequisites
- Node.js 20+
- npm 9+

### Install & Run

```bash
# Install dependencies
npm install

# Run the POS frontend
npm run dev:edge

# Run the cloud API (requires .env configuration)
npm run dev:cloud

# Run tests
npm test
```

### Docker Deployment

```bash
# Start everything (postgres + cloud API + frontend)
docker compose up -d
```

### Environment Variables

Copy `.env.example` files and configure:

```bash
cp packages/cloud/.env.example packages/cloud/.env
cp packages/edge/.env.example packages/edge/.env
```

Required cloud variables:
- `JWT_SECRET` — Server refuses to start without this
- `SUPABASE_DB_URL` — PostgreSQL connection string
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key
- `CORS_ORIGIN` — Frontend URL for CORS
- `RAZORPAY_KEY_SECRET` — For card payment verification

## Project Structure

```
swiftserve/
  packages/
    edge/                    # React frontend (POS + Kiosk)
      src/
        screens/             # 48 screen components
          KioskWelcomeScreen.jsx
          KioskMenuScreen.jsx
          KioskPaymentScreen.jsx
          OrderQueueScreen.jsx
          KDSScreen.jsx
          ...
        contexts/            # React contexts
          OrderContext.jsx    # Order state, payments, GST
          AuthContext.jsx     # Staff auth, shifts, sessions
          SupabaseAuthContext.jsx
          ThemeContext.jsx
        components/          # Reusable UI
        db/                  # Dexie schema, seed, operations
        sync/                # Cloud sync engine
        utils/               # Sound, backup, printer
      Dockerfile
    cloud/                   # Express API server
      src/
        routes/              # auth, sync, orders, payments, etc.
        db/                  # PostgreSQL pool, migrations
        middleware/
      Dockerfile
    shared/                  # Shared utilities
      src/
        utils/               # money, GST, discount, validators
          __tests__/         # 298 unit tests
        constants/           # Roles, permissions, statuses
  docker-compose.yml
```

## Default Login

All staff use PIN: **1234**

| Staff | Role | Access |
|-------|------|--------|
| Owner (Arjun/Amit) | owner | Everything |
| Priya | counter | POS, orders, payments |
| Suresh | kitchen | KDS only |
| Deepak | captain | Orders, tables, no payments |
| Kiosk | kiosk | Self-service screens only (auto-login) |

## Testing

```bash
npm test
```

```
 Test Files  6 passed (6)
      Tests  298 passed (298)
   Duration  ~300ms
```

Tests cover:
- Money arithmetic (paise conversion, formatting, rounding)
- GST calculations (CGST/SGST split, inter/intra state, multi-rate)
- Discount engine (percentage, flat, pro-rata distribution, clamping)
- Input validators (phone, PIN, email, GSTIN, UPI VPA, FSSAI, sanitization)
- Promo code validation (date ranges, usage limits, min order)
- Credit note generation (refund amounts, existing refund checks)

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| F1 | New Order |
| F2 | Search Orders |
| Esc | Clear Search |

## License

Private — All rights reserved.
