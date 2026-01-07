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
 * Checks if the player has enough balance to place a buy order.
 * 
 * @param supabase - Supabase client instance
 * @param gameId - The ID of the game to check
 * @param playerId - The player placing the order
 * @param quantity - The quantity of the asset to buy
 * @param price - The price of the asset at which the player is trying to buy
 * @returns `true` if the player has enough balance, `false` otherwise
 */
async function checkBalanceForBuy(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  quantity: number,
  price: number
): Promise<boolean> {
  // Fetch the player's balance in the game
  const { data: playerData, error: playerError } = await supabase
    .from("game_players")
    .select("balance")
    .eq("game_id", gameId)
    .eq("user_id", playerId)
    .single();

  if (playerError) {
    console.error("Error fetching player data:", playerError);
    return false; // Reject if error occurs while fetching player balance
  }

  const playerBalance = Number(playerData?.balance || 0);
  const totalCost = quantity * price; // Total cost to buy the asset

  // Check if the player has enough balance to cover the cost
  if (playerBalance >= totalCost) {
    return true; // Player has enough balance
  }

  console.log(`Player ${playerId} does not have enough balance to buy ${quantity} units at ${price}`);
  return false; // Player does not have enough balance
}

/**
 * Checks if the player has enough open positions to sell.
 * 
 * @param supabase - Supabase client instance
 * @param gameId - The ID of the game to check
 * @param playerId - The player attempting to sell
 * @param quantity - The quantity of the asset to sell
 * @param symbol - The asset symbol to check for
 * @returns `true` if the player has enough open positions, `false` otherwise
 */
async function checkPositionsForSell(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  quantity: number,
  symbol: string
): Promise<boolean> {
  // Fetch the player's open position for the specified symbol
  const { data: positionData, error: positionError } = await supabase
    .from("positions")
    .select("quantity")
    .eq("game_id", gameId)
    .eq("player_id", playerId)
    .eq("symbol", symbol)
    .eq("status", "open")
    .single();

  if (positionError) {
    console.error("Error fetching position data:", positionError);
    return false; // Reject if error occurs while fetching the position data
  }

  const openPositionQty = Number(positionData?.quantity || 0);

  // Check if the player has enough open positions to sell
  if (openPositionQty >= quantity) {
    return true; // Player has enough positions to sell
  }

  console.log(`Player ${playerId} does not have enough open positions to sell ${quantity} units of ${symbol}`);
  return false; // Not enough positions to sell
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

  // Preload open positions for quick lookup (player+symbol)
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
      const canBuy = await checkBalanceForBuy(supabase, gameId, order.player_id, qty, fillPrice);
      if (!canBuy) {
        await db.updateOrderInDB(supabase, order.id, "rejected");
        continue;
      }
      await handleBuyMarketOrder(supabase, gameId, tick, order, qty, fillPrice, posByKey);
      continue;
    }

    if (order.side === "SELL") {
      const canSell = await checkPositionsForSell(supabase, gameId, order.player_id, qty, order.symbol);
      if (!canSell) {
        await db.updateOrderInDB(supabase, order.id, "rejected");
        continue;
      }
      await handleSellMarketOrder(supabase, gameId, tick, order, qty, fillPrice, posByKey);
      continue;
    }

    // unknown side
    await db.updateOrderInDB(supabase, order.id, "rejected");
  }
}

/**
 * Process all pending LIMIT orders for a game.
 * - Loads pending LIMIT orders
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
async function processLimitOrders(
  supabase: SupabaseClient,
  gameId: string,
  tick: number
): Promise<void> {
  // Fetch all open limit orders from the database
  const limitOrders = await db.fetchOrdersFromDB(supabase, gameId, "pending", "LIMIT");

  if (limitOrders.length === 0) return;

  // Preload the latest prices
  const symbols = Array.from(new Set(limitOrders.map(o => o.symbol)));
  const priceBySymbol = await getLatestPricesBySymbol(supabase, symbols);

  // Preload open positions for each player (needed for BUY merge and SELL reduce/close)
  const openPositions = await db.fetchPositionsFromDB(supabase, gameId, "open");
  const posByKey = new Map(openPositions.map(p => [`${p.player_id}:${p.symbol}`, p]));

  // Process each limit order
  for (const order of limitOrders) {
    const fillPrice = priceBySymbol.get(order.symbol);
    const limitPrice = Number(order.price);

    if (fillPrice == null) continue; // Skip if no price available for the symbol this tick

    const qty = Number(order.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      await db.updateOrderInDB(supabase, order.id, "rejected");
      continue;
    }

    if (order.side === "BUY" && fillPrice <= limitPrice) {
      const canBuy = await checkBalanceForBuy(supabase, gameId, order.player_id, qty, fillPrice);
      if (!canBuy) {
        await db.updateOrderInDB(supabase, order.id, "rejected");
        continue;
      }
      await handleBuyLimitOrder(supabase, gameId, tick, order, qty, fillPrice, posByKey);
      continue;
    }

    if (order.side === "SELL" && fillPrice >= limitPrice) {
      const canSell = await checkPositionsForSell(supabase, gameId, order.player_id, qty, order.symbol);
      if (!canSell) {
        await db.updateOrderInDB(supabase, order.id, "rejected");
        continue;
      }
      await handleSellLimitOrder(supabase, gameId, tick, order, qty, fillPrice, posByKey);
      continue;
    }

    // Unknown side, reject the order
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

async function handleBuyMarketOrder(
  supabase: SupabaseClient,
  gameId: string,
  tick: number,
  order: any,
  qty: number,
  fillPrice: number,
  posByKey: Map<string, any>
): Promise<void> {
  const limitPrice = Number(order.price);

  // Check balance for the buy order
  const balanceCheck = await checkBalanceForBuy(supabase, gameId, order.player_id, qty, fillPrice);
  if (!balanceCheck) {
    // Reject the order if the player doesn't have enough balance
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  // Get or create the position for the player
  const key = `${order.player_id}:${order.symbol}`;
  const existingPosition = posByKey.get(key);

  // If the position does not exist, create a new one
  if (!existingPosition) {
    const created = await db.insertPositionInDB(
      supabase,
      gameId,
      order.player_id,
      order.symbol,
      "BUY",
      qty,
      fillPrice,
      1 // leverage = 1 by default
    );
    posByKey.set(key, created);
  } else {
    // If the position exists, update the quantity and entry price
    const newQty = existingPosition.quantity + qty;
    const newEntryPrice = (existingPosition.entry_price * existingPosition.quantity + fillPrice * qty) / newQty;

    await db.updatePositionInDB(supabase, existingPosition.id, { quantity: newQty, entryPrice: newEntryPrice });
    existingPosition.quantity = newQty;
    existingPosition.entry_price = newEntryPrice;
    posByKey.set(key, existingPosition);
  }

  // Mark the order as filled
  await db.updateOrderInDB(supabase, order.id, "filled", fillPrice);

  // Update player's balance after the buy order
  const players = await db.fetchGamePlayersFromDB(supabase, gameId, order.player_id);
  const player = players[0];
  if (player) {
    const newBalance = player.balance - qty * fillPrice;
    await db.updateGamePlayerBalanceInDB(supabase, gameId, order.player_id, newBalance, player.equity);
  }

  // Log execution (audit trail)
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
}

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
  await db.updateGamePlayerBalanceInDB(supabase, gameId, order.player_id, newBalance, player.equity);

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
 * Handle a single BUY limit order.
 * - Checks balance for the buy order
 * - Marks order as filled and logs execution
 * - Creates a new position if none exists, otherwise merges into existing position
 * - Updates player's balance (equity recalculated later)
 *
 * @param supabase - Supabase client instance
 * @param gameId - The game ID to process
 * @param tick - The current tick number (game state)
 * @param order - The limit order row
 * @param qty - Parsed numeric quantity
 * @param fillPrice - Latest price used for filling
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
  const limitPrice = Number(order.price);

  // Check balance for the buy order
  const balanceCheck = await checkBalanceForBuy(supabase, gameId, order.player_id, qty, fillPrice);
  if (!balanceCheck) {
    // Reject the order if the player doesn't have enough balance
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  // Get or create the position for the player
  const key = `${order.player_id}:${order.symbol}`;
  const existingPosition = posByKey.get(key);

  // If the position does not exist, create a new one
  if (!existingPosition) {
    const created = await db.insertPositionInDB(
      supabase,
      gameId,
      order.player_id,
      order.symbol,
      "BUY",
      qty,
      fillPrice,
      1 // leverage = 1 by default
    );
    posByKey.set(key, created);
  } else {
    // If the position exists, update the quantity and entry price
    const newQty = existingPosition.quantity + qty;
    const newEntryPrice = (existingPosition.entry_price * existingPosition.quantity + fillPrice * qty) / newQty;

    await db.updatePositionInDB(supabase, existingPosition.id, {
      quantity: newQty,
      entryPrice: newEntryPrice,
    });

    existingPosition.quantity = newQty;
    existingPosition.entry_price = newEntryPrice;
    posByKey.set(key, existingPosition);
  }

  // Mark the order as filled
  await db.updateOrderInDB(supabase, order.id, "filled", fillPrice);

  // Update player's balance after the buy order
  const players = await db.fetchGamePlayersFromDB(supabase, gameId, order.player_id);
  const player = players[0];
  if (player) {
    const newBalance = player.balance - qty * fillPrice;
    await db.updateGamePlayerBalanceInDB(supabase, gameId, order.player_id, newBalance, player.equity);
  }

  // Log execution (audit trail)
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
}


/**
 * Handle a single SELL limit order.
 * - Checks positions for the sell order
 * - Marks order as filled and logs execution
 * - Reduces or fully closes the position
 * - Credits player's balance with sale proceeds
 *
 * @param supabase - Supabase client instance
 * @param gameId - The game ID to process
 * @param tick - The current tick number (game state)
 * @param order - The limit order row
 * @param qty - Parsed numeric quantity
 * @param fillPrice - Latest price used for filling
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
  const limitPrice = Number(order.price);

  // Get the position for the player
  const key = `${order.player_id}:${order.symbol}`;
  const position = posByKey.get(key);

  if (!position || position.side !== "BUY") {
    // Reject the order if there's no open position or the position is not a long (BUY)
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  const positionQty = position.quantity;
  if (qty > positionQty) {
    // Reject the order if the quantity to sell is greater than the position size
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  // Process the sell
  const pnl = (fillPrice - position.entry_price) * qty; // PnL calculation (entry - current price)
  const newQty = positionQty - qty;

  // Update position (reduce quantity or close position if fully sold)
  if (newQty <= 0) {
    await db.updatePositionInDB(supabase, position.id, {
      status: "closed",
      currentPrice: fillPrice,
      unrealizedPnl: pnl, // Unrealized PnL
    });

    posByKey.delete(key); // Remove the position from the map if it's closed
  } else {
    await db.updatePositionInDB(supabase, position.id, {
      quantity: newQty,
      currentPrice: fillPrice,
    });

    position.quantity = newQty;
    posByKey.set(key, position);
  }

  // Mark the order as filled
  await db.updateOrderInDB(supabase, order.id, "filled", fillPrice);

  // Update the player's balance with the proceeds from the sell
  const players = await db.fetchGamePlayersFromDB(supabase, gameId, order.player_id);
  const player = players[0];
  if (player) {
    const newBalance = player.balance + qty * fillPrice;
    await db.updateGamePlayerBalanceInDB(supabase, gameId, order.player_id, newBalance, player.equity);
  }

  // Log execution (audit trail)
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

  // Only process if the position is a long (BUY) position
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

  // TP condition for a long: trigger when price >= take profit price
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

  // Fetch the player and update balance
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
    await db.updatePositionInDB(supabase, pos.id, {
      quantity: remainingQty,
      currentPrice: px,
    });

    pos.quantity = remainingQty as any;
    posById.set(pos.id, pos);
  }

  // 4) Credit cash balance with proceeds
  const proceeds = px * orderQty;
  const newBalance = Number(player.balance) + proceeds;

  await db.updateGamePlayerBalanceInDB(supabase, gameId, order.player_id, newBalance, Number(player.equity));
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

  // Only process if the position is a long (BUY) position
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

  // SL condition for a long: trigger when price <= stop loss price
  if (px > trigger) return;

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

  // Fetch the player and update balance
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
    await db.updatePositionInDB(supabase, pos.id, {
      quantity: remainingQty,
      currentPrice: px,
      
    });

    pos.quantity = remainingQty as any;
    posById.set(pos.id, pos);
  }

  // 4) Credit cash balance with proceeds
  const proceeds = px * orderQty;
  const newBalance = Number(player.balance) + proceeds;

  await db.updateGamePlayerBalanceInDB(supabase, gameId, order.player_id, newBalance, Number(player.equity));
}
