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

