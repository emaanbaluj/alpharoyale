// worker/src/game.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fetchPriceDataFromFinnhub } from "./finnhub";
import * as db from "./db";
import { get } from "node:http";

