/**
 * Cloudflare Worker E2E Test Suite
 * 
 * Tests the actual running Cloudflare Workers via HTTP requests.
 * 
 * Prerequisites:
 * 1. Local Supabase must be running: cd ../alpha-royale && npx supabase start
 * 2. Workers must be running: npm run dev
 * 
 * Usage:
 *   npm run test:worker-e2e
 * 
 * The main worker should be running on:
 *   - Main worker: http://localhost:8787 (default Wrangler port)
 *   - Game-tick worker: Accessible only via service binding (not direct URL)
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as db from "./db";

// Worker URL (default Wrangler dev port)
// Note: game-tick worker is only accessible via service binding, not direct URL
const MAIN_WORKER_URL = process.env.MAIN_WORKER_URL || "http://localhost:8787";

// Test user emails - IDs will be fetched from database after creation
const TEST_USER_EMAILS = ["worker-e2e-player1@test.com", "worker-e2e-player2@test.com"];

// Store actual user IDs after creation
let TEST_USERS: Array<{ id: string; email: string }> = [];

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
 */
async function createTestUsers(supabase: SupabaseClient): Promise<Array<{ id: string; email: string }>> {
  console.log("👤 Creating test users...");
  
  const url = process.env.SUPABASE_URL || "http://localhost:54321";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
  
  const users: Array<{ id: string; email: string }> = [];
  
  for (const email of TEST_USER_EMAILS) {
    try {
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
          const exactUser = data.users.find((u: any) => u.email === email);
          if (exactUser) {
            userId = exactUser.id;
            console.log(`   ✅ User ${email} already exists (ID: ${userId})`);
            users.push({ id: userId, email });
            continue;
          }
        }
      }
      
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
        throw new Error(`Failed to create user ${email}: ${response.status} ${errorText}`);
      }
    } catch (error) {
      console.log(`   ❌ Error with user ${email}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  return users;
}

/**
 * Check if workers are running
 */
async function checkWorkersRunning(): Promise<{ main: boolean }> {
  let mainRunning = false;

  try {
    const mainResponse = await fetch(`${MAIN_WORKER_URL}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    mainRunning = mainResponse.ok;
  } catch (error) {
    console.log(`   ⚠️  Main worker not responding at ${MAIN_WORKER_URL}`);
  }

  return { main: mainRunning };
}

/**
 * Test 1: Health check and basic connectivity
 */
async function testWorkerHealth(): Promise<boolean> {
  console.log("\n🧪 Test 1: Worker Health Check\n");

  try {
    // Check main worker
    const mainResponse = await fetch(`${MAIN_WORKER_URL}/health`);
    if (!mainResponse.ok) {
      console.error(`❌ Main worker health check failed: ${mainResponse.status}`);
      return false;
    }
    const mainHealth = await mainResponse.json();
    console.log(`✅ Main worker health check:`, mainHealth);

    return true;
  } catch (error) {
    console.error(`❌ Health check failed:`, error);
    return false;
  }
}

/**
 * Test 2: Trigger scheduled handler and verify game tick processing
 */
async function testScheduledHandlerFlow(): Promise<boolean> {
  console.log("\n🧪 Test 2: Scheduled Handler Flow\n");

  const supabase = getSupabase();

  try {
    // Ensure test users exist
    if (!TEST_USERS || TEST_USERS.length === 0) {
      TEST_USERS = await createTestUsers(supabase);
      if (TEST_USERS.length < 2) {
        throw new Error(`Expected 2 test users, but only ${TEST_USERS.length} were created`);
      }
    }

    // Get initial game state
    const initialGameState = await db.fetchGameStateFromDB(supabase);
    const initialTick = initialGameState?.current_tick || 0;
    console.log(`📊 Initial game state: tick ${initialTick}`);

    // Create a test game with a pending order
    console.log("📋 Setting up test game...");
    const game = await db.insertGameInDB(supabase, TEST_USERS[0].id, TEST_USERS[1].id, 10000.0, 60);
    await db.updateGameStatusInDB(supabase, game.id, "active");
    await db.insertGamePlayerInDB(supabase, game.id, TEST_USERS[0].id, 10000.0);

    // Create a pending market buy order
    const order = await db.insertOrderInDB(
      supabase,
      game.id,
      TEST_USERS[0].id,
      "BTC",
      "MARKET",
      "BUY",
      0.1
    );
    console.log(`✅ Created test game ${game.id} with pending order ${order.id}`);

    // Small delay to ensure order is committed to database
    await new Promise(resolve => setTimeout(resolve, 100));

    // Trigger the scheduled handler via Wrangler's built-in endpoint
    console.log(`🚀 Triggering scheduled handler via Wrangler endpoint...`);
    console.log(`   Note: Scheduled handler needs FINNHUB_API_KEY in .dev.vars`);
    
    // Trigger the scheduled handler via Wrangler's endpoint
    const scheduledResponse = await fetch(`${MAIN_WORKER_URL}/cdn-cgi/handler/scheduled`, {
      method: 'GET',
    });
    
    // Small delay to allow handler to start executing
    await new Promise(resolve => setTimeout(resolve, 500));

    // Wrangler's scheduled endpoint returns 200 even if handler succeeds
    // Check the response (might be empty or have error info)
    const responseText = await scheduledResponse.text();
    if (!scheduledResponse.ok) {
      console.error(`❌ Scheduled handler failed: ${scheduledResponse.status} - ${responseText}`);
      console.error(`   Check worker logs for errors (especially FINNHUB_API_KEY)`);
      // Cleanup
      await supabase.from("games").delete().eq("id", game.id);
      return false;
    }

    if (responseText) {
      try {
        const scheduledResult = JSON.parse(responseText);
        console.log(`✅ Scheduled handler executed:`, scheduledResult);
      } catch {
        console.log(`✅ Scheduled handler executed (status: ${scheduledResponse.status})`);
      }
    } else {
      console.log(`✅ Scheduled handler executed (status: ${scheduledResponse.status})`);
    }
    
    // Note: The scheduled handler might fail silently if FINNHUB_API_KEY is missing
    // We'll check the database state after waiting

    // Wait a bit for async processing to complete (scheduled handler is async)
    console.log("⏳ Waiting for async game processing...");
    await new Promise(resolve => setTimeout(resolve, 5000)); // Increased wait time for Finnhub API call
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/979c90c1-cd00-4e4c-95b3-401e6f950e32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'worker-e2e-test.ts:271',message:'before final game state check',data:{initialTick},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion

    // Verify game state was incremented
    console.log(`🔍 DEBUG: Checking game state after wait. Initial was: ${initialTick}`);
    const newGameState = await db.fetchGameStateFromDB(supabase);
    const newTick = newGameState?.current_tick || 0;
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/979c90c1-cd00-4e4c-95b3-401e6f950e32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'worker-e2e-test.ts:278',message:'after final game state check',data:{initialTick,newTick,incremented:newTick>initialTick},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    console.log(`🔍 DEBUG: New game state tick: ${newTick}, incremented: ${newTick > initialTick}`);
    
    if (newTick <= initialTick) {
      console.error(`❌ Game state not incremented. Expected > ${initialTick}, got ${newTick}`);
      console.error(`   This might be because:`);
      console.error(`   - Scheduled handler failed (check worker logs)`);
      console.error(`   - Finnhub API key is missing/invalid`);
      console.error(`   - Database connection issue`);
      await supabase.from("games").delete().eq("id", game.id);
      return false;
    }
    console.log(`✅ Game state incremented to tick ${newTick}`);

    // Verify price data was stored
    const priceData = await db.fetchPriceDataFromDB(supabase, "BTC", 1);
    if (priceData.length === 0) {
      console.error(`❌ No price data found for tick ${newTick}`);
      await supabase.from("games").delete().eq("id", game.id);
      return false;
    }
    console.log(`✅ Price data stored for tick ${newTick}`);

    // Verify order was processed
    const { data: updatedOrder } = await supabase
      .from("orders")
      .select("*")
      .eq("id", order.id)
      .single();

    if (!updatedOrder) {
      console.error(`❌ Order ${order.id} not found`);
      await supabase.from("games").delete().eq("id", game.id);
      return false;
    }

    if (updatedOrder.status !== 'filled' && updatedOrder.status !== 'pending') {
      console.log(`⚠️  Order status: ${updatedOrder.status} (may need more time or price data)`);
    } else {
      console.log(`✅ Order status: ${updatedOrder.status}`);
    }

    // Cleanup
    await supabase.from("games").delete().eq("id", game.id);
    console.log(`🧹 Cleaned up test game`);

    return true;
  } catch (error) {
    console.error(`❌ Test failed:`, error);
    return false;
  }
}

/**
 * Test 3: Game expiration timeout
 * Tests that expired games are marked as completed and skip tick processing
 */
async function testGameExpiration(): Promise<boolean> {
  console.log("\n🧪 Test 3: Game Expiration Test\n");

  const supabase = getSupabase();

  try {
    // Ensure test users are initialized
    if (!TEST_USERS || TEST_USERS.length === 0) {
      TEST_USERS = await createTestUsers(supabase);
      if (TEST_USERS.length < 2) {
        throw new Error(`Expected 2 test users, but only ${TEST_USERS.length} were created`);
      }
    }

    console.log("📋 Setting up expired game...");
    
    // Create a game with a very short duration (1 minute)
    const game = await db.insertGameInDB(
      supabase,
      TEST_USERS[0].id,
      TEST_USERS[1].id,
      10000.0,
      1 // 1 minute duration
    );
    await db.insertGamePlayerInDB(supabase, game.id, TEST_USERS[0].id, 10000.0);
    await db.insertGamePlayerInDB(supabase, game.id, TEST_USERS[1].id, 10000.0);
    
    // Start the game
    await db.updateGameStatusInDB(supabase, game.id, "active");
    
    // Manually set started_at to 2 minutes ago (expired)
    const expiredStartedAt = new Date();
    expiredStartedAt.setMinutes(expiredStartedAt.getMinutes() - 2); // 2 minutes ago (past 1 minute duration)
    
    await supabase
      .from("games")
      .update({ started_at: expiredStartedAt.toISOString() })
      .eq("id", game.id);
    
    console.log(`✅ Created expired game: ${game.id}`);
    console.log(`   Started at: ${expiredStartedAt.toISOString()}`);
    console.log(`   Duration: 1 minute`);
    console.log(`   Should be expired: Yes\n`);
    
    // Verify game is expired before triggering scheduled handler
    console.log("🔍 Verifying game is expired...");
    const beforeGames = await db.fetchGamesFromDB(supabase);
    const beforeGame = beforeGames.find(g => g.id === game.id);
    
    if (!beforeGame || beforeGame.status !== 'active') {
      console.error(`❌ Game should be active before tick: ${beforeGame?.status}`);
      return false;
    }
    console.log(`✅ Game is active before tick processing\n`);
    
    // Trigger scheduled handler - should process the expired game and mark it as completed
    console.log("🚀 Triggering scheduled handler...");
    const response = await fetch(`${MAIN_WORKER_URL}/cdn-cgi/handler/scheduled`, {
      method: 'GET',
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Scheduled handler failed: ${response.status} - ${errorText}`);
      return false;
    }

    console.log(`✅ Scheduled handler executed successfully\n`);
    
    // Wait a bit for async processing to complete
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Verify game was marked as completed
    console.log("🔍 Verifying game was marked as completed...");
    const afterGames = await db.fetchGamesFromDB(supabase);
    const afterGame = afterGames.find(g => g.id === game.id);
    
    if (!afterGame) {
      console.error(`❌ Game not found after tick`);
      return false;
    }
    
    if (afterGame.status !== 'completed') {
      console.error(`❌ Game should be completed but status is: ${afterGame.status}`);
      console.error(`   started_at: ${afterGame.started_at}`);
      console.error(`   ended_at: ${afterGame.ended_at}`);
      console.error(`   duration_minutes: ${afterGame.duration_minutes}`);
      return false;
    }
    
    if (!afterGame.ended_at) {
      console.error(`❌ Game should have ended_at set`);
      return false;
    }
    
    console.log(`✅ Game correctly marked as completed`);
    console.log(`   Status: ${afterGame.status}`);
    console.log(`   Ended at: ${new Date(afterGame.ended_at).toISOString()}\n`);
    
    // Cleanup
    await supabase.from("games").delete().eq("id", game.id);
    
    console.log("✅ Game expiration test passed!");
    return true;
  } catch (error) {
    console.error(`❌ Test failed:`, error);
    return false;
  }
}

/**
 * Clean up test games created by worker-e2e tests and reset game state
 */
async function cleanupWorkerE2ETestData(): Promise<void> {
  const supabase = getSupabase();
  
  try {
    // Ensure test users are initialized for filtering
    if (!TEST_USERS || TEST_USERS.length === 0) {
      TEST_USERS = await createTestUsers(supabase);
    }
    
    // Get all test games created by worker-e2e tests
    const games = await db.fetchGamesFromDB(supabase);
    const testGames = games.filter(
      (g) =>
        (TEST_USERS[0] && (g.player1_id === TEST_USERS[0].id || g.player2_id === TEST_USERS[0].id)) ||
        (TEST_USERS[1] && (g.player1_id === TEST_USERS[1].id || g.player2_id === TEST_USERS[1].id))
    );
    
    if (testGames.length > 0) {
      console.log(`🧹 Cleaning up ${testGames.length} leftover test game(s)...`);
      for (const game of testGames) {
        await supabase.from("games").delete().eq("id", game.id);
      }
      console.log(`✅ Cleaned up ${testGames.length} test game(s)`);
    }
    
    // Reset game state to 0 for test isolation
    console.log(`🔄 Resetting game state to tick 0...`);
    await db.updateGameStateInDB(supabase, 0);
    console.log(`✅ Game state reset to tick 0`);
  } catch (error) {
    console.warn(`⚠️  Warning: Failed to cleanup test data:`, error);
  }
}

/**
 * Run all worker E2E tests
 */
async function runAllWorkerE2ETests(): Promise<void> {
  console.log("🚀 Running Cloudflare Worker E2E Test Suite\n");
  console.log(`📡 Main worker URL: ${MAIN_WORKER_URL}`);
  console.log(`📡 Game-tick worker: Accessible via service binding only\n`);
  console.log(`⚠️  Note: Scheduled handler requires FINNHUB_API_KEY in .dev.vars`);
  console.log(`   If the test fails, check worker logs for Finnhub API errors\n`);
  
  // Clean up any leftover test data from previous runs
  await cleanupWorkerE2ETestData();
  console.log("");

  // Check if workers are running
  console.log("🔍 Checking if workers are running...");
  const { main } = await checkWorkersRunning();
  
  if (!main) {
    console.error("\n❌ Main worker is not running!");
    console.error("💡 Start it with: npm run dev:main");
    console.error("   Or run both workers with: npm run dev");
    process.exit(1);
  }

  console.log("✅ Main worker is running\n");

  // Check database connection
  const supabase = getSupabase();
  try {
    await db.fetchGameStateFromDB(supabase);
    console.log("✅ Database connection verified\n");
  } catch (error) {
    console.error("\n❌ Database connection failed!");
    console.error("💡 Make sure local Supabase is running:");
    console.error("   cd ../alpha-royale && npx supabase start");
    process.exit(1);
  }

  // Run tests
  const results = {
    health: false,
    scheduled: false,
    gameExpiration: false,
  };

  results.health = await testWorkerHealth();
  results.scheduled = await testScheduledHandlerFlow();
  results.gameExpiration = await testGameExpiration();

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("📊 Worker E2E Test Summary");
  console.log("=".repeat(50));
  console.log(`Health Check:        ${results.health ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`Scheduled Handler:   ${results.scheduled ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`Game Expiration:     ${results.gameExpiration ? "✅ PASS" : "❌ FAIL"}`);
  console.log("=".repeat(50));

  const allPassed = Object.values(results).every(r => r);
  if (allPassed) {
    console.log("\n✅ All worker E2E tests passed!");
    process.exit(0);
  } else {
    console.log("\n❌ Some tests failed");
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllWorkerE2ETests().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
