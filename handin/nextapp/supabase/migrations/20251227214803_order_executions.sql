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