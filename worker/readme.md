# Alpha Royale Worker

Cloudflare Workers for game tick processing and cron scheduling.

## Prerequisites

- Node.js (v18+)
- Docker (for local Supabase)
- Supabase CLI

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start local Supabase database:
```bash
# From the alpha-royale directory (where Supabase is configured)
cd ../alpha-royale
npx supabase start
```

The local Supabase will run on `http://localhost:54321` by default.

3. Configure environment variables (optional):
   - `SUPABASE_URL` - Defaults to `http://localhost:54321`
   - `SUPABASE_SERVICE_ROLE_KEY` - Defaults to local Supabase demo key

## Development

Run both workers in development mode:
```bash
npm run dev
```

Or run individually:
```bash
npm run dev:main      # Main worker (cron handler)
npm run dev:game-tick # Game tick worker
```

## Testing

### Unit Tests

Run unit tests (mocked dependencies):
```bash
npm run test:unit
```

Watch mode:
```bash
npm run test:unit:watch
```

### Integration Tests

**⚠️ Requires local Supabase database to be running**

Integration tests use a real database connection. Make sure you've started your local Supabase:

```bash
cd ../alpha-royale && npx supabase start
```

Then run tests:
```bash
# Setup test data
npm run test:setup

# Run a single game tick
npm run test:integration tick

# Run a specific scenario
npm run test:integration scenario marketBuy

# Show current test state
npm run test:integration state

# Clean up test data
npm run test:clean
```

### End-to-End Tests

**⚠️ Requires local Supabase database to be running**

#### Simulated E2E Tests

E2E tests simulate the full cron job flow (no workers needed):
```bash
npm run test:e2e
```

#### Real Worker E2E Tests

**⚠️ Requires both local Supabase AND running workers**

Tests that hit the actual running Cloudflare Workers via HTTP:

1. Start the workers in one terminal:
```bash
npm run dev
```

2. In another terminal, run the worker E2E tests:
```bash
npm run test:worker-e2e
```

This will:
- Test worker health endpoints
- Trigger the scheduled handler via HTTP
- Call the game-tick worker directly
- Verify the full flow through actual workers

The workers should be running on:
- Main worker: `http://localhost:8787` (default Wrangler port)
- Game-tick worker: `http://localhost:8788` (check Wrangler output)

You can customize URLs with environment variables:
```bash
MAIN_WORKER_URL=http://localhost:8787 GAME_TICK_WORKER_URL=http://localhost:8788 npm run test:worker-e2e
```

### Run All Tests

```bash
npm run test:all
```

## Deployment

Deploy both workers:
```bash
npm run deploy:all
```

Or individually:
```bash
npm run deploy:main      # Main worker
npm run deploy:game-tick # Game tick worker
```

## Test Scenarios

Available integration test scenarios:

- `marketBuy` - Test market buy order creates position
- `marketSell` - Test market sell order rejected (no position)
- `takeProfit` - Test take profit order triggers
- `stopLoss` - Test stop loss order triggers
- `positionPnl` - Test position P&L calculation
- `equityHistory` - Test equity history tracking

## Project Structure

```
worker/
├── src/
│   ├── index.ts              # Main worker (cron handler)
│   ├── game-tick-worker.ts   # Game tick processing worker
│   ├── game.ts               # Game logic
│   ├── db.ts                 # Database helpers
│   ├── finnhub.ts            # Finnhub API integration
│   ├── game.test.ts          # Unit tests
│   ├── test-setup.ts         # Integration tests
│   └── e2e-test.ts           # End-to-end tests
├── wrangler.toml             # Main worker config
├── wrangler-game-tick.toml   # Game tick worker config
└── package.json
```
