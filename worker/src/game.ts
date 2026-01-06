import type { SupabaseClient } from "@supabase/supabase-js";
import * as db from "./db";

// Get latest price from database
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
 * Process all pending MARKET orders for a game.
 * - Loads pending MARKET orders
 * - Loads latest prices for required symbols
 * - Loads open positions (for BUY merge + SELL reduce/close)
 * - Routes each order to BUY or SELL handler
 *
 * Notes:
 * - If no price is available for a symbol this tick, the order remains pending.
 * - Balance/equity updates happen inside handlers, and equity is recalculated later.
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
  // Fetch pending market orders
  const marketOrders = await db.fetchOrdersFromDB(supabase, gameId, "pending", "MARKET");
  if (marketOrders.length === 0) return;

  // Preload latest prices (1 per symbol)
  const symbols = Array.from(new Set(marketOrders.map((o) => o.symbol)));
  const priceBySymbol = await getLatestPricesBySymbol(supabase, symbols);

  // 3) Preload open positions for quick lookup (player+symbol)
  const openPositions = await db.fetchPositionsFromDB(supabase, gameId, "open");
  const posByKey = new Map(openPositions.map((p) => [`${p.player_id}:${p.symbol}`, p]));

  // Process each order
  for (const order of marketOrders) {
    const fillPrice = priceBySymbol.get(order.symbol);
    if (fillPrice == null) continue; // no price this tick => keep pending

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

    // unknown side
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
  // Load pending conditional orders
  const allOrders = await db.fetchOrdersFromDB(supabase, gameId);

  const takeProfitOrders = allOrders.filter(
    (o) => o.order_type === "TAKE_PROFIT" && o.status === "pending"
  );

  const stopLossOrders = allOrders.filter(
    (o) => o.order_type === "STOP_LOSS" && o.status === "pending"
  );

  if (takeProfitOrders.length === 0 && stopLossOrders.length === 0) return;

  // Load open positions once (we only trigger TP/SL against open positions)
  const openPositions = await db.fetchPositionsFromDB(supabase, gameId, "open");
  const posById = new Map(openPositions.map((p) => [p.id, p]));

  // Load latest prices once per symbol used by conditional orders
  const symbols = Array.from(
    new Set([...takeProfitOrders, ...stopLossOrders].map((o) => o.symbol))
  );
  const priceBySymbol = await getLatestPricesBySymbol(supabase, symbols);

  // Handle TP then SL (keep consistent ordering)
  for (const o of takeProfitOrders) {
    await handleTakeProfitOrder(supabase, gameId, tick, o, posById, priceBySymbol);
  }

  for (const o of stopLossOrders) {
    await handleStopLossOrder(supabase, gameId, tick, o, posById, priceBySymbol);
  }
}

/**
 * Handle a single STOP_LOSS order.
 * - Validates order links to an open position
 * - Checks trigger condition using latest price
 * - Ensures the order does not oversell the position
 * - Fills order + logs execution
 * - Closes or partially reduces the position
 * - Credits player's balance with sale proceeds
 *
 * @param supabase - Supabase client instance
 * @param gameId - The game ID to process
 * @param tick - The current tick number (game state)
 * @param order - The stop loss order row
 * @param posById - Map of open positions by position ID
 * @param priceBySymbol - Map of latest prices by symbol
 */
async function handleStopLossOrder(
  supabase: SupabaseClient,
  gameId: string,
  tick: number,
  order: any,
  posById: Map<string, any>,
  priceBySymbol: Map<string, number>
): Promise<void> {
  // Must link to a position
  if (!order.position_id) {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  const pos = posById.get(order.position_id);
  if (!pos || pos.status !== "open") {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  // v1: long-only
  if (pos.side !== "BUY") {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  const trigger = Number(order.trigger_price);
  if (!Number.isFinite(trigger)) {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  const px = priceBySymbol.get(order.symbol);
  if (px == null) return; // no price this tick -> leave pending

  // SL condition for a long: trigger when price <= stop
  if (px > trigger) return;

  // Quantity rules: SL should not oversell the position
  const posQty = Number(pos.quantity);
  if (!Number.isFinite(posQty) || posQty <= 0) {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  const orderQty = order.quantity == null ? posQty : Number(order.quantity);
  if (!Number.isFinite(orderQty) || orderQty <= 0) {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  if (orderQty > posQty) {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  // Player must exist so we can credit cash
  const players = await db.fetchGamePlayersFromDB(supabase, gameId, order.player_id);
  const player = players[0];
  if (!player) {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  // 1) Fill order at current price
  await db.updateOrderInDB(supabase, order.id, "filled", px);

  // 2) Execution log
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

  // 3) Close (or reduce) position
  const entry = Number(pos.entry_price);
  const pnl = (px - entry) * orderQty;

  if (orderQty === posQty) {
    // full close
    await db.updatePositionInDB(supabase, pos.id, {
      status: "closed",
      currentPrice: px,
      unrealizedPnl: pnl, // using this as realised-on-close is fine for v1
    });

    posById.delete(pos.id);
  } else {
    // v1 option B: allow partial close
    const remainingQty = posQty - orderQty;

    await supabase
      .from("positions")
      .update({
        quantity: remainingQty,
        current_price: px,
        updated_at: new Date().toISOString(),
      })
      .eq("id", pos.id);

    pos.quantity = remainingQty as any;
  }

  // 4) Credit cash balance with proceeds
  const proceeds = px * orderQty;
  const newBalance = Number(player.balance) + proceeds;

  // keep equity as-is; updateEquity() recalculates after updatePositions
  await db.updateGamePlayerBalanceInDB(
    supabase,
    gameId,
    order.player_id,
    newBalance,
    Number(player.equity)
  );
}

/**
 * Handle a single TAKE_PROFIT order.
 * - Validates order links to an open position
 * - Checks trigger condition using latest price
 * - Ensures the order does not oversell the position
 * - Fills order + logs execution
 * - Closes or partially reduces the position
 * - Credits player's balance with sale proceeds
 *
 * @param supabase - Supabase client instance
 * @param gameId - The game ID to process
 * @param tick - The current tick number (game state)
 * @param order - The take profit order row
 * @param posById - Map of open positions by position ID
 * @param priceBySymbol - Map of latest prices by symbol
 */
async function handleTakeProfitOrder(
  supabase: SupabaseClient,
  gameId: string,
  tick: number,
  order: any,
  posById: Map<string, any>,
  priceBySymbol: Map<string, number>
): Promise<void> {
  // Must link to a position
  if (!order.position_id) {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  const pos = posById.get(order.position_id);
  if (!pos || pos.status !== "open") {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  // v1: long-only
  if (pos.side !== "BUY") {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  const trigger = Number(order.trigger_price);
  if (!Number.isFinite(trigger)) {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  const px = priceBySymbol.get(order.symbol);
  if (px == null) return;

  // TP condition for a long: trigger when price >= take profit
  if (px < trigger) return;

  const posQty = Number(pos.quantity);
  if (!Number.isFinite(posQty) || posQty <= 0) {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  const orderQty = order.quantity == null ? posQty : Number(order.quantity);
  if (!Number.isFinite(orderQty) || orderQty <= 0) {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  if (orderQty > posQty) {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  const players = await db.fetchGamePlayersFromDB(supabase, gameId, order.player_id);
  const player = players[0];
  if (!player) {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  // 1) Fill order at current price
  await db.updateOrderInDB(supabase, order.id, "filled", px);

  // 2) Execution log
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

  // 3) Close (or reduce) position
  const entry = Number(pos.entry_price);
  const pnl = (px - entry) * orderQty;

  if (orderQty === posQty) {
    // full close
    await db.updatePositionInDB(supabase, pos.id, {
      status: "closed",
      currentPrice: px,
      unrealizedPnl: pnl,
    });

    posById.delete(pos.id);
  } else {
    const remainingQty = posQty - orderQty;

    await supabase
      .from("positions")
      .update({
        quantity: remainingQty,
        current_price: px,
        updated_at: new Date().toISOString(),
      })
      .eq("id", pos.id);

    pos.quantity = remainingQty as any;
  }

  // 4) Credit cash balance with proceeds
  const proceeds = px * orderQty;
  const newBalance = Number(player.balance) + proceeds;

  await db.updateGamePlayerBalanceInDB(
    supabase,
    gameId,
    order.player_id,
    newBalance,
    Number(player.equity)
  );
}

/**
 * Handle a single BUY market order.
 * - Checks the player exists and has sufficient balance
 * - Marks order as filled and logs execution
 * - Creates a new position if none exists, otherwise merges into existing position
 * - Updates player's balance (equity recalculated later)
 *
 * @param supabase - Supabase client instance
 * @param gameId - The game ID to process
 * @param tick - The current tick number (game state)
 * @param order - The market order row
 * @param qty - Parsed numeric quantity
 * @param fillPrice - Latest price used for filling
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
  const key = `${order.player_id}:${order.symbol}`;
  const existing = posByKey.get(key);

  // Fetch the specific player with the order
  const players = await db.fetchGamePlayersFromDB(supabase, gameId);
  const player = players.find((p) => p.user_id === order.player_id);

  // Reject if the player does not exist
  if (!player) {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  // Player balance and notional (qty * fillPrice)
  const balance = Number(player.balance);
  const notional = qty * fillPrice;

  // Check for sufficient funds, if rejected exit function
  if (balance < notional) {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  // Update the order in the database as filled
  await db.updateOrderInDB(supabase, order.id, "filled", fillPrice);

  // Insert an order execution in the database
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

  // If there does not exist a position already for the order, insert a new position
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
    // If there already is an existing position, recalibrate new sizing into position
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
}

/**
 * Handle a single SELL market order.
 * - Validates there is an open long position to sell against
 * - Rejects overselling the current position size
 * - Marks order as filled and logs execution
 * - Credits player's balance with proceeds
 * - Reduces or fully closes the position (entry price unchanged)
 *
 * @param supabase - Supabase client instance
 * @param gameId - The game ID to process
 * @param tick - The current tick number (game state)
 * @param order - The market order row
 * @param qty - Parsed numeric quantity
 * @param fillPrice - Latest price used for filling
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
  const key = `${order.player_id}:${order.symbol}`;
  const pos = posByKey.get(key);

  // Must have an open long to sell
  if (!pos || pos.side !== "BUY") {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  const posQty = Number(pos.quantity);
  if (!Number.isFinite(posQty) || posQty <= 0) {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  // Reject oversell
  if (qty > posQty) {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  // Update order in the database as filled
  await db.updateOrderInDB(supabase, order.id, "filled", fillPrice);

  // Insert Order Execution to Database
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

  // Credit player balance with proceeds
  const proceeds = fillPrice * qty;

  const players = await db.fetchGamePlayersFromDB(supabase, gameId);
  const player = players.find((p) => p.user_id === order.player_id);

  if (!player) {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  const newBalance = Number(player.balance) + proceeds;
  await db.updateGamePlayerBalanceInDB(
    supabase,
    gameId,
    order.player_id,
    newBalance,
    Number(player.equity)
  );

  // Reduce or close position
  const remainingQty = posQty - qty;

  if (remainingQty <= 0) {
    // close fully
    await db.updatePositionInDB(supabase, pos.id, {
      status: "closed",
      currentPrice: fillPrice,
    });

    posByKey.delete(key);
  } else {
    // partial close: reduce quantity (entry stays the same)
    await db.updatePositionInDB(supabase, pos.id, {
      quantity: remainingQty,
      currentPrice: fillPrice,
    });

    pos.quantity = remainingQty as any;
    posByKey.set(key, pos);
  }
}

/**
 * Update all open positions for a game with latest prices and unrealized P&L.
 * - Loads all open positions
 * - Loads latest price for each symbol
 * - Computes unrealized P&L per position
 * - Updates each position's current_price and unrealized_pnl
 *
 * @param supabase - Supabase client instance
 * @param gameId - The game ID to process
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
 * @param gameId - The game ID to process
 */
export async function updatePlayerBalances(supabase: SupabaseClient, gameId: string) {
  const openPositions = await db.fetchPositionsFromDB(supabase, gameId, "open");

  const unrealisedByPlayer = new Map<string, number>();
  for (const pos of openPositions) {
    const pnl = Number(pos.unrealized_pnl ?? 0);
    unrealisedByPlayer.set(
      pos.player_id,
      (unrealisedByPlayer.get(pos.player_id) ?? 0) + (Number.isFinite(pnl) ? pnl : 0)
    );
  }

  // load players (cash balances)
  const players = await db.fetchGamePlayersFromDB(supabase, gameId);

  // update equity = balance + unrealised
  for (const p of players) {
    const balance = Number(p.balance ?? 0);
    const unrealised = unrealisedByPlayer.get(p.user_id) ?? 0;
    const equity = balance + unrealised;

    await db.updateGamePlayerBalanceInDB(supabase, gameId, p.user_id, balance, equity);
  }
}

/**
 * Process a game tick for a single game.
 * This function orchestrates all game logic for a single tick.
 *
 * @param gameId - The ID of the game to process
 * @param gameState - The current game state (tick number)
 * @param supabase - Supabase client instance
 */
export async function processGameTick(
  gameId: string,
  gameState: number,
  supabase: SupabaseClient
): Promise<void> {
  console.log(`Processing game tick for game ${gameId} at game state ${gameState}`);

  // 1. Process market orders
  await processMarketOrders(supabase, gameId, gameState);

  // 2. Update positions with current prices and unrealized P&L
  await updatePositions(supabase, gameId);

  // 3. Update player balances and equity
  await updatePlayerBalances(supabase, gameId);

  // 4. Process conditional orders (TP/SL)
  await processConditionalOrders(supabase, gameId, gameState);

  // 5. Record equity history
  await updateEquityHistory(supabase, gameId, gameState);

  console.log(`Completed game tick processing for game ${gameId}`);
}

/**
 * Record equity history for all players for a given tick.
 * - Loads all game players
 * - Inserts a row into equity_history for each player (balance + equity at this tick)
 *
 * @param supabase - Supabase client instance
 * @param gameId - The game ID to process
 * @param tick - The current tick number (game state)
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

    await db.insertEquityHistoryInDB(
      supabase,
      gameId,
      p.user_id,
      tick,
      balance,
      equity
    );
  }
}
