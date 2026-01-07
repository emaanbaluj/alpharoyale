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


// --------------------
// price_data
// --------------------

/**
 * Fetch most recent price data rows for a symbol.
 *
 * @param supabase - Supabase client instance
 * @param symbol - Asset symbol (e.g. BTC, ETH)
 * @param limit - Maximum number of rows to return (default 200)
 * @returns Array of price_data rows (most recent first)
 */
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

/**
 * Insert a new price row for a symbol at a given game state.
 *
 * @param supabase - Supabase client instance
 * @param symbol - Asset symbol (e.g. BTC, ETH)
 * @param price - Latest price to store
 * @param gameState - Tick/game state number
 */
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

/**
 * Fetch the single-row game_state record (id=1).
 *
 * @param supabase - Supabase client instance
 * @returns GameStateRow if exists, otherwise null
 */
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

/**
 * Upsert the single-row game_state record (id=1) with a new current tick.
 *
 * @param supabase - Supabase client instance
 * @param currentTick - New current tick to store
 */
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

/**
 * Fetch games, optionally filtered by status.
 *
 * @param supabase - Supabase client instance
 * @param status - Optional game status filter (e.g. "active", "completed")
 * @returns Array of games (most recently created first)
 */
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

/**
 * Create a new game row.
 *
 * @param supabase - Supabase client instance
 * @param player1Id - User ID for player 1
 * @param player2Id - Optional user ID for player 2
 * @param initialBalance - Starting balance for players (default 10000)
 * @returns The inserted game row
 */
export async function insertGameInDB(
  supabase: SupabaseClient,
  player1Id: string,
  player2Id: string | null = null,
  initialBalance = 10000.0,
  durationMinutes = 60
): Promise<GameRow> {
  const { data, error } = await supabase
    .from("games")
    .insert({
      player1_id: player1Id,
      player2_id: player2Id,
      initial_balance: initialBalance,
      duration_minutes: durationMinutes,
    })
    .select()
    .single();

  if (error) throw new Error(`Supabase error: ${error.message}`);
  return data as GameRow;
}

/**
 * Update the status of a game.
 * If status is "completed" and winnerId is provided, also sets winner_id + ended_at.
 *
 * @param supabase - Supabase client instance
 * @param gameId - Game ID to update
 * @param status - New status value
 * @param winnerId - Optional winner user ID (only used when status="completed")
 */
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

  // Set started_at when game becomes active (if not already set)
  if (status === "active") {
    const games = await fetchGamesFromDB(supabase);
    const currentGame = games.find((g) => g.id === gameId);
    if (currentGame && !currentGame.started_at) {
      updateData.started_at = new Date().toISOString();
    }
  }

  // Set ended_at and optionally winner_id when game is completed
  if (status === "completed") {
    updateData.ended_at = new Date().toISOString();
    if (winnerId) {
      updateData.winner_id = winnerId;
    }
  }

  const { error } = await supabase.from("games").update(updateData).eq("id", gameId);
  if (error) throw new Error(`Supabase error: ${error.message}`);
}

/**
 * Check if a single game has expired and complete it if so
 * Returns true if the game was expired and completed, false otherwise
 */
export async function checkAndCompleteGameIfExpired(
  supabase: SupabaseClient,
  gameId: string
): Promise<boolean> {
  // Fetch the specific game
  const games = await fetchGamesFromDB(supabase);
  const game = games.find((g) => g.id === gameId);

  if (!game) {
    return false; // Game not found
  }

  // Only check active games that have started
  if (game.status !== "active" || !game.started_at) {
    return false; // Game not active or hasn't started
  }

  // Calculate expiration time
  const startedAt = new Date(game.started_at);
  const expirationTime = new Date(startedAt);
  expirationTime.setMinutes(expirationTime.getMinutes() + game.duration_minutes);

  // Check if game has expired
  const now = new Date();
  if (now >= expirationTime) {
    // Mark game as completed
    await updateGameStatusInDB(supabase, game.id, "completed");
    return true;
  }

  return false;
}

/**
 * Check and complete expired games based on duration (batch operation)
 * Returns list of game IDs that were completed
 * @deprecated Use checkAndCompleteGameIfExpired in bound worker instead
 */
export async function checkAndCompleteExpiredGames(
  supabase: SupabaseClient
): Promise<string[]> {
  // Fetch all active games that have started
  const activeGames = await fetchGamesFromDB(supabase, "active");
  const now = new Date();
  const expiredGameIds: string[] = [];

  for (const game of activeGames) {
    // Skip games that haven't started yet (started_at is NULL)
    if (!game.started_at) {
      continue;
    }

    // Calculate expiration time
    const startedAt = new Date(game.started_at);
    const expirationTime = new Date(startedAt);
    expirationTime.setMinutes(expirationTime.getMinutes() + game.duration_minutes);

    // Check if game has expired
    if (now >= expirationTime) {
      // Mark game as completed
      await updateGameStatusInDB(supabase, game.id, "completed");
      expiredGameIds.push(game.id);
    }
  }

  return expiredGameIds;
}

// --------------------
// game_players
// --------------------

/**
 * Fetch game_players rows, optionally filtered by gameId and/or userId.
 *
 * @param supabase - Supabase client instance
 * @param gameId - Optional game ID filter
 * @param userId - Optional user ID filter
 * @returns Array of game_players rows
 */
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

/**
 * Insert a new game_players row for a user in a game.
 *
 * @param supabase - Supabase client instance
 * @param gameId - Game ID
 * @param userId - User ID
 * @param initialBalance - Starting balance/equity (default 10000)
 * @returns Inserted game_players row
 */
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

/**
 * Update a player's balance and equity in game_players.
 *
 * @param supabase - Supabase client instance
 * @param gameId - Game ID
 * @param userId - Player user ID
 * @param newBalance - New cash balance
 * @param newEquity - New equity value
 */
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

/**
 * Fetch positions rows, optionally filtered by gameId and/or status.
 *
 * @param supabase - Supabase client instance
 * @param gameId - Optional game ID filter
 * @param status - Optional status filter (e.g. "open", "closed")
 * @returns Array of positions rows
 */
export async function fetchPositionsFromDB(
  supabase: SupabaseClient,
  gameId?: string,
  status?: string
): Promise<PositionRow[]> {
  let query = supabase.from("positions").select("*");
  if (gameId) query = query.eq("game_id", gameId);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw new Error(`Supabase error: ${error.message}`);
  return (data ?? []) as PositionRow[];
}

/**
 * Insert a new position.
 *
 * @param supabase - Supabase client instance
 * @param gameId - Game ID
 * @param playerId - Player user ID
 * @param symbol - Asset symbol
 * @param side - "BUY" or "SELL" (v1 is long-only but schema supports both)
 * @param quantity - Position quantity
 * @param entryPrice - Entry price for the position
 * @param leverage - Leverage (default 1)
 * @returns Inserted position row
 */
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

/**
 * Update a position with any subset of supported fields.
 *
 * @param supabase - Supabase client instance
 * @param positionId - Position ID to update
 * @param updates - Patch object of fields to update
 */
export async function updatePositionInDB(
  supabase: SupabaseClient,
  positionId: string,
  updates: {
    status?: string;
    currentPrice?: number;
    unrealizedPnl?: number;
    quantity?: number;
    entryPrice?: number;
  }
): Promise<void> {
  
  const payload: any = {
    updated_at: new Date().toISOString(),
  };

  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.currentPrice !== undefined) payload.current_price = updates.currentPrice;
  if (updates.unrealizedPnl !== undefined) payload.unrealized_pnl = updates.unrealizedPnl;

  // new fields
  if (updates.quantity !== undefined) payload.quantity = updates.quantity;
  if (updates.entryPrice !== undefined) payload.entry_price = updates.entryPrice;

  const { error } = await supabase.from("positions").update(payload).eq("id", positionId);
  if (error) throw new Error(`Supabase error: ${error.message}`);
}

// --------------------
// orders
// --------------------

/**
 * Fetch orders for a game, optionally filtered by status and orderType.
 *
 * @param supabase - Supabase client instance
 * @param gameId - Game ID (required)
 * @param status - Optional status filter (e.g. "pending", "filled", "rejected")
 * @param orderType - Optional order type filter (e.g. "MARKET", "TAKE_PROFIT", "STOP_LOSS")
 * @returns Array of orders rows
 */
export async function fetchOrdersFromDB(
  supabase: SupabaseClient,
  gameId: string,
  status?: string,
  orderType?: string
): Promise<OrderRow[]> {
  let query = supabase.from("orders").select("*");
  if (gameId) query = query.eq("game_id", gameId);
  if (status) query = query.eq("status", status);
  if (orderType) query = query.eq("order_type", orderType);

  const { data, error } = await query;
  if (error) throw new Error(`Supabase error: ${error.message}`);
  return (data ?? []) as OrderRow[];
}

/**
 * Insert a new order (MARKET / TAKE_PROFIT / STOP_LOSS, etc.).
 *
 * @param supabase - Supabase client instance
 * @param gameId - Game ID
 * @param playerId - Player user ID
 * @param symbol - Asset symbol
 * @param orderType - Order type string
 * @param side - "BUY" or "SELL"
 * @param quantity - Order quantity
 * @param price - Optional limit price (if used)
 * @param triggerPrice - Optional trigger price (for TP/SL)
 * @param positionId - Optional linked position ID (for TP/SL)
 * @returns Inserted order row
 */
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

/**
 * Update an order status, and optionally mark it filled with a filled_price + filled_at.
 *
 * @param supabase - Supabase client instance
 * @param orderId - Order ID
 * @param status - New status string (e.g. "pending", "filled", "rejected")
 * @param filledPrice - Optional filled price; if present, also sets filled_at
 */
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

// --------------------
// order_executions
// --------------------

/**
 * Fetch order executions, optionally filtered by orderId/gameId/playerId.
 *
 * @param supabase - Supabase client instance
 * @param orderId - Optional order ID filter
 * @param gameId - Optional game ID filter
 * @param playerId - Optional player ID filter
 * @returns Array of order_executions rows
 */
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

/**
 * Insert a new execution row (audit trail for fills).
 *
 * @param supabase - Supabase client instance
 * @param orderId - Order ID
 * @param gameId - Game ID
 * @param playerId - Player user ID
 * @param symbol - Asset symbol
 * @param side - "BUY" or "SELL"
 * @param quantity - Filled quantity
 * @param executionPrice - Fill price
 * @param gameState - Tick/game state number
 */
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

/**
 * Fetch equity history rows, optionally filtered by gameId and/or playerId.
 *
 * @param supabase - Supabase client instance
 * @param gameId - Optional game ID filter
 * @param playerId - Optional player ID filter
 * @returns Array of equity_history rows
 */
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

/**
 * Insert a new equity history row (for charts).
 *
 * @param supabase - Supabase client instance
 * @param gameId - Game ID
 * @param playerId - Player user ID
 * @param gameState - Tick/game state number
 * @param balance - Player cash balance at this tick
 * @param equity - Player equity at this tick
 */
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
