// // // worker/src/index.ts

// // export interface Env {
// //   FINNHUB_API_KEY?: string;
// // }

// // export default {
// //   async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
// //     const url = new URL(request.url);
// //     const path = url.pathname;

// //     // Health endpoint
// //     if (path === '/health' || path === '/') {
// //       return new Response(
// //         JSON.stringify({ status: 'ok' }),
// //         {
// //           headers: {
// //             'Content-Type': 'application/json',
// //           },
// //         }
// //       );
// //     }

// //     // 404 for unknown routes
// //     return new Response('Not Found', { status: 404 });
// //   },

// //   // Cron handler for game ticks
// //   async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
// //     // This is called on each cron trigger
// //     // TODO: Implement game tick logic here
// //     // - Process pending orders
// //     // - Update market prices
// //     // - Execute trades
// //     // - Update game state
  
    
// //     console.log(`Game tick executed at ${new Date(event.scheduledTime).toISOString()}`);
// //   },
// // };


// // worker/src/index.ts
// import { getSupabase } from "./db";
// import * as db from "./db";
// import { processMarketOrders } from "./game";

// type Env = {
//   SUPABASE_URL: string;
//   SUPABASE_SERVICE_ROLE_KEY: string;
//   SEED_KEY?: string;
// };

// function isAllowed(request: Request, env: Env) {
//   const headerKey = (request.headers.get("x-seed-key") ?? "").trim();
//   const envKey = (env.SEED_KEY ?? "").trim();
//   return headerKey !== "" && envKey !== "" && headerKey === envKey;
// }

// function badRequest(msg: string) {
//   return Response.json({ ok: false, error: msg }, { status: 400 });
// }

// export default {
//   async fetch(request: Request, env: Env): Promise<Response> {
//     const url = new URL(request.url);

//     // Protect /test routes
//     if (url.pathname.startsWith("/test/") && !isAllowed(request, env)) {
//       return new Response("Forbidden", { status: 403 });
//     }

//     const gameId = url.searchParams.get("game_id") ?? undefined;
//     const tickStr = url.searchParams.get("tick") ?? "0";
//     const tick = Number(tickStr);

//     // ---- TEST: processMarketOrders ----
//     if (url.pathname === "/test/game/market") {
//       if (!gameId) return badRequest("Missing ?game_id=");
//       if (!Number.isFinite(tick)) return badRequest("Invalid ?tick=");

//       const supabase = getSupabase(env);

//       // ✅ FIXED: status="pending", orderType="MARKET"
//       const beforeOrders = await db.fetchOrdersFromDB(
//         supabase,
//         gameId,
//         "pending",
//         "MARKET"
//       );
//       const beforePositions = await db.fetchPositionsFromDB(
//         supabase,
//         gameId,
//         undefined,
//         "open"
//       );

//       console.log("processMarketOrders CALLED", gameId, tick);
//       await processMarketOrders(supabase, gameId, tick);

//       const afterOrders = await db.fetchOrdersFromDB(supabase, gameId);
//       const afterPositions = await db.fetchPositionsFromDB(
//         supabase,
//         gameId,
//         undefined,
//         "open"
//       );

//       return Response.json({
//         ok: true,
//         ran: "processMarketOrders",
//         input: { gameId, tick },
//         before: {
//           pending_market_orders: beforeOrders.length,
//           open_positions: beforePositions.length,
//         },
//         after: {
//           total_orders: afterOrders.length,
//           open_positions: afterPositions.length,
//           filled_orders: afterOrders.filter((o) => o.status === "filled").length,
//           rejected_orders: afterOrders.filter((o) => o.status === "rejected").length,
//         },
//       });
//     }

//     // Always return something
//     return new Response("Not Found", { status: 404 });
//   },
// };
