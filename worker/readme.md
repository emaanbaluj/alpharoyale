# Alpha Royale Worker

Cloudflare Workers for game tick processing and cron scheduling.

## Overview

This project consists of:
- **Main Worker** (`index.ts`): Fetches crypto price data from Finnhub API and orchestrates game tick processing
- **Game-Tick Worker** (`game-tick-worker.ts`): Processes individual game ticks (market orders, positions, balances, TP/SL orders)
- **CLI Tool** (`cli.ts`): Interactive command-line interface for managing games, orders, and positions

## Prerequisites

- Node.js (v18+)
- Docker (for local Supabase)
- Supabase CLI
- Finnhub API key (for real-time crypto prices)

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

3. Configure environment variables in `.dev.vars`:
```bash
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU
FINNHUB_API_KEY=your_finnhub_api_key_here
```

**Note**: 
- The worker and CLI both use the same database. Make sure they're configured to use the same `SUPABASE_URL`.
- For remote Supabase, update `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.dev.vars`.
- The CLI defaults to local Supabase if `SUPABASE_URL` is not set.

### Finnhub API Configuration

The worker fetches real-time cryptocurrency prices from Finnhub API. **Important**: Crypto symbols must use the `EXCHANGE:SYMBOL` format:

- **BTC**: Fetched as `BINANCE:BTCUSDT` (~$93,000+)
- **ETH**: Fetched as `BINANCE:ETHUSDT` (~$3,200+)

**Why?** Using plain `BTC` or `ETH` symbols returns stock ticker prices (incorrect). The worker automatically:
1. Fetches prices using `BINANCE:BTCUSDT` and `BINANCE:ETHUSDT`
2. Stores them in the database as normalized symbols (`BTC`, `ETH`)
3. Game logic uses the normalized symbols for consistency

Get your free Finnhub API key at: https://finnhub.io/

## Development

### Running Workers

Run both workers in development mode:
```bash
npm run dev
```

Or run individually:
```bash
npm run dev:main      # Main worker (cron handler)
npm run dev:game-tick # Game tick worker
```

The workers will run on:
- Main worker: `http://localhost:8787`
- Game-tick worker: Service-bound (no direct URL)

### Interactive CLI Tool

The CLI provides an interactive interface for managing games, orders, and positions:

```bash
npm run cli
```

**Main Menu Commands**:
- Select a game to enter game context
- `Tick` - Process a game tick (triggers the worker's scheduled handler)
- `Create new game` - Create a new game with players
- `Reset (delete all games)` - Delete all games and related data
- `Exit` - Quit the CLI

**Game Context Commands** (after selecting a game):
- `status` - Show game status summary
- `orders [status]` - List orders (pending, filled, rejected, cancelled)
- `positions [status]` - List positions (open, closed)
- `order` - Create a new order (interactive prompts)
- `tick` - Process a game tick (all active games)
- `back` - Return to main menu
- `help` - Show command help

**Note**: The `tick` command triggers the worker's scheduled handler via HTTP. Make sure the worker is running (`npm run dev`) before using it.

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
- Verify the full flow through actual workers

The workers should be running on:
- Main worker: `http://localhost:8787` (default Wrangler port)
- Game-tick worker: Service-bound (accessed via service binding)

You can customize the main worker URL with environment variables:
```bash
MAIN_WORKER_URL=http://localhost:8787 npm run test:worker-e2e
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

## How It Works

### Game Tick Flow

1. **Scheduled Handler** (cron or manual trigger):
   - Fetches real-time crypto prices from Finnhub API (BTC, ETH)
   - Stores price data in database with new game state tick
   - Increments global game state counter
   - Dispatches game processing requests to game-tick worker (async)

2. **Game-Tick Worker** (service-bound):
   - Processes market orders (buy/sell)
   - Updates positions with current prices and unrealized P&L
   - Updates player balances and equity
   - Processes conditional orders (take profit, stop loss)
   - Records equity history

3. **Database**:
   - Stores price data with game state tick number
   - Tracks game state globally across all games
   - Stores orders, positions, and player balances per game

### Price Data

- Fetched from Finnhub API using Binance symbols
- Stored with normalized symbols (BTC, ETH) for game logic
- Linked to game state ticks for historical tracking
- Used by game-tick worker for order execution and position updates

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
│   ├── index.ts              # Main worker (cron handler, price fetching)
│   ├── game-tick-worker.ts   # Game tick processing worker
│   ├── game.ts               # Game logic (orders, positions, balances)
│   ├── db.ts                 # Database helpers
│   ├── finnhub.ts            # Finnhub API integration
│   ├── cli.ts                # Interactive CLI tool
│   ├── game.test.ts          # Unit tests
│   ├── test-setup.ts         # Integration tests
│   ├── e2e-test.ts           # End-to-end tests (simulated)
│   └── worker-e2e-test.ts    # End-to-end tests (real workers)
├── wrangler.toml             # Main worker config
├── wrangler-game-tick.toml   # Game tick worker config
├── .dev.vars                 # Environment variables (gitignored)
└── package.json
```
