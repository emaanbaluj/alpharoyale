import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ScheduledController } from "@cloudflare/workers-types";
import { fetchPriceDataFromFinnhub } from "./finnhub";
import * as db from "./db";

// Fetcher type for service bindings
interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

// Environment interface for main worker
export interface Env {
  // Supabase
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  
  // Finnhub API
  FINNHUB_API_KEY: string;
  
  // Service binding to game-tick worker
  GAME_TICK_WORKER: Fetcher;
}

// Helper to create Supabase client
function createSupabaseClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

// Scheduled handler implementation
async function scheduledHandler(
  controller: ScheduledController,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  try {
    const supabase = createSupabaseClient(env);
    
    // 1. Fetch price data from Finnhub API
    // Use Binance crypto symbols (format: EXCHANGE:SYMBOL)
    // Map: normalized symbol (for DB) -> Finnhub symbol (for API)
    const symbolMap: Record<string, string> = {
      'BTC': 'BINANCE:BTCUSDT',
      'ETH': 'BINANCE:ETHUSDT',
    };
    const normalizedSymbols = Object.keys(symbolMap);
    const finnhubSymbols = normalizedSymbols.map(s => symbolMap[s]);
    
    console.log(`Fetching price data for symbols: ${normalizedSymbols.join(', ')} (via ${finnhubSymbols.join(', ')})`);
    
    const priceData = await fetchPriceDataFromFinnhub(finnhubSymbols, env.FINNHUB_API_KEY);
    
    // 2. Get current game state (before incrementing)
    const currentGameStateRow = await db.fetchGameStateFromDB(supabase);
    const currentGameState = currentGameStateRow?.current_tick ?? 0;
    const nextGameState = currentGameState + 1;
    
    // 3. Store price data in database with new game state
    // Normalize symbols back to simple format (BTC, ETH) for storage
    // Create reverse map: finnhub symbol -> normalized symbol
    const reverseMap: Record<string, string> = {};
    for (const [normalized, finnhub] of Object.entries(symbolMap)) {
      reverseMap[finnhub] = normalized;
    }
    
    console.log(`Storing price data for game state: ${nextGameState}`);
    await Promise.all(
      priceData.map(({ symbol: finnhubSymbol, price }) => {
        // Map Finnhub symbol back to normalized symbol (BTC, ETH)
        const normalizedSymbol = reverseMap[finnhubSymbol] || finnhubSymbol;
        return db.insertPrice(supabase, normalizedSymbol, price, nextGameState);
      })
    );
    
    // 4. Increment game state counter
    console.log(`Incrementing game state from ${currentGameState} to ${nextGameState}`);
    await db.updateGameStateInDB(supabase, nextGameState);
    
    // 5. Fetch active games (only games that have started - started_at IS NOT NULL)
    // Note: Expiration checking is now done in the bound worker for each game
    const allActiveGames = await db.fetchGamesFromDB(supabase, 'active');
    // Filter to only games that have actually started (exclude waiting games)
    const activeGames = allActiveGames.filter(game => game.started_at !== null);
    console.log(`Found ${activeGames.length} active games (${allActiveGames.length - activeGames.length} waiting)`);
    
    if (activeGames.length === 0) {
      console.log('No active games to process');
      return;
    }
    
    // 7. Fire off game processing requests without waiting
    // Each game worker will fetch its own price data from the DB
    // Use ctx.waitUntil() to keep them running in background
    // This allows the main worker to complete quickly while games process asynchronously
    for (const game of activeGames) {
      ctx.waitUntil(
        (async () => {
          try {
            const response = await env.GAME_TICK_WORKER.fetch(
              new Request('http://internal/game-tick', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  gameId: game.id,
                  gameState: nextGameState,
                }),
              })
            );
            
            if (!response.ok) {
              const errorText = await response.text();
              console.error(`Game ${game.id} failed: ${response.status} - ${errorText}`);
            } else {
              console.log(`Game ${game.id} processing initiated for game state ${nextGameState}`);
            }
          } catch (error) {
            console.error(`Error initiating game processing for ${game.id}:`, error);
          }
        })()
      );
    }
    
    console.log(`Initiated processing for ${activeGames.length} games (running asynchronously)`);
    console.log(`Game tick completed for game state ${nextGameState} at ${new Date(controller.scheduledTime).toISOString()}`);
  } catch (error) {
    console.error('Error in scheduled handler:', error);
    throw error;
  }
}

// Export default handler using ExportedHandler pattern
// Using ExportedHandler pattern - ALL handlers must be on this object
// Cloudflare Workers will look for fetch, scheduled on the default export
const handler = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Health endpoint
    if (path === '/health' || path === '/') {
      return new Response(
        JSON.stringify({ status: 'ok' }),
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // 404 for unknown routes
    return new Response('Not Found', { status: 404 });
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    return scheduledHandler(controller, env, ctx);
  },
};

export default handler;
