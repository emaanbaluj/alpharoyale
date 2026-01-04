// worker/src/game.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fetchPriceDataFromFinnhub } from "./finnhub";
import * as db from "./db";


export async function processMarketOrders(
  supabase: SupabaseClient,
  gameId: string,
  tick: number
): Promise<void> {
  // assumes your updated signature: (supabase, gameId, status, orderType)
  const marketOrders = await db.fetchOrdersFromDB(supabase, gameId, "pending", "MARKET");
  if (marketOrders.length === 0) return;

  // preload players
  const players = await db.fetchGamePlayersFromDB(supabase, gameId);
  const playerById = new Map(players.map((p) => [p.user_id, p]));

  // preload latest prices
  const symbols = Array.from(new Set(marketOrders.map((o) => o.symbol)));
  const priceBySymbol = new Map<string, number>();

  for (const sym of symbols) {
    const rows = await db.fetchPriceDataFromDB(supabase, sym, 1);
    if (rows[0]) priceBySymbol.set(sym, Number(rows[0].price));
  }

  for (const order of marketOrders) {
    // v1: BUY only
    if (order.side !== "BUY") {
      await db.updateOrderInDB(supabase, order.id, "rejected");
      continue;
    }

    const player = playerById.get(order.player_id);
    if (!player) {
      await db.updateOrderInDB(supabase, order.id, "rejected");
      continue;
    }

    const fillPrice = priceBySymbol.get(order.symbol);
    if (fillPrice == null) continue; // no price this tick

    const qty = Number(order.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      await db.updateOrderInDB(supabase, order.id, "rejected");
      continue;
    }

    const notional = qty * fillPrice;
    const balance = Number(player.balance);

    if (balance < notional) {
      await db.updateOrderInDB(supabase, order.id, "rejected");
      continue;
    }

    // (A) fill order
    await db.updateOrderInDB(supabase, order.id, "filled", fillPrice);

    // (B) log execution
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

    // (C) create position
    await db.insertPositionInDB(
      supabase,
      gameId,
      order.player_id,
      order.symbol,
      "BUY",
      qty,
      fillPrice,
      1
    );

    // (D) update cash balance (equity updated later)
    const newBalance = balance - notional;
    await db.updateGamePlayerBalanceInDB(
      supabase,
      gameId,
      order.player_id,
      newBalance,
      Number(player.equity)
    );

    // update local cache for multiple orders same tick
    player.balance = newBalance as any;
    playerById.set(order.player_id, player);
  }
}


export async function processTakeProfitOrders(
  supabase: SupabaseClient,
  gameId: string,
  tick: number
): Promise<void> {
  const takeProfitOrders = await db.fetchOrdersFromDB(
    supabase,
    gameId,
    "pending",
    "TAKE_PROFIT"
  );

  if (takeProfitOrders.length === 0) return;

  // Preload open positions (we only handle open ones)
  const openPositions = await db.fetchPositionsFromDB(supabase, gameId, undefined, "open");
  const posById = new Map(openPositions.map((p) => [p.id, p]));

  // Preload players
  const players = await db.fetchGamePlayersFromDB(supabase, gameId);
  const playerById = new Map(players.map((p) => [p.user_id, p]));

  // Preload latest prices for symbols referenced by these TP orders
  const symbols = Array.from(new Set(takeProfitOrders.map((o) => o.symbol)));
  const priceBySymbol = new Map<string, number>();

  for (const sym of symbols) {
    const rows = await db.fetchPriceDataFromDB(supabase, sym, 1);
    if (rows[0]) priceBySymbol.set(sym, Number(rows[0].price));
  }

  for (const o of takeProfitOrders) {
    // Must be linked to a position
    if (!o.position_id) {
      await db.updateOrderInDB(supabase, o.id, "rejected");
      continue;
    }

    const pos = posById.get(o.position_id);
    if (!pos) {
      // position not open / doesn't exist
      await db.updateOrderInDB(supabase, o.id, "rejected");
      continue;
    }

    // Long-only v1: position must be BUY (we're taking profit by selling)
    if (pos.side !== "BUY") {
      await db.updateOrderInDB(supabase, o.id, "rejected");
      continue;
    }

    const trigger = Number(o.trigger_price);
    if (!Number.isFinite(trigger)) {
      await db.updateOrderInDB(supabase, o.id, "rejected");
      continue;
    }

    const px = priceBySymbol.get(o.symbol);
    if (px == null) continue; // no price this tick

    // TP condition for long
    if (px < trigger) continue; // not triggered yet

    const qty = Number(pos.quantity);

    // 1) Fill TP order at current price
    await db.updateOrderInDB(supabase, o.id, "filled", px);

    // 2) Log execution
    await db.insertOrderExecutionInDB(
      supabase,
      o.id,
      gameId,
      o.player_id,
      o.symbol,
      "SELL",      // closing action for a long
      qty,
      px,
      tick
    );

    // 3) Close the position
    
    const unrealised = (px - Number(pos.entry_price)) * Number(pos.quantity);

    await db.updatePositionInDB(supabase, pos.id, {
      status: "closed",
      currentPrice: px,
      unrealizedPnl: unrealised,
    });


    // 4) Credit player balance with proceeds
    const player = playerById.get(o.player_id);
    if (!player) continue;

    const balance = Number(player.balance);
    const proceeds = qty * px;
    const newBalance = balance + proceeds;

    await db.updateGamePlayerBalanceInDB(
      supabase,
      gameId,
      o.player_id,
      newBalance,
      Number(player.equity) // updateEquity() will recompute properly
    );

    // Update local caches
    player.balance = newBalance as any;
    playerById.set(o.player_id, player);
    posById.delete(pos.id); // it's now closed
  }
}


export async function processStopLossOrders(
  supabase: SupabaseClient,
  gameId: string,
  tick: number
): Promise<void> {
  const stopLossOrders = await db.fetchOrdersFromDB(
    supabase,
    gameId,
    "pending",
    "STOP_LOSS"
  );

  if (stopLossOrders.length === 0) return;

  // Preload open positions
  const openPositions = await db.fetchPositionsFromDB(supabase, gameId, undefined, "open");
  const posById = new Map(openPositions.map((p) => [p.id, p]));

  // Preload players
  const players = await db.fetchGamePlayersFromDB(supabase, gameId);
  const playerById = new Map(players.map((p) => [p.user_id, p]));

  // Preload latest prices needed
  const symbols = Array.from(new Set(stopLossOrders.map((o) => o.symbol)));
  const priceBySymbol = new Map<string, number>();

  for (const sym of symbols) {
    const rows = await db.fetchPriceDataFromDB(supabase, sym, 1);
    if (rows[0]) priceBySymbol.set(sym, Number(rows[0].price));
  }

  for (const o of stopLossOrders) {
    // must be linked to a position
    if (!o.position_id) {
      await db.updateOrderInDB(supabase, o.id, "rejected");
      continue;
    }

    const pos = posById.get(o.position_id);
    if (!pos) {
      await db.updateOrderInDB(supabase, o.id, "rejected");
      continue;
    }

    // long-only v1: only handle BUY positions
    if (pos.side !== "BUY") {
      await db.updateOrderInDB(supabase, o.id, "rejected");
      continue;
    }

    const trigger = Number(o.trigger_price);
    if (!Number.isFinite(trigger)) {
      await db.updateOrderInDB(supabase, o.id, "rejected");
      continue;
    }

    const px = priceBySymbol.get(o.symbol);
    if (px == null) continue; // no price this tick

    // SL condition for long
    if (px > trigger) continue; // not triggered yet

    const qty = Number(pos.quantity);

    // 1) Fill SL order at current price
    await db.updateOrderInDB(supabase, o.id, "filled", px);

    // 2) Log execution (closing action)
    await db.insertOrderExecutionInDB(
      supabase,
      o.id,
      gameId,
      o.player_id,
      o.symbol,
      "SELL",
      qty,
      px,
      tick
    );

    
    const unrealised = (px - Number(pos.entry_price)) * Number(pos.quantity);

    await db.updatePositionInDB(supabase, pos.id, {
      status: "closed",
      currentPrice: px,
      unrealizedPnl: unrealised,
    });


    // 4) Credit proceeds to balance
    const player = playerById.get(o.player_id);
    if (!player) continue;

    const balance = Number(player.balance);
    const proceeds = qty * px;
    const newBalance = balance + proceeds;

    await db.updateGamePlayerBalanceInDB(
      supabase,
      gameId,
      o.player_id,
      newBalance,
      Number(player.equity) // updateEquity will fix properly
    );

    // Update local caches
    player.balance = newBalance as any;
    playerById.set(o.player_id, player);
    posById.delete(pos.id);
  }
}


export async function updatePositions(
  supabase: SupabaseClient,
  gameId: string
): Promise<void> {
  // 1) Fetch all open positions for this game
  const openPositions = await db.fetchPositionsFromDB(supabase, gameId, undefined, "open");
  if (openPositions.length === 0) return;

  // 2) Preload latest prices for symbols used
  const symbols = Array.from(new Set(openPositions.map((p) => p.symbol)));
  const priceBySymbol = new Map<string, number>();

  for (const sym of symbols) {
    const rows = await db.fetchPriceDataFromDB(supabase, sym, 1);
    if (rows[0]) priceBySymbol.set(sym, Number(rows[0].price));
  }

  // 3) Update each position
  for (const pos of openPositions) {
    const px = priceBySymbol.get(pos.symbol);
    if (px == null) continue;

    const qty = Number(pos.quantity);
    const entry = Number(pos.entry_price);

    // long-only v1
    const unrealized =
      pos.side === "BUY" ? (px - entry) * qty : (entry - px) * qty;

    // Your db.updatePositionInDB can only update status + current_price,
   

      await db.updatePositionInDB(supabase, pos.id, {
      currentPrice: px,
      unrealizedPnl: unrealized,
    });


  }
}

export async function updateEquity(
  supabase: SupabaseClient,
  gameId: string,
  tick: number
): Promise<void> {
  // 1) Load players
  const players = await db.fetchGamePlayersFromDB(supabase, gameId);
  if (players.length === 0) return;

  // 2) Load open positions (after updatePositions ran)
  const openPositions = await db.fetchPositionsFromDB(supabase, gameId, undefined, "open");

  // 3) Sum unrealized pnl per player
  const pnlByPlayer = new Map<string, number>();
  for (const pos of openPositions) {
    const pid = pos.player_id;
    const pnl = Number(pos.unrealized_pnl ?? 0);
    pnlByPlayer.set(pid, (pnlByPlayer.get(pid) ?? 0) + pnl);
  }

  // 4) Update equity + insert equity_history
  for (const p of players) {
    const balance = Number(p.balance);
    const pnl = pnlByPlayer.get(p.user_id) ?? 0;
    const equity = balance + pnl;

    // update game_players
    await db.updateGamePlayerBalanceInDB(
      supabase,
      gameId,
      p.user_id,
      balance,
      equity
    );

    // insert equity history for charts
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











