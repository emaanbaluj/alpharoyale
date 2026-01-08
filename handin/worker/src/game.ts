import type { SupabaseClient } from "@supabase/supabase-js";
import * as db from "./db";

// --------------------
// Helpers
// --------------------

/**
 * Get latest price (most recent row) for each symbol from price_data.
 *
 * @param supabase - Supabase client instance
 * @param symbols - List of symbols to fetch
 * @returns Map(symbol -> latest price)
 */
async function getLatestPricesBySymbol(
  supabase: SupabaseClient,
  symbols: string[]
): Promise<Map<string, number>> {
  const priceBySymbol = new Map<string, number>();

  for (const sym of symbols) {
    const rows = await db.fetchPriceDataFromDB(supabase, sym, 1);
    if (rows[0]) priceBySymbol.set(sym, Number(rows[0].price));
  }

  return priceBySymbol;
}

/**
 * Checks if the player has enough balance to BUY qty at price.
 *
 * @param supabase - Supabase client instance
 * @param gameId - Game ID
 * @param playerId - Player user ID
 * @param quantity - Qty to buy
 * @param price - Fill price to use for cost check
 * @returns true if balance >= quantity*price
 */
async function checkBalanceForBuy(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  quantity: number,
  price: number
): Promise<boolean> {
  const { data, error } = await supabase
    .from("game_players")
    .select("balance")
    .eq("game_id", gameId)
    .eq("user_id", playerId)
    .single();

  if (error) return false;

  const balance = Number(data?.balance ?? 0);
  const cost = quantity * price;

  return Number.isFinite(balance) && balance >= cost;
}

/**
 * Checks if the player has enough open position size to SELL qty for symbol.
 * (v1 long-only: must have an open BUY position with quantity >= qty)
 *
 * @param supabase - Supabase client instance
 * @param gameId - Game ID
 * @param playerId - Player user ID
 * @param quantity - Qty to sell
 * @param symbol - Symbol
 * @returns true if open position quantity >= requested quantity
 */
async function checkPositionsForSell(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  quantity: number,
  symbol: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("positions")
    .select("quantity,side,status")
    .eq("game_id", gameId)
    .eq("player_id", playerId)
    .eq("symbol", symbol)
    .eq("status", "open")
    .single();

  if (error) return false;

  if (data?.side !== "BUY" || data?.status !== "open") return false;

  const posQty = Number(data?.quantity ?? 0);
  return Number.isFinite(posQty) && posQty >= quantity;
}

// --------------------
// Process functions
// --------------------

/**
 * Process all pending MARKET orders for a game.
 * - Loads pending MARKET orders
 * - Loads latest prices for required symbols
 * - Loads open positions (for BUY merge + SELL reduce/close)
 * - Routes each order to BUY or SELL handler
 *
 * Notes:
 * - If no price is available for a symbol this tick, the order remains pending.
 *
 * @param supabase - Supabase client instance
 * @param gameId - The game ID to process
 * @param tick - The current tick number (game state)
 */
export async function processMarketOrders(
  supabase: SupabaseClient,
  gameId: string,
  tick: number
): Promise<void> {
  const marketOrders = await db.fetchOrdersFromDB(supabase, gameId, "pending", "MARKET");
  if (marketOrders.length === 0) return;

  const symbols = Array.from(new Set(marketOrders.map((o) => o.symbol)));
  const priceBySymbol = await getLatestPricesBySymbol(supabase, symbols);

  const openPositions = await db.fetchPositionsFromDB(supabase, gameId, "open");
  const posByKey = new Map(openPositions.map((p) => [`${p.player_id}:${p.symbol}`, p]));

  for (const order of marketOrders) {
    const fillPrice = priceBySymbol.get(order.symbol);
    if (fillPrice == null) continue; // keep pending

    const qty = Number(order.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      await db.updateOrderInDB(supabase, order.id, "rejected");
      continue;
    }

    if (order.side === "BUY") {
      await handleBuyMarketOrder(supabase, gameId, tick, order, qty, fillPrice, posByKey);
      continue;
    }

    if (order.side === "SELL") {
      await handleSellMarketOrder(supabase, gameId, tick, order, qty, fillPrice, posByKey);
      continue;
    }

    await db.updateOrderInDB(supabase, order.id, "rejected");
  }
}

/**
 * Process all pending LIMIT orders for a game.
 * - Loads pending LIMIT orders
 * - Loads latest prices for required symbols
 * - Loads open positions (for BUY merge + SELL reduce/close)
 * - Routes each order to BUY or SELL handler if the limit condition is met
 *
 * Notes:
 * - If limit is NOT hit, order stays pending (we do NOT reject it).
 * - If no price is available for a symbol this tick, order stays pending.
 *
 * @param supabase - Supabase client instance
 * @param gameId - The game ID to process
 * @param tick - The current tick number (game state)
 */
export async function processLimitOrders(
  supabase: SupabaseClient,
  gameId: string,
  tick: number
): Promise<void> {
  const limitOrders = await db.fetchOrdersFromDB(supabase, gameId, "pending", "LIMIT");
  if (limitOrders.length === 0) return;

  const symbols = Array.from(new Set(limitOrders.map((o) => o.symbol)));
  const priceBySymbol = await getLatestPricesBySymbol(supabase, symbols);

  const openPositions = await db.fetchPositionsFromDB(supabase, gameId, "open");
  const posByKey = new Map(openPositions.map((p) => [`${p.player_id}:${p.symbol}`, p]));

  for (const order of limitOrders) {
    const fillPrice = priceBySymbol.get(order.symbol);
    if (fillPrice == null) continue; // keep pending

    const qty = Number(order.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      await db.updateOrderInDB(supabase, order.id, "rejected");
      continue;
    }

    const limitPrice = Number(order.price);
    if (!Number.isFinite(limitPrice) || limitPrice <= 0) {
      await db.updateOrderInDB(supabase, order.id, "rejected");
      continue;
    }

    // BUY LIMIT triggers when last <= limit
    if (order.side === "BUY") {
      if (fillPrice <= limitPrice) {
        await handleBuyLimitOrder(supabase, gameId, tick, order, qty, fillPrice, posByKey);
      }
      continue; // else keep pending
    }

    // SELL LIMIT triggers when last >= limit
    if (order.side === "SELL") {
      if (fillPrice >= limitPrice) {
        await handleSellLimitOrder(supabase, gameId, tick, order, qty, fillPrice, posByKey);
      }
      continue; // else keep pending
    }

    await db.updateOrderInDB(supabase, order.id, "rejected");
  }
}

/**
 * Process all pending conditional orders (TAKE_PROFIT + STOP_LOSS) for a game.
 * - Loads all orders and filters pending TP/SL
 * - Loads open positions once for position lookups
 * - Loads latest prices once per symbol used by TP/SL orders
 * - Evaluates each TP order then each SL order
 *
 * @param supabase - Supabase client instance
 * @param gameId - The game ID to process
 * @param tick - The current tick number (game state)
 */
export async function processConditionalOrders(
  supabase: SupabaseClient,
  gameId: string,
  tick: number
): Promise<void> {
  const allOrders = await db.fetchOrdersFromDB(supabase, gameId);

  const takeProfitOrders = allOrders.filter(
    (o) => o.order_type === "TAKE_PROFIT" && o.status === "pending"
  );

  const stopLossOrders = allOrders.filter(
    (o) => o.order_type === "STOP_LOSS" && o.status === "pending"
  );

  if (takeProfitOrders.length === 0 && stopLossOrders.length === 0) return;

  const openPositions = await db.fetchPositionsFromDB(supabase, gameId, "open");
  const posById = new Map(openPositions.map((p) => [p.id, p]));

  const symbols = Array.from(
    new Set([...takeProfitOrders, ...stopLossOrders].map((o) => o.symbol))
  );
  const priceBySymbol = await getLatestPricesBySymbol(supabase, symbols);

  for (const o of takeProfitOrders) {
    await handleTakeProfitOrder(supabase, gameId, tick, o, posById, priceBySymbol);
  }

  for (const o of stopLossOrders) {
    await handleStopLossOrder(supabase, gameId, tick, o, posById, priceBySymbol);
  }
}

// --------------------
// Helper functions
// --------------------

/**
 * Recalculate and update equity for a single player based on their current balance and open positions.
 * This is called after positions are closed/updated to ensure equity is immediately correct.
 *
 * @param supabase - Supabase client instance
 * @param gameId - Game ID
 * @param playerId - Player user ID
 * @param currentBalance - Current balance (already updated)
 */
async function recalculatePlayerEquity(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  currentBalance: number
): Promise<void> {
  // Fetch all remaining open positions for this player
  const openPositions = await db.fetchPositionsFromDB(supabase, gameId, "open");
  const playerOpenPositions = openPositions.filter((pos: any) => pos.player_id === playerId);

  // Sum unrealized P&L from remaining open positions
  const totalUnrealizedPnl = playerOpenPositions.reduce((sum: number, pos: any) => {
    const pnl = Number(pos.unrealized_pnl ?? 0);
    return sum + (Number.isFinite(pnl) ? pnl : 0);
  }, 0);

  // Calculate new equity = balance + unrealized P&L from remaining open positions
  const newEquity = currentBalance + totalUnrealizedPnl;

  // Update balance and equity
  await db.updateGamePlayerBalanceInDB(supabase, gameId, playerId, currentBalance, newEquity);
}

// --------------------
// Handle functions
// --------------------

/**
 * Handle a single BUY market order.
 * - Checks balance using checkBalanceForBuy
 * - Marks order filled + logs execution
 * - Creates/merges position
 * - Debits player cash balance
 *
 * @param supabase - Supabase client instance
 * @param gameId - Game ID
 * @param tick - Tick number
 * @param order - Order row
 * @param qty - Qty
 * @param fillPrice - Fill price (latest)
 * @param posByKey - Map of open positions keyed by `${player_id}:${symbol}`
 */
async function handleBuyMarketOrder(
  supabase: SupabaseClient,
  gameId: string,
  tick: number,
  order: any,
  qty: number,
  fillPrice: number,
  posByKey: Map<string, any>
): Promise<void> {
  const canBuy = await checkBalanceForBuy(supabase, gameId, order.player_id, qty, fillPrice);
  if (!canBuy) {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  const players = await db.fetchGamePlayersFromDB(supabase, gameId, order.player_id);
  const player = players[0];
  if (!player) {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  await db.updateOrderInDB(supabase, order.id, "filled", fillPrice);

  await db.insertOrderExecutionInDB(
    supabase,
    order.id,
    gameId,
    order.player_id,
    order.symbol,
    "BUY",
    qty,
    fillPrice,
    tick
  );

  const key = `${order.player_id}:${order.symbol}`;
  const existing = posByKey.get(key);

  if (!existing) {
    const created = await db.insertPositionInDB(
      supabase,
      gameId,
      order.player_id,
      order.symbol,
      "BUY",
      qty,
      fillPrice,
      1
    );
    posByKey.set(key, created);
  } else {
    const oldQty = Number(existing.quantity);
    const oldEntry = Number(existing.entry_price);

    const newQty = oldQty + qty;
    const newEntry = (oldQty * oldEntry + qty * fillPrice) / newQty;

    await db.updatePositionInDB(supabase, existing.id, {
      quantity: newQty,
      entryPrice: newEntry,
    });

    existing.quantity = newQty as any;
    existing.entry_price = newEntry as any;
    posByKey.set(key, existing);
  }

  const cost = qty * fillPrice;
  const newBalance = Number(player.balance) - cost;

  // Recalculate equity based on all open positions (including the newly created/updated one)
  await recalculatePlayerEquity(supabase, gameId, order.player_id, newBalance);
}

/**
 * Handle a single SELL market order.
 * - Checks position size using checkPositionsForSell
 * - Marks order filled + logs execution
 * - Reduces/closes position
 * - Credits player cash balance with proceeds
 *
 * @param supabase - Supabase client instance
 * @param gameId - Game ID
 * @param tick - Tick number
 * @param order - Order row
 * @param qty - Qty
 * @param fillPrice - Fill price (latest)
 * @param posByKey - Map of open positions keyed by `${player_id}:${symbol}`
 */
async function handleSellMarketOrder(
  supabase: SupabaseClient,
  gameId: string,
  tick: number,
  order: any,
  qty: number,
  fillPrice: number,
  posByKey: Map<string, any>
): Promise<void> {
  const canSell = await checkPositionsForSell(supabase, gameId, order.player_id, qty, order.symbol);
  if (!canSell) {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  const key = `${order.player_id}:${order.symbol}`;
  const pos = posByKey.get(key);

  if (!pos || pos.side !== "BUY" || pos.status !== "open") {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  const posQty = Number(pos.quantity);
  if (!Number.isFinite(posQty) || posQty <= 0 || qty > posQty) {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  await db.updateOrderInDB(supabase, order.id, "filled", fillPrice);

  await db.insertOrderExecutionInDB(
    supabase,
    order.id,
    gameId,
    order.player_id,
    order.symbol,
    "SELL",
    qty,
    fillPrice,
    tick
  );

  const players = await db.fetchGamePlayersFromDB(supabase, gameId, order.player_id);
  const player = players[0];
  if (!player) {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  const remainingQty = posQty - qty;

  // Update position first (before recalculating equity)
  if (remainingQty <= 0) {
    await db.updatePositionInDB(supabase, pos.id, {
      status: "closed",
      currentPrice: fillPrice,
    });
    posByKey.delete(key);
  } else {
    await db.updatePositionInDB(supabase, pos.id, {
      quantity: remainingQty,
      currentPrice: fillPrice,
    });
    pos.quantity = remainingQty as any;
    posByKey.set(key, pos);
  }

  // Calculate new balance and recalculate equity based on remaining open positions
  const proceeds = fillPrice * qty;
  const newBalance = Number(player.balance) + proceeds;
  await recalculatePlayerEquity(supabase, gameId, order.player_id, newBalance);
}

/**
 * Handle a single BUY limit order.
 * - Checks balance using checkBalanceForBuy
 * - Marks order filled + logs execution
 * - Creates/merges position
 * - Debits player cash balance
 *
 * @param supabase - Supabase client instance
 * @param gameId - Game ID
 * @param tick - Tick number
 * @param order - Order row
 * @param qty - Qty
 * @param fillPrice - Fill price (latest, and should be <= limit to get here)
 * @param posByKey - Map of open positions keyed by `${player_id}:${symbol}`
 */
async function handleBuyLimitOrder(
  supabase: SupabaseClient,
  gameId: string,
  tick: number,
  order: any,
  qty: number,
  fillPrice: number,
  posByKey: Map<string, any>
): Promise<void> {
  const canBuy = await checkBalanceForBuy(supabase, gameId, order.player_id, qty, fillPrice);
  if (!canBuy) {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  const players = await db.fetchGamePlayersFromDB(supabase, gameId, order.player_id);
  const player = players[0];
  if (!player) {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  await db.updateOrderInDB(supabase, order.id, "filled", fillPrice);

  await db.insertOrderExecutionInDB(
    supabase,
    order.id,
    gameId,
    order.player_id,
    order.symbol,
    "BUY",
    qty,
    fillPrice,
    tick
  );

  const key = `${order.player_id}:${order.symbol}`;
  const existing = posByKey.get(key);

  if (!existing) {
    const created = await db.insertPositionInDB(
      supabase,
      gameId,
      order.player_id,
      order.symbol,
      "BUY",
      qty,
      fillPrice,
      1
    );
    posByKey.set(key, created);
  } else {
    const oldQty = Number(existing.quantity);
    const oldEntry = Number(existing.entry_price);

    const newQty = oldQty + qty;
    const newEntry = (oldQty * oldEntry + qty * fillPrice) / newQty;

    await db.updatePositionInDB(supabase, existing.id, {
      quantity: newQty,
      entryPrice: newEntry,
    });

    existing.quantity = newQty as any;
    existing.entry_price = newEntry as any;
    posByKey.set(key, existing);
  }

  const cost = qty * fillPrice;
  const newBalance = Number(player.balance) - cost;

  // Recalculate equity based on all open positions (including the newly created/updated one)
  await recalculatePlayerEquity(supabase, gameId, order.player_id, newBalance);
}

/**
 * Handle a single SELL limit order.
 * - Checks position size using checkPositionsForSell
 * - Marks order filled + logs execution
 * - Reduces/closes position
 * - Credits player cash balance with proceeds
 *
 * @param supabase - Supabase client instance
 * @param gameId - Game ID
 * @param tick - Tick number
 * @param order - Order row
 * @param qty - Qty
 * @param fillPrice - Fill price (latest, and should be >= limit to get here)
 * @param posByKey - Map of open positions keyed by `${player_id}:${symbol}`
 */
async function handleSellLimitOrder(
  supabase: SupabaseClient,
  gameId: string,
  tick: number,
  order: any,
  qty: number,
  fillPrice: number,
  posByKey: Map<string, any>
): Promise<void> {
  const canSell = await checkPositionsForSell(supabase, gameId, order.player_id, qty, order.symbol);
  if (!canSell) {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  const key = `${order.player_id}:${order.symbol}`;
  const pos = posByKey.get(key);

  if (!pos || pos.side !== "BUY" || pos.status !== "open") {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  const posQty = Number(pos.quantity);
  if (!Number.isFinite(posQty) || posQty <= 0 || qty > posQty) {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  await db.updateOrderInDB(supabase, order.id, "filled", fillPrice);

  await db.insertOrderExecutionInDB(
    supabase,
    order.id,
    gameId,
    order.player_id,
    order.symbol,
    "SELL",
    qty,
    fillPrice,
    tick
  );

  const players = await db.fetchGamePlayersFromDB(supabase, gameId, order.player_id);
  const player = players[0];
  if (!player) {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  const remainingQty = posQty - qty;

  // Update position first (before recalculating equity)
  if (remainingQty <= 0) {
    await db.updatePositionInDB(supabase, pos.id, {
      status: "closed",
      currentPrice: fillPrice,
    });
    posByKey.delete(key);
  } else {
    await db.updatePositionInDB(supabase, pos.id, {
      quantity: remainingQty,
      currentPrice: fillPrice,
    });
    pos.quantity = remainingQty as any;
    posByKey.set(key, pos);
  }

  // Calculate new balance and recalculate equity based on remaining open positions
  const proceeds = fillPrice * qty;
  const newBalance = Number(player.balance) + proceeds;
  await recalculatePlayerEquity(supabase, gameId, order.player_id, newBalance);
}

/**
 * Handle a single TAKE_PROFIT order (v1 long-only).
 * - Must link to an open BUY position
 * - Triggers when price >= trigger_price
 * - Executes a SELL of order.quantity (or full position if quantity is null)
 *
 * @param supabase - Supabase client instance
 * @param gameId - Game ID
 * @param tick - Tick number
 * @param order - Order row
 * @param posById - Map of open positions by position ID
 * @param priceBySymbol - Map(symbol -> latest price)
 */
async function handleTakeProfitOrder(
  supabase: SupabaseClient,
  gameId: string,
  tick: number,
  order: any,
  posById: Map<string, any>,
  priceBySymbol: Map<string, number>
): Promise<void> {
  if (!order.position_id) {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  const pos = posById.get(order.position_id);
  if (!pos || pos.status !== "open" || pos.side !== "BUY") {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  const trigger = Number(order.trigger_price);
  if (!Number.isFinite(trigger) || trigger <= 0) {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  const px = priceBySymbol.get(order.symbol);
  if (px == null) return; // keep pending

  if (px < trigger) return; // not hit yet

  const posQty = Number(pos.quantity);
  if (!Number.isFinite(posQty) || posQty <= 0) {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  const orderQty = order.quantity == null ? posQty : Number(order.quantity);
  if (!Number.isFinite(orderQty) || orderQty <= 0 || orderQty > posQty) {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  const players = await db.fetchGamePlayersFromDB(supabase, gameId, order.player_id);
  const player = players[0];
  if (!player) {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  await db.updateOrderInDB(supabase, order.id, "filled", px);

  await db.insertOrderExecutionInDB(
    supabase,
    order.id,
    gameId,
    order.player_id,
    order.symbol,
    "SELL",
    orderQty,
    px,
    tick
  );

  const entry = Number(pos.entry_price);
  const pnl = (px - entry) * orderQty;

  const remainingQty = posQty - orderQty;

  // Update position first (before recalculating equity)
  if (remainingQty <= 0) {
    await db.updatePositionInDB(supabase, pos.id, {
      status: "closed",
      currentPrice: px,
      unrealizedPnl: pnl,
    });
    posById.delete(pos.id);
  } else {
    await db.updatePositionInDB(supabase, pos.id, {
      quantity: remainingQty,
      currentPrice: px,
    });
    pos.quantity = remainingQty as any;
    posById.set(pos.id, pos);
  }

  // Calculate new balance and recalculate equity based on remaining open positions
  const proceeds = px * orderQty;
  const newBalance = Number(player.balance) + proceeds;
  await recalculatePlayerEquity(supabase, gameId, order.player_id, newBalance);
}

/**
 * Handle a single STOP_LOSS order (v1 long-only).
 * - Must link to an open BUY position
 * - Triggers when price <= trigger_price
 * - Executes a SELL of order.quantity (or full position if quantity is null)
 *
 * @param supabase - Supabase client instance
 * @param gameId - Game ID
 * @param tick - Tick number
 * @param order - Order row
 * @param posById - Map of open positions by position ID
 * @param priceBySymbol - Map(symbol -> latest price)
 */
async function handleStopLossOrder(
  supabase: SupabaseClient,
  gameId: string,
  tick: number,
  order: any,
  posById: Map<string, any>,
  priceBySymbol: Map<string, number>
): Promise<void> {
  if (!order.position_id) {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  const pos = posById.get(order.position_id);
  if (!pos || pos.status !== "open" || pos.side !== "BUY") {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  const trigger = Number(order.trigger_price);
  if (!Number.isFinite(trigger) || trigger <= 0) {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  const px = priceBySymbol.get(order.symbol);
  if (px == null) return; // keep pending

  if (px > trigger) return; // not hit yet

  const posQty = Number(pos.quantity);
  if (!Number.isFinite(posQty) || posQty <= 0) {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  const orderQty = order.quantity == null ? posQty : Number(order.quantity);
  if (!Number.isFinite(orderQty) || orderQty <= 0 || orderQty > posQty) {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  const players = await db.fetchGamePlayersFromDB(supabase, gameId, order.player_id);
  const player = players[0];
  if (!player) {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  await db.updateOrderInDB(supabase, order.id, "filled", px);

  await db.insertOrderExecutionInDB(
    supabase,
    order.id,
    gameId,
    order.player_id,
    order.symbol,
    "SELL",
    orderQty,
    px,
    tick
  );

  const entry = Number(pos.entry_price);
  const pnl = (px - entry) * orderQty;

  const remainingQty = posQty - orderQty;

  if (remainingQty <= 0) {
    await db.updatePositionInDB(supabase, pos.id, {
      status: "closed",
      currentPrice: px,
      unrealizedPnl: pnl,
    });
    posById.delete(pos.id);
  } else {
    await db.updatePositionInDB(supabase, pos.id, {
      quantity: remainingQty,
      currentPrice: px,
    });
    pos.quantity = remainingQty as any;
    posById.set(pos.id, pos);
  }

  const proceeds = px * orderQty;
  const newBalance = Number(player.balance) + proceeds;

  // Recalculate equity based on remaining open positions
  await recalculatePlayerEquity(supabase, gameId, order.player_id, newBalance);
}

// --------------------
// Update functions (YOUR “UPDATE” STUFF)
// --------------------

/**
 * Update all open positions for a game with latest prices and unrealized P&L.
 * - Loads all open positions
 * - Loads latest price for each symbol
 * - Computes unrealized P&L per position
 * - Updates each position's current_price and unrealized_pnl
 *
 * @param supabase - Supabase client instance
 * @param gameId - Game ID
 */
export async function updatePositions(
  supabase: SupabaseClient,
  gameId: string
): Promise<void> {
  const openPositions = await db.fetchPositionsFromDB(supabase, gameId, "open");
  if (openPositions.length === 0) return;

  const symbols = Array.from(new Set(openPositions.map((p: any) => p.symbol)));
  const priceBySymbol = await getLatestPricesBySymbol(supabase, symbols);

  for (const pos of openPositions) {
    const last = priceBySymbol.get(pos.symbol);
    if (last == null) continue;

    const qty = Number(pos.quantity);
    const entry = Number(pos.entry_price);
    const lev = Number(pos.leverage ?? 1);

    if (!Number.isFinite(qty) || qty <= 0) continue;
    if (!Number.isFinite(entry) || entry <= 0) continue;
    if (!Number.isFinite(lev) || lev <= 0) continue;

    const unrealizedPnl =
      pos.side === "BUY"
        ? (last - entry) * qty * lev
        : pos.side === "SELL"
        ? (entry - last) * qty * lev
        : 0;

    await db.updatePositionInDB(supabase, pos.id, {
      currentPrice: last,
      unrealizedPnl,
    });
  }
}

/**
 * Update all players' equity for a game.
 * - Sums unrealized P&L across all open positions per player
 * - Sets equity = balance + total unrealized P&L
 *
 * @param supabase - Supabase client instance
 * @param gameId - Game ID
 */
export async function updatePlayerBalances(
  supabase: SupabaseClient,
  gameId: string
): Promise<void> {
  const openPositions = await db.fetchPositionsFromDB(supabase, gameId, "open");

  const unrealisedByPlayer = new Map<string, number>();
  for (const pos of openPositions) {
    const pnl = Number(pos.unrealized_pnl ?? 0);
    unrealisedByPlayer.set(
      pos.player_id,
      (unrealisedByPlayer.get(pos.player_id) ?? 0) + (Number.isFinite(pnl) ? pnl : 0)
    );
  }

  const players = await db.fetchGamePlayersFromDB(supabase, gameId);

  for (const p of players) {
    const balance = Number(p.balance ?? 0);
    const unrealised = unrealisedByPlayer.get(p.user_id) ?? 0;
    const equity = balance + unrealised;

    // IMPORTANT: Only update equity here, NOT balance!
    // Balance is already correctly updated by recalculatePlayerEquity in order handlers.
    // This function is called after updatePositions to refresh equity based on updated unrealized P&L.
    // We use updateGamePlayerEquityInDB to avoid overwriting correctly updated balances from order processing.
    await db.updateGamePlayerEquityInDB(supabase, gameId, p.user_id, equity);
  }
}

/**
 * Record equity history for all players for a given tick.
 * - Loads all game players
 * - Inserts a row into equity_history for each player
 *
 * @param supabase - Supabase client instance
 * @param gameId - Game ID
 * @param tick - Tick number
 */
export async function updateEquityHistory(
  supabase: SupabaseClient,
  gameId: string,
  tick: number
): Promise<void> {
  const players = await db.fetchGamePlayersFromDB(supabase, gameId);
  if (players.length === 0) return;

  for (const p of players) {
    const balance = Number(p.balance);
    const equity = Number(p.equity);

    await db.insertEquityHistoryInDB(supabase, gameId, p.user_id, tick, balance, equity);
  }
}

/**
 * Close all open positions for a game at the end of the trading day (end of game).
 * - Rejects all pending orders
 * - Fetches latest prices for all symbols
 * - Closes each position at market price and realizes P&L
 * - Credits proceeds back to player balances
 * - Updates final equity (which equals balance after all positions closed)
 *
 * @param supabase - Supabase client instance
 * @param gameId - Game ID to close positions for
 * @param tick - Current tick number when the game ends
 */

export async function closeAllOpenPositions(
  supabase: SupabaseClient,
  gameId: string,
  tick: number
): Promise<void> {
  // Fetch all open positions
  const openPositions = await db.fetchPositionsFromDB(supabase, gameId, "open");
  if (openPositions.length === 0) return;

  // Reject any remaining pending orders (recommended at game end)
  const pendingOrders = await db.fetchOrdersFromDB(supabase, gameId, "pending");
  await Promise.all(pendingOrders.map((o) => db.updateOrderInDB(supabase, o.id, "rejected")));

  // 3) Latest prices for all symbols 
  const symbols = Array.from(new Set(openPositions.map((p: any) => p.symbol)));
  const priceBySymbol = await getLatestPricesBySymbol(supabase, symbols);

  // Load players' current balances (cash)
  const players = await db.fetchGamePlayersFromDB(supabase, gameId);
  const newBalanceByPlayer = new Map<string, number>(
    players.map((p: any) => [p.user_id, Number(p.balance ?? 0)])
  );

  // Close each position and credit proceeds
  for (const pos of openPositions as any[]) {
    const playerId = pos.player_id;
    const qty = Number(pos.quantity);
    const entry = Number(pos.entry_price);

    // Try to get price from database, fallback to position's current_price or entry_price
    let closePx = priceBySymbol.get(pos.symbol);
    if (closePx == null || !Number.isFinite(closePx) || closePx <= 0) {
      // Fallback to position's current_price if available
      closePx = Number(pos.current_price);
      if (!Number.isFinite(closePx) || closePx <= 0) {
        // Last resort: use entry_price
        closePx = entry;
        console.warn(`[closeAllOpenPositions] No price found for ${pos.symbol}, using entry_price: ${closePx}`);
      } else {
        console.warn(`[closeAllOpenPositions] No DB price for ${pos.symbol}, using current_price: ${closePx}`);
      }
    }

    if (!Number.isFinite(qty) || qty <= 0) continue;
    if (!Number.isFinite(entry) || entry <= 0) continue;
    if (!Number.isFinite(closePx) || closePx <= 0) {
      console.error(`[closeAllOpenPositions] Cannot close position ${pos.id} for ${pos.symbol}: invalid price ${closePx}`);
      continue;
    }

    // Realized P&L (no leverage)
    const pnl =
      pos.side === "BUY"
        ? (closePx - entry) * qty
        : pos.side === "SELL"
        ? (entry - closePx) * qty
        : 0;

    // Mark position closed
    await db.updatePositionInDB(supabase, pos.id, {
      status: "closed",
      currentPrice: closePx,
      unrealizedPnl: pnl, 
    });

    // Update player's CASH balance 
    const prevBal = newBalanceByPlayer.get(playerId) ?? 0;

    if (pos.side === "BUY") {
      newBalanceByPlayer.set(playerId, prevBal + closePx * qty);
    } else {
      
      newBalanceByPlayer.set(playerId, prevBal);
    }
  }

  // After closing all positions, equity == balance (no open positions left)
  await Promise.all(
    Array.from(newBalanceByPlayer.entries()).map(([playerId, bal]) =>
      db.updateGamePlayerBalanceInDB(supabase, gameId, playerId, bal, bal)
    )
  );
}

/**
 * Determine and set the winner of a completed game.
 * - Fetches all players for the game
 * - Finds the player with the highest equity
 * - Updates the game status to "completed" with the winner_id
 *
 * @param supabase - Supabase client instance
 * @param gameId - Game ID to determine winner for
 */
export async function checkAndSetGameWinner(supabase: SupabaseClient, gameId: string): Promise<void> {
  const players = await db.fetchGamePlayersFromDB(supabase, gameId);

  if (players.length === 0) {
    return;
  }

  // Find the player with the highest equity
  let winner = players[0];
  let maxEquity = Number(winner.equity ?? 0);

  for (const player of players) {
    const equity = Number(player.equity ?? 0);
    if (equity > maxEquity) {
      maxEquity = equity;
      winner = player;
    }
  }

  // Update the game with the winner
  await db.updateGameStatusInDB(supabase, gameId, "completed", winner.user_id);
}


 
// --------------------
// Orchestrator
// --------------------

/**
 * Process a game tick for a single game.
 *
 * Order (recommended):
 * 1) Market orders
 * 2) Limit orders
 * 3) Update positions (mark-to-market)
 * 4) Update equity
 * 5) Conditional orders (TP/SL)
 * 6) Record equity history
 *
 * @param gameId - Game ID
 * @param gameState - Tick number
 * @param supabase - Supabase client instance
 */
export async function processGameTick(
  gameId: string,
  gameState: number,
  supabase: SupabaseClient
): Promise<void> {
  console.log(`Processing game tick for game ${gameId} at game state ${gameState}`);

  await processMarketOrders(supabase, gameId, gameState);
  await processLimitOrders(supabase, gameId, gameState);

  await updatePositions(supabase, gameId);
  await updatePlayerBalances(supabase, gameId);

  await processConditionalOrders(supabase, gameId, gameState);

  await updateEquityHistory(supabase, gameId, gameState);

  console.log(`Completed game tick processing for game ${gameId}`);
}
