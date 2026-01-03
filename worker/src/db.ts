import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PriceDataRow, GameStateRow, GameRow, GamePlayerRow, PositionRow, OrderRow } from "./types";

// Environment variables for Supabase
export type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};



// Table: price_data
// id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
// symbol VARCHAR(10) NOT NULL, -- e.g., 'BTC', 'ETH'
// price DECIMAL(20, 8) NOT NULL,
// timestamp TIMESTAMPTZ NOT NULL,
// game_state INTEGER NOT NULL, -- Links to the game_state when this price was recorded
// created_at TIMESTAMPTZ DEFAULT NOW()

// Fetch latest price data for given symbols
export async function fetchPriceDataFromDB(
  supabase: SupabaseClient,
  symbols: string[],
  limit = 200
): Promise<PriceDataRow[]> {

  const { data, error } = await supabase
    .from("price_data")
    .select("*")
    .in("symbol", symbols)
    .order("timestamp", { ascending: false })
    .limit(limit * symbols.length);

  if (error) {
    throw new Error(`Supabase error: ${error.message}`);
  }

  return data || [];

}

// Insert new price data record
export async function insertPrice(
  supabase: SupabaseClient,
  symbol: string,
  price: number,
  gameState: number
) {
  const { error } = await supabase
    .from("price_data")
    .insert({
      symbol,
      price,
      game_state: gameState,
      timestamp: new Date().toISOString(),
    });

  if (error) throw new Error(error.message);
}


// Table: game_state
// id SERIAL PRIMARY KEY,
// current_tick INTEGER NOT NULL DEFAULT 0,
// last_tick_at TIMESTAMPTZ DEFAULT NOW(),
// updated_at TIMESTAMPTZ DEFAULT NOW()

// Fetch the current game state
export async function fetchGameStateFromDB(
  supabase: SupabaseClient
): Promise<GameStateRow | null> {
  const { data, error } = await supabase
    .from("game_state")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase error: ${error.message}`);
  }

  return data ?? null;
}

export async function updateGameStateInDB(
  supabase: SupabaseClient,
  currentTick: number
): Promise<void> {
  const { error } = await supabase
    .from("game_state")
    .upsert({
      id: 1, // Assuming single row with id=1
      current_tick: currentTick,
      last_tick_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

  if (error) {
    throw new Error(`Supabase error: ${error.message}`);
  }
} 

// Table: games
// id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
// player1_id UUID NOT NULL REFERENCES auth.users(id),
// player2_id UUID REFERENCES auth.users(id), -- NULL if waiting for opponent
// status VARCHAR(20) NOT NULL DEFAULT 'waiting', -- 'waiting', 'active', 'completed'
// started_at TIMESTAMPTZ,
// ended_at TIMESTAMPTZ,
// winner_id UUID REFERENCES auth.users(id),
// initial_balance DECIMAL(20, 2) NOT NULL DEFAULT 10000.00,
// created_at TIMESTAMPTZ DEFAULT NOW(),
// updated_at TIMESTAMPTZ DEFAULT NOW()
export async function fetchGamesFromDB(
  supabase: SupabaseClient,
  status?: string
): Promise<GameRow[]> {
  let query = supabase.from("games").select("*");

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Supabase error: ${error.message}`);
  }

  return data || [];
}

// Insert new game record in the database 
export async function insertGameInDB(
  supabase: SupabaseClient,
  player1Id: string,
  player2Id: string | null = null,  
  initialBalance: number = 10000.0

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

  if (error) {
    throw new Error(`Supabase error: ${error.message}`);
  }

  return data as GameRow;
} 

// Update game status
export async function updateGameStatusInDB(
  supabase: SupabaseClient,
  gameId: string,
  status: string,
  winnerId?: string
): Promise<void> {
  const updateData: any = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === "completed" && winnerId) {
    updateData.winner_id = winnerId;
    updateData.ended_at = new Date().toISOString();
  }
  const { error } = await supabase
    .from("games")
    .update(updateData)
    .eq("id", gameId);

  if (error) {
    throw new Error(`Supabase error: ${error.message}`);
  }
} 


// Table: game_players
// id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
// game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
// user_id UUID NOT NULL REFERENCES auth.users(id),
// balance DECIMAL(20, 2) NOT NULL DEFAULT 10000.00,
// equity DECIMAL(20, 2) NOT NULL DEFAULT 10000.00, -- balance + unrealized P&L
// created_at TIMESTAMPTZ DEFAULT NOW(),
// updated_at TIMESTAMPTZ DEFAULT NOW(),
// UNIQUE(game_id, user_id)

// Fetch game players by game ID or user ID
export async function fetchGamePlayersFromDB(
  supabase: SupabaseClient,
  gameId?: string,
  userId?: string
): Promise<GamePlayerRow[]> {
  let query = supabase.from("game_players").select("*");

  if (gameId) query = query.eq("game_id", gameId);
  if (userId) query = query.eq("user_id", userId);

  const { data, error } = await query;

  if (error) {
    throw new Error(`Supabase error: ${error.message}`);
  }

  return (data ?? []) as GamePlayerRow[];
}

// Insert new game player record
export async function insertGamePlayerInDB(
  supabase: SupabaseClient,
  gameId: string,
  userId: string,
  initialBalance: number = 10000.0
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

  if (error) {
    throw new Error(`Supabase error: ${error.message}`);
  }

  return data as GamePlayerRow;
}

// Update game player balance and equity
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

  if (error) {
    throw new Error(`Supabase error: ${error.message}`);
  }
}


// Table: positions
// id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
// game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
// player_id UUID NOT NULL REFERENCES auth.users(id),
// symbol VARCHAR(10) NOT NULL,
// side VARCHAR(4) NOT NULL, -- 'BUY' or 'SELL'
// quantity DECIMAL(20, 8) NOT NULL,
// entry_price DECIMAL(20, 8) NOT NULL,
// current_price DECIMAL(20, 8),
// leverage INTEGER DEFAULT 1,
// unrealized_pnl DECIMAL(20, 2) DEFAULT 0,
// opened_at TIMESTAMPTZ DEFAULT NOW(),
// closed_at TIMESTAMPTZ,
// status VARCHAR(20) NOT NULL DEFAULT 'open', -- 'open', 'closed'
// created_at TIMESTAMPTZ DEFAULT NOW(),
// updated_at TIMESTAMPTZ DEFAULT NOW()

// Fetch positions by game ID, player ID, or status
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
  
  if (error) {
    throw new Error(`Supabase error: ${error.message}`);
  }
  return (data ?? []) as PositionRow[];
}

// Insert new position record
export async function insertPositionInDB(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  symbol: string,
  side: string,
  quantity: number,
  entryPrice: number,
  leverage: number = 1
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

  if (error) {
    throw new Error(`Supabase error: ${error.message}`);
  }

  return data as PositionRow;
}

// Update position status and current price
export async function updatePositionInDB(
  supabase: SupabaseClient,
  positionId: string,
  status?: string,
  currentPrice?: number
): Promise<void> {
  const updates: any = {};
  if (status !== undefined) updates.status = status;
  if (currentPrice !== undefined) updates.current_price = currentPrice;
  updates.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from("positions")
    .update(updates)
    .eq("id", positionId);

  if (error) {
    throw new Error(`Supabase error: ${error.message}`);
  }
}

// Table: orders
// id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
// game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
// player_id UUID NOT NULL REFERENCES auth.users(id),
// symbol VARCHAR(10) NOT NULL,
// order_type VARCHAR(20) NOT NULL, -- 'MARKET', 'LIMIT', 'TAKE_PROFIT', 'STOP_LOSS'
// side VARCHAR(4) NOT NULL, -- 'BUY' or 'SELL'
// quantity DECIMAL(20, 8) NOT NULL,
// price DECIMAL(20, 8), -- NULL for market orders
// trigger_price DECIMAL(20, 8), -- For TP/SL orders
// position_id UUID REFERENCES positions(id), -- Links TP/SL to a position
// status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'filled', 'cancelled', 'rejected'
// filled_price DECIMAL(20, 8),
// filled_at TIMESTAMPTZ,
// created_at TIMESTAMPTZ DEFAULT NOW(),
// updated_at TIMESTAMPTZ DEFAULT NOW()

// Fetch orders by game ID, player ID, or status
export async function fetchOrdersFromDB(
  supabase: SupabaseClient,
  gameId?: string,
  playerId?: string,
  status?: string
): Promise<OrderRow[]> {
  let query = supabase.from("orders").select("*");
  
  if (gameId) query = query.eq("game_id", gameId);
  if (playerId) query = query.eq("player_id", playerId);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  
  if (error) {
    throw new Error(`Supabase error: ${error.message}`);
  }
  return (data ?? []) as OrderRow[];
}

// Insert new order record
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

  if (error) {
    throw new Error(`Supabase error: ${error.message}`);
  }

  return data as OrderRow;
}

// Update order status and filled price
export async function updateOrderInDB(
  supabase: SupabaseClient,
  orderId: string,
  status?: string,
  filledPrice?: number
): Promise<void> {
  const updates: any = {};
  if (status !== undefined) updates.status = status;
  if (filledPrice !== undefined) {
    updates.filled_price = filledPrice;
    updates.filled_at = new Date().toISOString();
  }
  updates.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from("orders")
    .update(updates)
    .eq("id", orderId);

  if (error) {
    throw new Error(`Supabase error: ${error.message}`);
  }
}   


// Table: order_executions
  // id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  // order_id UUID NOT NULL REFERENCES orders(id),
  // game_id UUID NOT NULL REFERENCES games(id),
  // player_id UUID NOT NULL REFERENCES auth.users(id),
  // symbol VARCHAR(10) NOT NULL,
  // side VARCHAR(4) NOT NULL,
  // quantity DECIMAL(20, 8) NOT NULL,
  // execution_price DECIMAL(20, 8) NOT NULL,
  // game_state INTEGER NOT NULL, -- Tick when order was executed
  // created_at TIMESTAMPTZ DEFAULT NOW()

// Fetch order executions by order ID, game ID, or player ID
export async function fetchOrderExecutionsFromDB(
  supabase: SupabaseClient,
  orderId?: string,
  gameId?: string,
  playerId?: string
): Promise<any[]> {
  let query = supabase.from("order_executions").select("*");
  
  if (orderId) query = query.eq("order_id", orderId);
  if (gameId) query = query.eq("game_id", gameId);
  if (playerId) query = query.eq("player_id", playerId);
  const { data, error } = await query;
  
  if (error) {
    throw new Error(`Supabase error: ${error.message}`);
  }
  return data || [];
}

// Insert new order execution record
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
  const { error } = await supabase
    .from("order_executions")
    .insert({
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


// Table: equity_history
  // id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  // game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  // player_id UUID NOT NULL REFERENCES auth.users(id),
  // game_state INTEGER NOT NULL,
  // balance DECIMAL(20, 2) NOT NULL,
  // equity DECIMAL(20, 2) NOT NULL,
  // timestamp TIMESTAMPTZ DEFAULT NOW(),
  // UNIQUE(game_id, player_id, game_state)

  // Fetch equity history by game ID or player ID
export async function fetchEquityHistoryFromDB(
  supabase: SupabaseClient,
  gameId?: string,
  playerId?: string
): Promise<any[]> {
  let query = supabase.from("equity_history").select("*");
  
  if (gameId) query = query.eq("game_id", gameId);
  if (playerId) query = query.eq("player_id", playerId);
  const { data, error } = await query;
  
  if (error) {
    throw new Error(`Supabase error: ${error.message}`);
  }
  return data || [];
}
// Insert new equity history record
export async function insertEquityHistoryInDB(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  gameState: number,
  balance: number,
  equity: number
): Promise<void> {
  const { error } = await supabase
    .from("equity_history")
    .insert({
      game_id: gameId,
      player_id: playerId,
      game_state: gameState,
      balance,
      equity,
    });
    
  if (error) throw new Error(error.message);
  
}





  

