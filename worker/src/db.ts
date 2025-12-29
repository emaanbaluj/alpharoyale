
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const supabase: SupabaseClient<Database> = null as any; // will be initialized in createSupabaseClient

// DATABSE INTIALIZATION FUNCTIONS

// Function to create and return a Supabase client
export function createSupabaseClient(params: {
  supabaseUrl: string;
  supabaseKey: string;
}): SupabaseClient<Database> {
  const { supabaseUrl, supabaseKey } = params;

  if (!supabaseUrl) throw new Error("Missing supabaseUrl");
  if (!supabaseKey) throw new Error("Missing supabaseKey");

  return createClient<Database>(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });
}


// DATABASE QUERY FUNCTIONS

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

// DATABASE UPDATE FUNCTIONS

// Function to update a row in any table (where clause required)
export async function updateFromDB(
  table: keyof Database["public"]["Tables"],
  updates: Record<string, any>,
  where: Record<string, any>,
  select: string = "*",
  single: boolean = true
) {
  if (!where || Object.keys(where).length === 0) {
    throw new Error("updateFromDB: where clause is required");
  }

  let q = supabase.from(table as string).update(updates);

  for (const [col, val] of Object.entries(where)) {
    q = q.eq(col, val);
  }

  const res = single ? await q.select(select).single() : await q.select(select);

  if (res.error) throw res.error;
  return res.data;
}

// Function to update the game state row (assumes id = 1)
export async function updateGameStateFromDB(updates: {
  current_tick?: number;
  last_tick_at?: string;
  updated_at?: string;
}) {
  return updateFromDB(
    "game_state",
    updates,
    { id: 1 },
    "id,current_tick,last_tick_at,updated_at",
    true
  );
}

// Function to update a game (by gameId)
export async function updateGameFromDB(
  gameId: string,
  updates: {
    status?: string;
    started_at?: string | null;
    ended_at?: string | null;
    winner_id?: string | null;
    updated_at?: string;
  }
) {
  return updateFromDB("games", updates, { id: gameId }, "*", true);
}

// Function to update a game player (by gameId + userId)
export async function updateGamePlayerFromDB(
  gameId: string,
  userId: string,
  updates: {
    balance?: number;
    equity?: number;
    updated_at?: string;
  }
) {
  return updateFromDB("game_players", updates, { game_id: gameId, user_id: userId }, "*", true);
}

// Function to update a position (by positionId)
export async function updatePositionFromDB(
  positionId: string,
  updates: {
    current_price?: number | null;
    unrealized_pnl?: number | null;
    status?: string;
    closed_at?: string | null;
    updated_at?: string;
  }
) {
  return updateFromDB("positions", updates, { id: positionId }, "*", true);
}

// Function to update positions in a game (by gameId) and return multiple rows
export async function updatePositionsByGameFromDB(
  gameId: string,
  updates: {
    current_price?: number | null;
    updated_at?: string;
  }
) {
  return updateFromDB("positions", updates, { game_id: gameId }, "*", false);
}

// Function to update an order (by orderId)
export async function updateOrderFromDB(
  orderId: string,
  updates: {
    status?: string;
    filled_price?: number | null;
    filled_at?: string | null;
    price?: number | null;
    trigger_price?: number | null;
    position_id?: string | null;
    updated_at?: string;
  }
) {
  return updateFromDB("orders", updates, { id: orderId }, "*", true);
}

// Function to mark an order as filled
export async function markOrderFilledFromDB(orderId: string, filledPrice: number, filledAtIso?: string) {
  const now = filledAtIso ?? new Date().toISOString();
  return updateOrderFromDB(orderId, {
    status: "filled",
    filled_price: filledPrice,
    filled_at: now,
    updated_at: now,
  });
}

// Function to mark an order as rejected
export async function markOrderRejectedFromDB(orderId: string, rejectedAtIso?: string) {
  const now = rejectedAtIso ?? new Date().toISOString();
  return updateOrderFromDB(orderId, {
    status: "rejected",
    updated_at: now,
  });
}

// Function to mark an order as cancelled
export async function markOrderCancelledFromDB(orderId: string, cancelledAtIso?: string) {
  const now = cancelledAtIso ?? new Date().toISOString();
  return updateOrderFromDB(orderId, {
    status: "cancelled",
    updated_at: now,
  });
}

// Function to update a price_data row (by priceDataId) - usually you upsert instead
export async function updatePriceDataFromDB(
  priceDataId: string,
  updates: {
    price?: number;
    timestamp?: string;
  }
) {
  return updateFromDB("price_data", updates, { id: priceDataId }, "*", true);
}

// Function to update an equity_history row (by equityHistoryId) - usually you upsert instead
export async function updateEquityHistoryFromDB(
  equityHistoryId: string,
  updates: {
    balance?: number;
    equity?: number;
    timestamp?: string;
  }
) {
  return updateFromDB("equity_history", updates, { id: equityHistoryId }, "*", true);
}

// Function to update an order_executions row (by orderExecutionId) - usually append-only
export async function updateOrderExecutionFromDB(
  orderExecutionId: string,
  updates: {
    execution_price?: number;
  }
) {
  return updateFromDB("order_executions", updates, { id: orderExecutionId }, "*", true);
}

