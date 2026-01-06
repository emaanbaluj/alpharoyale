/**
 * End-to-End Test Suite
 * 
 * Tests the full cron job flow from scheduledHandler -> game-tick-worker -> processGameTick
 * 
 * Usage:
 *   npx tsx src/e2e-test.ts
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as db from "./db";
import { processGameTick } from "./game";
import type { GameRow } from "./types";

// Import the scheduled handler - we'll need to extract it or test the full flow
// For now, we'll simulate the cron flow step by step

// Test user emails - IDs will be fetched from database after creation
const TEST_USER_EMAILS = ["e2e-player1@test.com", "e2e-player2@test.com"];

// Store actual user IDs after creation
let TEST_USERS: Array<{ id: string; email: string }> = [];

const TEST_SYMBOLS = ["BTC", "ETH"];

// Initialize Supabase client
function getSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL || "http://localhost:54321";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

  return createClient(url, key);
}

/**
 * Create test users in auth.users table and fetch their actual IDs
 * Uses Supabase Auth Admin API to create users
 * @param supabase - Supabase client with service role key
 * @returns Array of created users with their actual IDs
 */
async function createTestUsers(supabase: SupabaseClient): Promise<Array<{ id: string; email: string }>> {
  console.log("👤 Creating test users...");
  
  const url = process.env.SUPABASE_URL || "http://localhost:54321";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
  
  const users: Array<{ id: string; email: string }> = [];
  
  for (const email of TEST_USER_EMAILS) {
    try {
      // First, check if user already exists
      let userId: string | null = null;
      const getResponse = await fetch(`${url}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${key}`,
        },
      });
      
      if (getResponse.ok) {
        const data = await getResponse.json();
        if (data.users && data.users.length > 0) {
          // Find the exact user by email (in case multiple users exist)
          const exactUser = data.users.find((u: any) => u.email === email);
          if (exactUser) {
            userId = exactUser.id;
            console.log(`   ✅ User ${email} already exists (ID: ${userId})`);
            users.push({ id: userId, email });
            continue;
          }
        }
      }
      
      // Create user if it doesn't exist
      const response = await fetch(`${url}/auth/v1/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': key,
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
          email: email,
          password: 'test-password',
          email_confirm: true,
          user_metadata: {},
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        userId = data.id;
        console.log(`   ✅ Created user ${email} (ID: ${userId})`);
        users.push({ id: userId, email });
      } else {
        const errorText = await response.text();
        console.log(`   ⚠️  Error creating user ${email}: ${response.status} ${errorText}`);
        throw new Error(`Failed to create user ${email}`);
      }
    } catch (error) {
      console.log(`   ❌ Error with user ${email}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  return users;
}

/**
 * Check if the Supabase database is accessible
 * @throws Error if database is not accessible
 */
async function checkDatabaseConnection(): Promise<void> {
  const supabase = getSupabase();
  const url = process.env.SUPABASE_URL || "http://localhost:54321";
  
  try {
    // Try a simple query to check connectivity
    await db.fetchGameStateFromDB(supabase);
    console.log("✅ Database connection verified");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (url.includes("localhost") || url.includes("127.0.0.1")) {
      console.error("\n❌ Failed to connect to local Supabase database");
      console.error(`   URL: ${url}`);
      console.error(`   Error: ${errorMessage}`);
      console.error("\n💡 Make sure your local Supabase is running:");
      console.error("   cd ../alpha-royale && npx supabase start");
      console.error("\n   Or set SUPABASE_URL environment variable to use a different database.");
      throw new Error(`Database connection failed: ${errorMessage}`);
    } else {
      console.error(`\n❌ Failed to connect to Supabase database at ${url}`);
      console.error(`   Error: ${errorMessage}`);
      throw new Error(`Database connection failed: ${errorMessage}`);
    }
  }
}

/**
 * Mock game-tick-worker service binding
 * In a real E2E test, this would call the actual worker
 */
async function mockGameTickWorker(gameId: string, gameState: number): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();
  try {
    // This simulates what the game-tick-worker does
    await processGameTick(gameId, gameState, supabase);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Simulate the scheduledHandler function
 * This tests the full cron flow without needing wrangler
 */
async function simulateScheduledHandler(
  mockPriceData: Array<{ symbol: string; price: number }>,
  mockGameTickWorkerFn: (gameId: string, gameState: number) => Promise<{ success: boolean; error?: string }>
): Promise<{ success: boolean; gameState: number; processedGames: number; errors: string[] }> {
  const supabase = getSupabase();
  const errors: string[] = [];

  try {
    // Step 1: Get current game state
    const currentGameStateRow = await db.fetchGameStateFromDB(supabase);
    const currentGameState = currentGameStateRow?.current_tick ?? 0;
    const nextGameState = currentGameState + 1;

    // Step 2: Store price data (simulating Finnhub fetch)
    console.log(`📊 Storing price data for game state: ${nextGameState}`);
    await Promise.all(
      mockPriceData.map(({ symbol, price }) =>
        db.insertPrice(supabase, symbol, price, nextGameState)
      )
    );

    // Step 3: Increment game state
    console.log(`📈 Incrementing game state from ${currentGameState} to ${nextGameState}`);
    await db.updateGameStateInDB(supabase, nextGameState);

    // Step 4: Fetch active games
    const activeGames = await db.fetchGamesFromDB(supabase, "active");
    console.log(`🎮 Found ${activeGames.length} active games`);

    if (activeGames.length === 0) {
      return { success: true, gameState: nextGameState, processedGames: 0, errors };
    }

    // Step 5: Process each game (simulating service binding calls)
    const processPromises = activeGames.map(async (game) => {
      try {
        const result = await mockGameTickWorkerFn(game.id, nextGameState);
        if (!result.success) {
          errors.push(`Game ${game.id}: ${result.error || "Unknown error"}`);
        }
        return result.success;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`Game ${game.id}: ${errorMsg}`);
        return false;
      }
    });

    const results = await Promise.all(processPromises);
    const successCount = results.filter((r) => r === true).length;

    console.log(`✅ Processed ${successCount}/${activeGames.length} games successfully`);

    return {
      success: errors.length === 0,
      gameState: nextGameState,
      processedGames: successCount,
      errors,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    errors.push(`Scheduled handler error: ${errorMsg}`);
    return {
      success: false,
      gameState: 0,
      processedGames: 0,
      errors,
    };
  }
}

/**
 * Test full cron flow with a simple game
 */
export async function testFullCronFlow(): Promise<boolean> {
  console.log("\n🧪 Testing Full Cron Flow\n");
  
  // Check database connection first
  await checkDatabaseConnection();
  
  const supabase = getSupabase();

  try {
    // Ensure test users are initialized
    if (!TEST_USERS || TEST_USERS.length === 0) {
      TEST_USERS = await createTestUsers(supabase);
      if (TEST_USERS.length < 2) {
        throw new Error(`Expected 2 test users, but only ${TEST_USERS.length} were created`);
      }
    }

    // Setup: Create test game with orders
    console.log("📋 Setting up test data...");

    // Initialize game state if needed
    let gameState = await db.fetchGameStateFromDB(supabase);
    if (!gameState) {
      await db.updateGameStateInDB(supabase, 0);
      gameState = await db.fetchGameStateFromDB(supabase)!;
    }

    // Create game
    const game = await db.insertGameInDB(
      supabase,
      TEST_USERS[0].id,
      TEST_USERS[1].id,
      10000.0,
      60 // durationMinutes
    );
    await db.updateGameStatusInDB(supabase, game.id, "active");

    // Add players
    await db.insertGamePlayerInDB(supabase, game.id, TEST_USERS[0].id, 10000.0);
    await db.insertGamePlayerInDB(supabase, game.id, TEST_USERS[1].id, 10000.0);

    // Create pending market order
    const buyOrder = await db.insertOrderInDB(
      supabase,
      game.id,
      TEST_USERS[0].id,
      "BTC",
      "MARKET",
      "BUY",
      0.1
    );

    console.log(`✅ Created game: ${game.id}`);
    console.log(`✅ Created pending order: ${buyOrder.id}`);

    // Step 1: Simulate cron handler
    console.log("\n🔄 Simulating cron handler...");
    const initialTick = gameState!.current_tick;
    const mockPrices = [
      { symbol: "BTC", price: 50000 },
      { symbol: "ETH", price: 3000 },
    ];

    const cronResult = await simulateScheduledHandler(mockPrices, mockGameTickWorker);

    if (!cronResult.success) {
      console.error("❌ Cron handler failed:", cronResult.errors);
      await cleanup(supabase, game.id);
      return false;
    }

    console.log(`✅ Cron handler completed. New game state: ${cronResult.gameState}`);
    console.log(`✅ Processed ${cronResult.processedGames} game(s)`);

    // Step 2: Verify results
    console.log("\n🔍 Verifying results...");

    // Verify game state incremented
    const newGameState = await db.fetchGameStateFromDB(supabase);
    if (newGameState?.current_tick !== initialTick + 1) {
      console.error(`❌ Game state not incremented correctly. Expected ${initialTick + 1}, got ${newGameState?.current_tick}`);
      await cleanup(supabase, game.id);
      return false;
    }
    console.log(`✅ Game state incremented: ${initialTick} -> ${newGameState.current_tick}`);

    // Verify price data stored
    const priceData = await db.fetchPriceDataFromDB(supabase, "BTC", 1);
    if (priceData.length === 0 || Number(priceData[0].price) !== 50000) {
      console.error("❌ Price data not stored correctly");
      await cleanup(supabase, game.id);
      return false;
    }
    console.log(`✅ Price data stored: BTC = $${priceData[0].price}`);

    // Verify order was processed
    const orders = await db.fetchOrdersFromDB(supabase, game.id);
    const order = orders.find((o) => o.id === buyOrder.id);
    if (!order || order.status !== "filled") {
      console.error(`❌ Order not filled. Status: ${order?.status || "not found"}`);
      await cleanup(supabase, game.id);
      return false;
    }
    console.log(`✅ Order filled: ${buyOrder.id}`);

    // Verify position was created
    const positions = await db.fetchPositionsFromDB(supabase, game.id, "open");
    if (positions.length === 0) {
      console.error("❌ Position not created");
      await cleanup(supabase, game.id);
      return false;
    }
    console.log(`✅ Position created: ${positions[0].id}`);

    // Verify equity history recorded
    const players = await db.fetchGamePlayersFromDB(supabase, game.id);
    const history = await db.fetchEquityHistoryFromDB(supabase, game.id);
    const recentHistory = history.filter((h) => h.game_state === newGameState.current_tick);
    if (recentHistory.length === 0) {
      console.error("❌ Equity history not recorded");
      await cleanup(supabase, game.id);
      return false;
    }
    console.log(`✅ Equity history recorded for ${recentHistory.length} player(s)`);

    await cleanup(supabase, game.id);
    console.log("\n✅ Full cron flow test passed!");
    return true;
  } catch (error) {
    console.error("❌ E2E test error:", error);
    return false;
  }
}

/**
 * Test cron flow with multiple games (parallel processing simulation)
 */
export async function testMultipleGamesParallel(): Promise<boolean> {
  console.log("\n🧪 Testing Multiple Games (Parallel Processing)\n");
  
  // Check database connection first
  await checkDatabaseConnection();
  
  const supabase = getSupabase();

  try {
    // Ensure test users are initialized
    if (!TEST_USERS || TEST_USERS.length === 0) {
      TEST_USERS = await createTestUsers(supabase);
      if (TEST_USERS.length < 2) {
        throw new Error(`Expected 2 test users, but only ${TEST_USERS.length} were created`);
      }
    }

    // Create 3 games
    const games: GameRow[] = [];
    for (let i = 0; i < 3; i++) {
      const game = await db.insertGameInDB(
        supabase,
        TEST_USERS[0].id,
        TEST_USERS[1].id,
        10000.0,
        60 // durationMinutes
      );
      await db.updateGameStatusInDB(supabase, game.id, "active");
      await db.insertGamePlayerInDB(supabase, game.id, TEST_USERS[0].id, 10000.0);

      // Add a pending order to each game
      await db.insertOrderInDB(
        supabase,
        game.id,
        TEST_USERS[0].id,
        "BTC",
        "MARKET",
        "BUY",
        0.1
      );

      games.push(game);
    }

    console.log(`✅ Created ${games.length} test games`);

    // Run cron handler
    const mockPrices = [
      { symbol: "BTC", price: 51000 },
      { symbol: "ETH", price: 3100 },
    ];

    const cronResult = await simulateScheduledHandler(mockPrices, mockGameTickWorker);

    if (!cronResult.success) {
      console.error(`❌ Cron handler failed. Processed: ${cronResult.processedGames} games`);
      if (cronResult.errors.length > 0) {
        console.error("Errors:", cronResult.errors);
      }
      await Promise.all(games.map((g) => cleanup(supabase, g.id)));
      return false;
    }

    // Verify our test games were processed (note: may process more games if other tests left data)
    const gameIds = new Set(games.map((g) => g.id));
    for (const game of games) {
      const orders = await db.fetchOrdersFromDB(supabase, game.id);
      const filledOrders = orders.filter((o) => o.status === "filled");
      if (filledOrders.length === 0) {
        console.error(`❌ Game ${game.id} orders not filled`);
        await Promise.all(games.map((g) => cleanup(supabase, g.id)));
        return false;
      }
    }
    
    // Verify at least our games were processed
    if (cronResult.processedGames < games.length) {
      console.error(`❌ Not all test games were processed. Processed: ${cronResult.processedGames}, Expected at least: ${games.length}`);
      await Promise.all(games.map((g) => cleanup(supabase, g.id)));
      return false;
    }

    console.log(`✅ All ${games.length} games processed successfully`);

    await Promise.all(games.map((g) => cleanup(supabase, g.id)));
    console.log("\n✅ Multiple games test passed!");
    return true;
  } catch (error) {
    console.error("❌ E2E test error:", error);
    return false;
  }
}

/**
 * Cleanup helper
 */
async function cleanup(supabase: SupabaseClient, gameId: string): Promise<void> {
  try {
    await supabase.from("games").delete().eq("id", gameId);
  } catch (error) {
    console.warn(`Warning: Failed to cleanup game ${gameId}:`, error);
  }
}

/**
 * Run all E2E tests
 */
async function runAllE2ETests(): Promise<void> {
  console.log("🚀 Running E2E Test Suite\n");

  const tests = [
    { name: "Full Cron Flow", fn: testFullCronFlow },
    { name: "Multiple Games Parallel", fn: testMultipleGamesParallel },
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const result = await test.fn();
      if (result) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      console.error(`❌ Test "${test.name}" threw error:`, error);
      failed++;
    }
  }

  console.log("\n📊 E2E Test Summary:");
  console.log(`   Passed: ${passed}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Total:  ${tests.length}`);

  if (failed === 0) {
    console.log("\n✅ All E2E tests passed!");
  } else {
    console.log("\n❌ Some E2E tests failed");
    process.exit(1);
  }
}

// CLI handler
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllE2ETests().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
