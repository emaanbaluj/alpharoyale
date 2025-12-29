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
  const priceData = await fetchPriceDataFromFinnhub(symbols, ENV.FINNHUB_API_KEY);
}

export async function incrementGameState() {
  currentGameState = 
  
}

export async function fetchPriceDataFromDB() {

}
