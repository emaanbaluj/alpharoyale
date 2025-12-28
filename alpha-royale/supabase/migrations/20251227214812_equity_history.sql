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