CREATE TABLE game_state (
  id SERIAL PRIMARY KEY,
  current_tick INTEGER NOT NULL DEFAULT 0,
  last_tick_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Single row table, initialize with:
INSERT INTO game_state (current_tick) VALUES (0);

CREATE TABLE price_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol VARCHAR(10) NOT NULL, -- e.g., 'BTC', 'ETH'
  price DECIMAL(20, 8) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  game_state INTEGER NOT NULL references public.game_state(id), -- Links to the game_state when this price was recorded
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_price_data_symbol_timestamp ON price_data(symbol, timestamp DESC);
CREATE INDEX idx_price_data_game_state ON price_data(game_state);
