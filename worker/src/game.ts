// worker/src/game.ts

import { fetchPriceDataFromFinnhub } from "./finnhub";
import * as db from "./db";
import type { Database } from "./database.types"; // optional, only if you use types here

const Env = {
  FINNHUB_API_KEY: process.env.FINNHUB_API_KEY!,
  SUPABASE_URL: process.env.SUPABASE_URL!,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
};

const supabase = db.createSupabaseClient({
  supabaseUrl: Env.SUPABASE_URL,
  supabaseKey: Env.SUPABASE_SERVICE_ROLE_KEY,
});



// DATABASE SCHEMA FOR price_data TABLE

// CREATE TABLE price_data (
//   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//   symbol VARCHAR(10) NOT NULL, -- e.g., 'BTC', 'ETH'
//   price DECIMAL(20, 8) NOT NULL,
//   timestamp TIMESTAMPTZ NOT NULL,
//   game_state INTEGER NOT NULL, -- Links to the game_state when this price was recorded
//   created_at TIMESTAMPTZ DEFAULT NOW()
// );

// CREATE INDEX idx_price_data_symbol_timestamp ON price_data(symbol, timestamp DESC);
// CREATE INDEX idx_price_data_game_state ON price_data(game_state);

// export async function storePriceDataForSymbol(symbols: string | string[]) {
//   const priceData = await fetchPriceDataFromFinnhub(symbols, Env.FINNHUB_API_KEY);
  
//   const now = new Date().toISOString();

export async function incrementGameState() {
  const row = await db.fetchGameStateFromDB(); // { id, current_tick, ... }

  if (!row) throw new Error("game_state row not found");

  const newTick = row.current_tick + 1;
  const now = new Date().toISOString();

  await db.updateFromDB(
    "game_state",
    { current_tick: newTick, last_tick_at: now, updated_at: now },
    { id: row.id } // usually 1
  );

  return newTick;
}


