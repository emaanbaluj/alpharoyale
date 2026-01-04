import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  PriceDataRow,
  GameStateRow,
  GameRow,
  GamePlayerRow,
  PositionRow,
  OrderRow,
  EquityHistoryRow,
  OrderExecutionsRow,
} from "./types";

// Environment variables for Supabase
export type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

export function getSupabase(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

// --------------------
// price_data
// --------------------
export async function fetchPriceDataFromDB(
  supabase: SupabaseClient,
  symbol: string,
  limit = 200
): Promise<PriceDataRow[]> {
  const { data, error } = await supabase
    .from("price_data")
    .select("*")
    .eq("symbol", symbol)
    .order("timestamp", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Supabase error: ${error.message}`);
  return data ?? [];
}

export async function insertPrice(
  supabase: SupabaseClient,
  symbol: string,
  price: number,
  gameState: number
): Promise<void> {
  const { error } = await supabase.from("price_data").insert({
    symbol,
    price,
    game_state: gameState,
    timestamp: new Date().toISOString(),
  });

  if (error) throw new Error(error.message);
}

// --------------------
// game_state
// --------------------
export async function fetchGameStateFromDB(
  supabase: SupabaseClient
): Promise<GameStateRow | null> {
  const { data, error } = await supabase
    .from("game_state")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Supabase error: ${error.message}`);
  return data ?? null;
}

export async function updateGameStateInDB(
  supabase: SupabaseClient,
  currentTick: number
): Promise<void> {
  const { error } = await supabase.from("game_state").upsert({
    id: 1,
    current_tick: currentTick,
    last_tick_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (error) throw new Error(`Supabase error: ${error.message}`);
}

// --------------------
// games
// --------------------
export async function fetchGamesFromDB(
  supabase: SupabaseClient,
  status?: string
): Promise<GameRow[]> {
  let query = supabase.from("games").select("*");
  if (status) query = query.eq("status", status);

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(`Supabase error: ${error.message}`);
  return data ?? [];
}

export async function insertGameInDB(
  supabase: SupabaseClient,
  player1Id: string,
  player2Id: string | null = null,
  initialBalance = 10000.0
): Promise<GameRow> {
  const { data, error } = await supabase
    .from("games")
    .insert({
      player1_id: player1Id,
      player2_id: player2Id,
      initial_balance: initialBalance,
    })
    .select()
    .single();

  if (error) throw new Error(`Supabase error: ${error.message}`);
  return data as GameRow;
}

export async function updateGameStatusInDB(
  supabase: SupabaseClient,
  gameId: string,
  status: string,
  winnerId?: string
): Promise<void> {
  const updateData: Record<string, any> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === "completed" && winnerId) {
    updateData.winner_id = winnerId;
    updateData.ended_at = new Date().toISOString();
  }

  const { error } = await supabase.from("games").update(updateData).eq("id", gameId);
  if (error) throw new Error(`Supabase error: ${error.message}`);
}

// --------------------
// game_players
// --------------------
export async function fetchGamePlayersFromDB(
  supabase: SupabaseClient,
  gameId?: string,
  userId?: string
): Promise<GamePlayerRow[]> {
  let query = supabase.from("game_players").select("*");
  if (gameId) query = query.eq("game_id", gameId);
  if (userId) query = query.eq("user_id", userId);

  const { data, error } = await query;
  if (error) throw new Error(`Supabase error: ${error.message}`);
  return (data ?? []) as GamePlayerRow[];
}

export async function insertGamePlayerInDB(
  supabase: SupabaseClient,
  gameId: string,
  userId: string,
  initialBalance = 10000.0
): Promise<GamePlayerRow> {
  const { data, error } = await supabase
    .from("game_players")
    .insert({
      game_id: gameId,
      user_id: userId,
      balance: initialBalance,
      equity: initialBalance,
    })
    .select()
    .single();

  if (error) throw new Error(`Supabase error: ${error.message}`);
  return data as GamePlayerRow;
}

export async function updateGamePlayerBalanceInDB(
  supabase: SupabaseClient,
  gameId: string,
  userId: string,
  newBalance: number,
  newEquity: number
): Promise<void> {
  const { error } = await supabase
    .from("game_players")
    .update({
      balance: newBalance,
      equity: newEquity,
      updated_at: new Date().toISOString(),
    })
    .eq("game_id", gameId)
    .eq("user_id", userId);

  if (error) throw new Error(`Supabase error: ${error.message}`);
}

// --------------------
// positions
// --------------------
export async function fetchPositionsFromDB(
  supabase: SupabaseClient,
  gameId?: string,
  playerId?: string,
  status?: string
): Promise<PositionRow[]> {
  let query = supabase.from("positions").select("*");
  if (gameId) query = query.eq("game_id", gameId);
  if (playerId) query = query.eq("player_id", playerId);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw new Error(`Supabase error: ${error.message}`);
  return (data ?? []) as PositionRow[];
}

export async function insertPositionInDB(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  symbol: string,
  side: string,
  quantity: number,
  entryPrice: number,
  leverage = 1
): Promise<PositionRow> {
  const { data, error } = await supabase
    .from("positions")
    .insert({
      game_id: gameId,
      player_id: playerId,
      symbol,
      side,
      quantity,
      entry_price: entryPrice,
      leverage,
    })
    .select()
    .single();

  if (error) throw new Error(`Supabase error: ${error.message}`);
  return data as PositionRow;
}

export async function updatePositionInDB(
  supabase: SupabaseClient,
  positionId: string,
  updates: {
    status?: string;
    currentPrice?: number;
    unrealizedPnl?: number;
  }
): Promise<void> {
  const payload: any = {
    updated_at: new Date().toISOString(),
  };

  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.currentPrice !== undefined) payload.current_price = updates.currentPrice;
  if (updates.unrealizedPnl !== undefined) payload.unrealized_pnl = updates.unrealizedPnl;

  const { error } = await supabase
    .from("positions")
    .update(payload)
    .eq("id", positionId);

  if (error) {
    throw new Error(`Supabase error: ${error.message}`);
  }
}

// --------------------
// orders
// --------------------
export async function fetchOrdersFromDB(
  supabase: SupabaseClient,
  gameId?: string,
  status?: string,
  orderType?: string,
): Promise<OrderRow[]> {
  let query = supabase.from("orders").select("*");
  if (gameId) query = query.eq("game_id", gameId);
  if (status) query = query.eq("status", status);
  if (orderType) query = query.eq("orderType", orderType);

  const { data, error } = await query;
  if (error) throw new Error(`Supabase error: ${error.message}`);
  return (data ?? []) as OrderRow[];
}

export async function insertOrderInDB(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  symbol: string,
  orderType: string,
  side: string,
  quantity: number,
  price?: number,
  triggerPrice?: number,
  positionId?: string
): Promise<OrderRow> {
  const { data, error } = await supabase
    .from("orders")
    .insert({
      game_id: gameId,
      player_id: playerId,
      symbol,
      order_type: orderType,
      side,
      quantity,
      price,
      trigger_price: triggerPrice,
      position_id: positionId,
    })
    .select()
    .single();

  if (error) throw new Error(`Supabase error: ${error.message}`);
  return data as OrderRow;
}

export async function updateOrderInDB(
  supabase: SupabaseClient,
  orderId: string,
  status?: string,
  filledPrice?: number
): Promise<void> {
  const updates: Record<string, any> = { updated_at: new Date().toISOString() };

  if (status !== undefined) updates.status = status;
  if (filledPrice !== undefined) {
    updates.filled_price = filledPrice;
    updates.filled_at = new Date().toISOString();
  }

  const { error } = await supabase.from("orders").update(updates).eq("id", orderId);
  if (error) throw new Error(`Supabase error: ${error.message}`);
}

// NOTE: Removed executeOrderInDB because updateOrderInDB already handles filling.

// --------------------
// order_executions
// --------------------
export async function fetchOrderExecutionsFromDB(
  supabase: SupabaseClient,
  orderId?: string,
  gameId?: string,
  playerId?: string
): Promise<OrderExecutionsRow[]> {
  let query = supabase.from("order_executions").select("*");
  if (orderId) query = query.eq("order_id", orderId);
  if (gameId) query = query.eq("game_id", gameId);
  if (playerId) query = query.eq("player_id", playerId);

  const { data, error } = await query;
  if (error) throw new Error(`Supabase error: ${error.message}`);
  return (data ?? []) as OrderExecutionsRow[];
}

export async function insertOrderExecutionInDB(
  supabase: SupabaseClient,
  orderId: string,
  gameId: string,
  playerId: string,
  symbol: string,
  side: string,
  quantity: number,
  executionPrice: number,
  gameState: number
): Promise<void> {
  const { error } = await supabase.from("order_executions").insert({
    order_id: orderId,
    game_id: gameId,
    player_id: playerId,
    symbol,
    side,
    quantity,
    execution_price: executionPrice,
    game_state: gameState,
  });

  if (error) throw new Error(error.message);
}

// --------------------
// equity_history
// --------------------
export async function fetchEquityHistoryFromDB(
  supabase: SupabaseClient,
  gameId?: string,
  playerId?: string
): Promise<EquityHistoryRow[]> {
  let query = supabase.from("equity_history").select("*");
  if (gameId) query = query.eq("game_id", gameId);
  if (playerId) query = query.eq("player_id", playerId);

  const { data, error } = await query;
  if (error) throw new Error(`Supabase error: ${error.message}`);
  return (data ?? []) as EquityHistoryRow[];
}

export async function insertEquityHistoryInDB(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  gameState: number,
  balance: number,
  equity: number
): Promise<void> {
  const { error } = await supabase.from("equity_history").insert({
    game_id: gameId,
    player_id: playerId,
    game_state: gameState,
    balance,
    equity,
  });

  if (error) throw new Error(error.message);
}

export async function updateEquityHistoryInDB(){

}
