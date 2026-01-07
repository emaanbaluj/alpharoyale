-- Enable realtime for all game-related tables
-- This allows the frontend to subscribe to changes and update in real-time

ALTER PUBLICATION supabase_realtime ADD TABLE positions;
ALTER PUBLICATION supabase_realtime ADD TABLE game_players;
ALTER PUBLICATION supabase_realtime ADD TABLE price_data;
ALTER PUBLICATION supabase_realtime ADD TABLE equity_history;
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
