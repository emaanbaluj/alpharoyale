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

export async function processMarketOrders(
  supabase: SupabaseClient,
  gameId: string,
  tick: number
): Promise<void> {
  // 1) Fetch pending market orders
  const marketOrders = await db.fetchOrdersFromDB(supabase, gameId, "pending", "MARKET");
  if (marketOrders.length === 0) return;

  // 2) Preload latest prices (1 per symbol)
  const symbols = Array.from(new Set(marketOrders.map((o) => o.symbol)));
  const priceBySymbol = await getLatestPricesBySymbol(supabase, symbols);

  // 3) Preload open positions for quick lookup (player+symbol)
  const openPositions = await db.fetchPositionsFromDB(supabase, gameId,  "open");
  const posByKey = new Map(openPositions.map((p) => [`${p.player_id}:${p.symbol}`, p]));

  // 4) Process each order
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


export async function processConditionalOrders(
  supabase: SupabaseClient,
  gameId: string,
  tick: number
): Promise<void> {
  // 1) Load pending conditional orders
  const allOrders = await db.fetchOrdersFromDB(supabase, gameId);
  const takeProfitOrders = allOrders.filter(
    (o) => o.order_type === "TAKE_PROFIT" && o.status === "pending"
  );
  const stopLossOrders = allOrders.filter(
    (o) => o.order_type === "STOP_LOSS" && o.status === "pending"
  );

  if (takeProfitOrders.length === 0 && stopLossOrders.length === 0) return;

  // 2) Load open positions once (we only trigger TP/SL against open positions)
  const openPositions = await db.fetchPositionsFromDB(supabase, gameId, "open");
  const posById = new Map(openPositions.map((p) => [p.id, p]));

  // 3) Load latest prices once per symbol used by conditional orders
  const symbols = Array.from(
    new Set([...takeProfitOrders, ...stopLossOrders].map((o) => o.symbol))
  );
  const priceBySymbol = await getLatestPricesBySymbol(supabase, symbols);

  // 4) Handle TP then SL (order doesn’t matter much, but keep consistent)
  for (const o of takeProfitOrders) {
    await handleTakeProfitOrder(supabase, gameId, tick, o, posById, priceBySymbol);
  }

  for (const o of stopLossOrders) {
    await handleStopLossOrder(supabase, gameId, tick, o, posById, priceBySymbol);
  }
}

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
  if (!pos) {
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

  // SL condition for a long
  if (px > trigger) return;

  const qty = Number(pos.quantity);

  // 1) fill order
  await db.updateOrderInDB(supabase, order.id, "filled", px);

  // 2) execution log
  await db.insertOrderExecutionInDB(
    supabase,
    order.id,
    gameId,
    order.player_id,
    order.symbol,
    "SELL",
    qty,
    px,
    tick
  );

  // 3) close position
  const pnl = (px - Number(pos.entry_price)) * qty;

  await db.updatePositionInDB(supabase, pos.id, {
    status: "closed",
    currentPrice: px,
    unrealizedPnl: pnl,
  });

 
  posById.delete(pos.id);
}

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
  if (!pos) {
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

  // TP condition for a long
  if (px < trigger) return;

  const qty = Number(pos.quantity);

  // 1) fill order
  await db.updateOrderInDB(supabase, order.id, "filled", px);

  // 2) execution log
  await db.insertOrderExecutionInDB(
    supabase,
    order.id,
    gameId,
    order.player_id,
    order.symbol,
    "SELL",
    qty,
    px,
    tick
  );

  // 3) close position
  const pnl = (px - Number(pos.entry_price)) * qty;

  await db.updatePositionInDB(supabase, pos.id, {
    status: "closed",
    currentPrice: px,
    unrealizedPnl: pnl,
  });

  // remove from cache so SL can’t close it again this tick
  posById.delete(pos.id);
}


// Handle Buy Market Order 
async function handleBuyMarketOrder(
  supabase: SupabaseClient,
  gameId: string,
  tick: number,
  order: any,
  qty: number,
  fillPrice: number,
  posByKey: Map<string, any>
): Promise<void> {

   // C) Create or merge position (v1: one open position per (player,symbol))
  const key = `${order.player_id}:${order.symbol}`;
  const existing = posByKey.get(key);

  // A) Fill order
  await db.updateOrderInDB(supabase, order.id, "filled", fillPrice);

  // B) Log execution
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
    return;
  }
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
  // Must have an open long position to sell against (v1)
  const key = `${order.player_id}:${order.symbol}`;
  const existing = posByKey.get(key);

  if (!existing || existing.side !== "BUY") {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  const posQty = Number(existing.quantity);

  // v1: reject oversell (later you can partial fill)
  if (qty > posQty) {
    await db.updateOrderInDB(supabase, order.id, "rejected");
    return;
  }

  // A) Fill order
  await db.updateOrderInDB(supabase, order.id, "filled", fillPrice);

  // B) Log execution
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

  // C) Log Position
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
    return;
  }
}

// Update open positions with current price and new unrealized pnl
export async function updatePositions(
  supabase: SupabaseClient,
  gameId: string
): Promise<void> {

  const openPositions = await db.fetchPositionsFromDB(supabase, gameId, "open");
  if (openPositions.length === 0) return;

  // Preload prices once
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

// Update player balances
export async function updatePlayerBalances(supabase: SupabaseClient, gameId: string) {
  // group open positions by player and sum unrealised pnl
  const openPositions = await db.fetchPositionsFromDB(supabase, gameId,  "open");

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

