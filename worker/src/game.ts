// worker/src/game.ts

import { fetchPriceDataFromFinnhub } from "./finnhub";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const ENV = {
  SUPABASE_URL: process.env.SUPABASE_URL!,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
  FINNHUB_API_KEY: process.env.FINNHUB_API_KEY!,
};

const supabase = createClient<Database>(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY);

export async function storePriceData() {
  const symbols = ["AAPL", "GOOGL", "MSFT"];

  // TODO: replace with real tick from incrementGameState()
  const gameState: number = 0;

  const live = await fetchPriceDataFromFinnhub(symbols, ENV.FINNHUB_API_KEY);
  // expected: Array<{ symbol: string; price: number; timestamp: string }>

  const rows = live.map((x) => ({
    symbol: x.symbol,
    price: x.price,
    timestamp: x.timestamp,
    game_state: gameState,
  }));

  const { data, error } = await supabase
    .from("price_data")
    .upsert(rows, { onConflict: "symbol,game_state" })
    .select();

  if (error) throw error;
  return data;
}

export async function incrementGameState() {
  // TODO: implement properly (atomic increment) via RPC or update.
  throw new Error("incrementGameState() not implemented yet");
}

export async function fetchPriceDataFromDB() {
  // TODO: replace with real tick argument or a stored current tick
  const gameState: number = 0;

  const { data, error } = await supabase
    .from("price_data")
    .select("*")
    .eq("game_state", gameState);

  if (error) throw error;
  return data;
}
