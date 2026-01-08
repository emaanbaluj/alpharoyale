-- Add duration_minutes column to games table
-- Games can have a duration in minutes. When started_at + duration_minutes has passed,
-- the game should be automatically marked as completed.

ALTER TABLE games 
ADD COLUMN duration_minutes INTEGER NOT NULL DEFAULT 60;

COMMENT ON COLUMN games.duration_minutes IS 'Game duration in minutes. Game completes when started_at + duration_minutes has passed. NULL started_at means game has not started yet.';
