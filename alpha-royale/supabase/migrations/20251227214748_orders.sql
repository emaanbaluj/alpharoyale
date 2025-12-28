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