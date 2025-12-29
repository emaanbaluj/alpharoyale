// worker/src/db.ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const supabase = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY! // NOTE: for worker/server writes you should use SERVICE_ROLE key
);

// Function to fetch the current game state
export async function fetchGameStateFromDB() {
  const { data, error } = await supabase
    .from("game_state")
    .select("*")
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// Function to fetch price data with optional filters
export async function fetchPriceDataFromDB(filters?: {
  gameState?: number;
  symbol?: string;
  limit?: number;
  orderByTimestampDesc?: boolean; // default true
}) {
  let q = supabase.from("price_data").select("*");

  if (filters?.gameState !== undefined) q = q.eq("game_state", filters.gameState);
  if (filters?.symbol) q = q.eq("symbol", filters.symbol);

  // default: newest first (good for "latest price")
  const orderDesc = filters?.orderByTimestampDesc ?? true;
  q = q.order("timestamp", { ascending: !orderDesc });

  if (filters?.limit !== undefined) q = q.limit(filters.limit);

  const { data, error } = await q;
  if (error) throw error;
  return data;
}

// Function to fetch games with optional filters
export async function fetchGamesFromDB(filters?: {
  gameId?: string;
  status?: "waiting" | "active" | "completed" | string;
  playerId?: string; // matches player1_id OR player2_id
  limit?: number;
  newestFirst?: boolean; // default true
}) {
  let q = supabase.from("games").select("*");

  if (filters?.gameId) q = q.eq("id", filters.gameId);
  if (filters?.status) q = q.eq("status", filters.status);

  if (filters?.playerId) {
    // player is either player1 or player2
    q = q.or(`player1_id.eq.${filters.playerId},player2_id.eq.${filters.playerId}`);
  }

  q = q.order("created_at", { ascending: !(filters?.newestFirst ?? true) });

  if (filters?.limit !== undefined) q = q.limit(filters.limit);

  const { data, error } = await q;
  if (error) throw error;
  return data;
}

// Function to fetch game players with optional filters
export async function fetchGamePlayersFromDB(filters?: {
  gameId?: string;
  userId?: string;
}) {
  let q = supabase.from("game_players").select("*");

  if (filters?.gameId) q = q.eq("game_id", filters.gameId);
  if (filters?.userId) q = q.eq("user_id", filters.userId);

  const { data, error } = await q;
  if (error) throw error;
  return data;
}

// Function to fetch positions with optional filters
export async function fetchPositionsFromDB(filters?: {
  gameId?: string;
  playerId?: string;
  status?: "open" | "closed" | string;
  symbol?: string;
}) {
  let q = supabase.from("positions").select("*");

  if (filters?.gameId) q = q.eq("game_id", filters.gameId);
  if (filters?.playerId) q = q.eq("player_id", filters.playerId);
  if (filters?.status) q = q.eq("status", filters.status);
  if (filters?.symbol) q = q.eq("symbol", filters.symbol);

  const { data, error } = await q;
  if (error) throw error;
  return data;
}

// Function to fetch orders with optional filters
export async function fetchOrdersFromDB(filters?: {
  gameId?: string;
  playerId?: string;
  status?: "pending" | "filled" | "cancelled" | "rejected" | string;
  orderType?: "MKT" | "LMT" | "TP" | "SL" | string;
  positionId?: string;
  newestFirst?: boolean; // default true
  limit?: number;
}) {
  let q = supabase.from("orders").select("*");

  if (filters?.gameId) q = q.eq("game_id", filters.gameId);
  if (filters?.playerId) q = q.eq("player_id", filters.playerId);
  if (filters?.status) q = q.eq("status", filters.status);
  if (filters?.orderType) q = q.eq("order_type", filters.orderType);
  if (filters?.positionId) q = q.eq("position_id", filters.positionId);

  q = q.order("created_at", { ascending: !(filters?.newestFirst ?? true) });

  if (filters?.limit !== undefined) q = q.limit(filters.limit);

  const { data, error } = await q;
  if (error) throw error;
  return data;
}

// Function to fetch order executions with optional filters
export async function fetchOrderExecutionsFromDB(filters?: {
  gameId?: string;
  playerId?: string;
  orderId?: string;
  gameState?: number;
  newestFirst?: boolean; // default true
  limit?: number;
}) {
  let q = supabase.from("order_executions").select("*");

  if (filters?.gameId) q = q.eq("game_id", filters.gameId);
  if (filters?.playerId) q = q.eq("player_id", filters.playerId);
  if (filters?.orderId) q = q.eq("order_id", filters.orderId);
  if (filters?.gameState !== undefined) q = q.eq("game_state", filters.gameState);

  q = q.order("created_at", { ascending: !(filters?.newestFirst ?? true) });

  if (filters?.limit !== undefined) q = q.limit(filters.limit);

  const { data, error } = await q;
  if (error) throw error;
  return data;
}

// Function to fetch equity histories with optional filters
export async function fetchEquityHistoriesFromDB(filters?: {
  gameId?: string;
  playerId?: string;
  fromGameState?: number;
  toGameState?: number;
  newestFirst?: boolean; // default false (charts often want oldest->newest)
  limit?: number;
}) {
  let q = supabase.from("equity_history").select("*");

  if (filters?.gameId) q = q.eq("game_id", filters.gameId);
  if (filters?.playerId) q = q.eq("player_id", filters.playerId);

  if (filters?.fromGameState !== undefined) q = q.gte("game_state", filters.fromGameState);
  if (filters?.toGameState !== undefined) q = q.lte("game_state", filters.toGameState);

  q = q.order("game_state", { ascending: !(filters?.newestFirst ?? false) });

  if (filters?.limit !== undefined) q = q.limit(filters.limit);

  const { data, error } = await q;
  if (error) throw error;
  return data;
}
