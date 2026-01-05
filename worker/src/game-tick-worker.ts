import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { processGameTick } from "./game";
import * as db from "./db";

// Cloudflare Workers types
declare global {
  interface ExecutionContext {
    waitUntil(promise: Promise<any>): void;
    passThroughOnException(): void;
  }
}

// Environment interface for game-tick worker
export interface Env {
  // Supabase
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

// Helper to create Supabase client
function createSupabaseClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

// Request body type for game tick
interface GameTickRequest {
  gameId: string;
  gameState: number;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle game tick route
    if (path === '/game-tick' && request.method === 'POST') {
      try {
        // Parse request body
        const body: GameTickRequest = await request.json();
        
        // Validate request body
        if (!body.gameId || typeof body.gameState !== 'number') {
          return new Response(
            JSON.stringify({ error: 'Invalid request body. Expected: { gameId: string, gameState: number }' }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }

        // Initialize Supabase client
        const supabase = createSupabaseClient(env);

        // Process game tick
        // processGameTick will fetch its own price data as needed
        await processGameTick(
          body.gameId,
          body.gameState,
          supabase
        );

        return new Response(
          JSON.stringify({ 
            success: true,
            gameId: body.gameId,
            gameState: body.gameState,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      } catch (error) {
        console.error('Error processing game tick:', error);
        return new Response(
          JSON.stringify({ 
            error: error instanceof Error ? error.message : 'Unknown error',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // 404 for unknown routes
    return new Response('Not Found', { status: 404 });
  },
};
