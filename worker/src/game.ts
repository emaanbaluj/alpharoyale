import type { SupabaseClient } from "@supabase/supabase-js";
import * as db from "./db";


// Process all market orders, insert new postion, order execution and updates player balances
export async function processMarketOrders(
  supabase: SupabaseClient,
  gameId: string,
  tick: number
): Promise<void> {
  // 1) Load pending MARKET orders for this game
  const marketOrders = await db.fetchOrdersFromDB(supabase, gameId, "pending", "MARKET");
  if (marketOrders.length === 0) return;

  // 2) Load players once (so we can read/update balances)
  const players = await db.fetchGamePlayersFromDB(supabase, gameId);
  const playerByUserId = new Map(players.map((p) => [p.user_id, p]));

  // 3) Load latest prices once per symbol
  const symbols = Array.from(new Set(marketOrders.map((o) => o.symbol)));
  const priceBySymbol = await getLatestPricesBySymbol(supabase, symbols);

  // 4) Execute each order
  for (const order of marketOrders) {
    // v1: BUY-only
    if (order.side !== "BUY") {
      await db.updateOrderInDB(supabase, order.id, "rejected");
      continue;
    }

    const player = playerByUserId.get(order.player_id);
    if (!player) {
      await db.updateOrderInDB(supabase, order.id, "rejected");
      continue;
    }

    const fillPrice = priceBySymbol.get(order.symbol);
    if (fillPrice == null) {
      // no price available this tick -> leave pending
      continue;
    }

    const qty = Number(order.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      await db.updateOrderInDB(supabase, order.id, "rejected");
      continue;
    }

    const balance = Number(player.balance);
    const notional = qty * fillPrice;

    if (balance < notional) {
      await db.updateOrderInDB(supabase, order.id, "rejected");
      continue;
    }

    // A) Mark order filled
    await db.updateOrderInDB(supabase, order.id, "filled", fillPrice);

    // B) Record execution (audit trail)
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

    // C) Create position (one fill => one position, v1)
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

    // D) Update cash balance (equity recalculated later in updateEquity)
    const newBalance = balance - notional;

    await db.updateGamePlayerBalanceInDB(
      supabase,
      gameId,
      order.player_id,
      newBalance,
      Number(player.equity)
    );

    // Keep local copy updated so multiple orders in the same tick work correctly
    player.balance = newBalance as any;
    playerByUserId.set(order.player_id, player);
  }
}

async function getLatestPricesBySymbol(
  supabase: SupabaseClient,
  symbols: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();

  for (const sym of symbols) {
    const rows = await db.fetchPriceDataFromDB(supabase, sym, 1);
    if (rows[0]) map.set(sym, Number(rows[0].price));
  }

  return map;
}