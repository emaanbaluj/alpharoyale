# Alpha Royale Game State Plan

## Game Tick Flow

### 1. Cron Trigger
- Cloudflare Worker cron job triggers game tick (currently every minute)
- Handler: `scheduled()` method in `worker/src/index.ts`

### 2. Fetch & Store Price Data
- **First step**: Fetch current price data from Finnhub API for tracked symbols (e.g., BTC, ETH)
- Store price data in Supabase `price_data` table
- This ensures we have a single source of truth and historical data

### 3. Increment Game State
- Increment global `game_state` counter in database
- This represents the current tick number across all games

### 4. Process Active Games
- Fetch current price data from database (from step 2)
- Fetch list of all active games from `games` table
- For each active game:
  - Send game data to internal route `/internal/game-tick`
  - Internal route processes:
    - Fetch game's pending orders (market orders, TP/SL orders)
    - Execute game logic:
      - Check and execute market orders
      - Check and execute take profit orders
      - Check and execute stop loss orders
      - Update positions based on executed orders
      - Update player balances
      - Update open orders status
    - Save updated game state back to database

## Database Schema

### `price_data`
Stores historical price data fetched from Finnhub API.

```sql
CREATE TABLE price_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol VARCHAR(10) NOT NULL, -- e.g., 'BTC', 'ETH'
  price DECIMAL(20, 8) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  game_state INTEGER NOT NULL, -- Links to the game_state when this price was recorded
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_price_data_symbol_timestamp ON price_data(symbol, timestamp DESC);
CREATE INDEX idx_price_data_game_state ON price_data(game_state);
```

### `game_state`
Global game state counter that increments with each tick.

```sql
CREATE TABLE game_state (
  id SERIAL PRIMARY KEY,
  current_tick INTEGER NOT NULL DEFAULT 0,
  last_tick_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Single row table, initialize with:
INSERT INTO game_state (current_tick) VALUES (0);
```

### `games`
Active and completed game sessions.

```sql
CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player1_id UUID NOT NULL REFERENCES auth.users(id),
  player2_id UUID REFERENCES auth.users(id), -- NULL if waiting for opponent
  status VARCHAR(20) NOT NULL DEFAULT 'waiting', -- 'waiting', 'active', 'completed'
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  winner_id UUID REFERENCES auth.users(id),
  initial_balance DECIMAL(20, 2) NOT NULL DEFAULT 10000.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_games_status ON games(status);
CREATE INDEX idx_games_player1 ON games(player1_id);
CREATE INDEX idx_games_player2 ON games(player2_id);
```

### `game_players`
Player state within each game (balances, positions, etc.).

```sql
CREATE TABLE game_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  balance DECIMAL(20, 2) NOT NULL DEFAULT 10000.00,
  equity DECIMAL(20, 2) NOT NULL DEFAULT 10000.00, -- balance + unrealized P&L
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(game_id, user_id)
);

CREATE INDEX idx_game_players_game_id ON game_players(game_id);
CREATE INDEX idx_game_players_user_id ON game_players(user_id);
```

### `positions`
Open trading positions for players.

```sql
CREATE TABLE positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES auth.users(id),
  symbol VARCHAR(10) NOT NULL,
  side VARCHAR(4) NOT NULL, -- 'BUY' or 'SELL'
  quantity DECIMAL(20, 8) NOT NULL,
  entry_price DECIMAL(20, 8) NOT NULL,
  current_price DECIMAL(20, 8),
  leverage INTEGER DEFAULT 1,
  unrealized_pnl DECIMAL(20, 2) DEFAULT 0,
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'open', -- 'open', 'closed'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_positions_game_player ON positions(game_id, player_id);
CREATE INDEX idx_positions_status ON positions(status);
```

### `orders`
Pending and executed orders (market, limit, TP, SL).

```sql
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES auth.users(id),
  symbol VARCHAR(10) NOT NULL,
  order_type VARCHAR(20) NOT NULL, -- 'MARKET', 'LIMIT', 'TAKE_PROFIT', 'STOP_LOSS'
  side VARCHAR(4) NOT NULL, -- 'BUY' or 'SELL'
  quantity DECIMAL(20, 8) NOT NULL,
  price DECIMAL(20, 8), -- NULL for market orders
  trigger_price DECIMAL(20, 8), -- For TP/SL orders
  position_id UUID REFERENCES positions(id), -- Links TP/SL to a position
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'filled', 'cancelled', 'rejected'
  filled_price DECIMAL(20, 8),
  filled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_game_player ON orders(game_id, player_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_position ON orders(position_id);
```

### `order_executions`
Historical record of order executions (for audit trail).

```sql
CREATE TABLE order_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  game_id UUID NOT NULL REFERENCES games(id),
  player_id UUID NOT NULL REFERENCES auth.users(id),
  symbol VARCHAR(10) NOT NULL,
  side VARCHAR(4) NOT NULL,
  quantity DECIMAL(20, 8) NOT NULL,
  execution_price DECIMAL(20, 8) NOT NULL,
  game_state INTEGER NOT NULL, -- Tick when order was executed
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_order_executions_game_state ON order_executions(game_state);
CREATE INDEX idx_order_executions_player ON order_executions(player_id);
```

### `equity_history`
Historical equity curves for each player in each game (for charts).

```sql
CREATE TABLE equity_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES auth.users(id),
  game_state INTEGER NOT NULL,
  balance DECIMAL(20, 2) NOT NULL,
  equity DECIMAL(20, 2) NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(game_id, player_id, game_state)
);

CREATE INDEX idx_equity_history_game_player ON equity_history(game_id, player_id, game_state);
```

## Implementation Flow

### Worker Cron Handler (`worker/src/index.ts`)

```typescript
async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
  // 1. Fetch price data from Finnhub API
  const symbols = ['BTC', 'ETH']; // Tracked symbols
  const priceData = await fetchPriceDataFromFinnhub(symbols, env.FINNHUB_API_KEY);
  
  // 2. Store price data in Supabase
  await storePriceData(priceData, supabase);
  
  // 3. Increment game state
  const currentGameState = await incrementGameState(supabase);
  
  // 4. Fetch current price data from DB (single source of truth)
  const dbPriceData = await fetchPriceDataFromDB(currentGameState, supabase);
  
  // 5. Fetch active games
  const activeGames = await fetchActiveGames(supabase);
  
  // 6. Process each game via internal route
  for (const game of activeGames) {
    await env.INTERNAL_WORKER.fetch(
      new Request('https://internal/internal/game-tick', {
        method: 'POST',
        headers: {
          'X-Internal-Token': env.INTERNAL_API_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          gameId: game.id,
          gameState: currentGameState,
          priceData: dbPriceData,
        }),
      })
    );
  }
}
```

### Internal Game Tick Handler

```typescript
// POST /internal/game-tick
async function handleGameTick(request: Request, env: Env): Promise<Response> {
  const { gameId, gameState, priceData } = await request.json();
  
  // 1. Fetch game's pending orders
  const pendingOrders = await fetchPendingOrders(gameId, supabase);
  
  // 2. Process market orders
  await processMarketOrders(pendingOrders, priceData, gameId, supabase);
  
  // 3. Process TP/SL orders
  await processTakeProfitStopLoss(pendingOrders, priceData, gameId, supabase);
  
  // 4. Update positions with current prices
  await updatePositions(gameId, priceData, supabase);
  
  // 5. Update player balances and equity
  await updatePlayerBalances(gameId, supabase);
  
  // 6. Record equity history for charts
  await recordEquityHistory(gameId, gameState, supabase);
  
  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
```

## Key Principles

1. **Single Source of Truth**: All price data is stored in DB first, then read from DB for game processing
2. **Historical Data**: All price data and equity history is preserved for charts and analysis
3. **Game State Tracking**: Global game state counter ensures all games process on the same tick
4. **Internal Routes**: Game processing happens via internal routes that only the worker can call
5. **Audit Trail**: Order executions are logged for transparency and debugging

