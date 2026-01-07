/**
 * Integration Test Setup Script
 * 
 * This script provides integration tests for game tick processing using a real Supabase database.
 * It includes utilities to populate test data, run game ticks, validate results, and execute
 * predefined test scenarios.
 * 
 * Test Scenarios:
 * - Market buy/sell orders
 * - Take profit and stop loss triggers
 * - Position P&L calculations
 * - Equity history tracking
 * - Order rejections
 * 
 * Usage:
 *   npm run test:integration setup          # Populate DB with test data
 *   npm run test:integration tick [gameId]  # Process one game tick
 *   npm run test:integration scenario <name> # Run predefined scenario
 *   npm run test:integration state          # Show current test state
 *   npm run test:integration clean          # Clean test data
 * 
 * @module test-setup
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as db from "./db";
import { processGameTick } from "./game";

// Test configuration
// Note: IDs will be fetched from database after user creation
const TEST_USER_EMAILS = ["player1@test.com", "player2@test.com"];

// Store actual user IDs after creation
let TEST_USERS: Array<{ id: string; email: string }> = [];

const TEST_SYMBOLS = ["BTC", "ETH", "AAPL"];

// Initialize Supabase client
function getSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL || "http://localhost:54321";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

  return createClient(url, key);
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
 * Setup test data in the database
 * 
 * @param options - Optional configuration for test data setup
 */
export async function setupTestData(options?: {
  initialBalance?: number;
  symbols?: string[];
  numGames?: number;
  playersPerGame?: number;
  durationMinutes?: number;
}): Promise<void> {
  console.log("🚀 Setting up test data...");
  
  // Check database connection first
  await checkDatabaseConnection();
  
  const supabase = getSupabase();

  try {
    // 1. Create test users in auth.users and get their actual IDs
    TEST_USERS = await createTestUsers(supabase);
    if (TEST_USERS.length < 2) {
      throw new Error(`Expected 2 test users, but only ${TEST_USERS.length} were created`);
    }
    
    // 2. Initialize game state if not exists
    console.log("📊 Initializing game state...");
    const gameState = await db.fetchGameStateFromDB(supabase);
    if (!gameState) {
      await db.updateGameStateInDB(supabase, 0);
      console.log("✅ Game state initialized at tick 0");
    } else {
      console.log(`✅ Game state exists at tick ${gameState.current_tick}`);
    }

    const initialBalance = options?.initialBalance ?? 10000.0;
    const symbols = options?.symbols ?? TEST_SYMBOLS;
    const numGames = options?.numGames ?? 1;
    const playersPerGame = options?.playersPerGame ?? 2;
    const durationMinutes = options?.durationMinutes ?? 60;

    // 3. Create test game(s)
    console.log(`🎮 Creating ${numGames} test game(s)...`);
    const games = [];

    for (let i = 0; i < numGames; i++) {
      const player2Id = playersPerGame > 1 ? TEST_USERS[1].id : null;
      const game = await db.insertGameInDB(
        supabase,
        TEST_USERS[0].id,
        player2Id,
        initialBalance,
        durationMinutes
      );
      await db.updateGameStatusInDB(supabase, game.id, "active");
      games.push(game);
      console.log(`✅ Created game ${i + 1}/${numGames}: ${game.id}`);
    }

    // 4. Add players to games (check if they already exist first)
    console.log(`👥 Adding players to ${numGames} game(s)...`);
    for (const game of games) {
      // Check if player1 already exists in game_players
      const existingPlayers = await db.fetchGamePlayersFromDB(supabase, game.id);
      const player1Exists = existingPlayers.some(p => p.user_id === TEST_USERS[0].id);
      
      if (!player1Exists) {
        await db.insertGamePlayerInDB(
          supabase,
          game.id,
          TEST_USERS[0].id,
          initialBalance
        );
      }
      if (playersPerGame > 1) {
        const player2Exists = existingPlayers.some(p => p.user_id === TEST_USERS[1].id);
        if (!player2Exists) {
          await db.insertGamePlayerInDB(
            supabase,
            game.id,
            TEST_USERS[1].id,
            initialBalance
          );
        }
      }
    }
    console.log(`✅ Added players to all games`);

    // 5. Insert price data for symbols
    console.log("📈 Inserting price data...");
    const currentTick = (await db.fetchGameStateFromDB(supabase))?.current_tick || 0;
    
    for (const symbol of symbols) {
      // Insert a few ticks of historical data
      for (let i = 0; i < 5; i++) {
        const basePrice = symbol === "BTC" ? 50000 : symbol === "ETH" ? 3000 : 150;
        const price = basePrice + (i * 100); // Simulate price movement
        await db.insertPrice(
          supabase,
          symbol,
          price,
          currentTick - 4 + i
        );
      }
    }
    console.log("✅ Price data inserted");

    // 6. Create test orders for first game only (for simplicity)
    if (games.length > 0) {
      console.log("📝 Creating test orders...");
      const game = games[0];
      
      // Market buy order for BTC
      const buyOrder = await db.insertOrderInDB(
        supabase,
        game.id,
        TEST_USERS[0].id,
        "BTC",
        "MARKET",
        "BUY",
        0.1,
        null,
        null,
        null
      );
      console.log(`✅ Created market buy order: ${buyOrder.id}`);

    // Take profit order (will be created after position is opened)
    // Stop loss order (will be created after position is opened)

      // Market sell order for ETH (will fail if no position exists)
      const sellOrder = await db.insertOrderInDB(
        supabase,
        game.id,
        TEST_USERS[0].id,
        "ETH",
        "MARKET",
        "SELL",
        1.0,
        null,
        null,
        null
      );
      console.log(`✅ Created market sell order (should fail): ${sellOrder.id}`);

      // 7. Create a test position for player 2 (if exists)
      if (playersPerGame > 1) {
        console.log("💼 Creating test positions...");
        const position = await db.insertPositionInDB(
          supabase,
          game.id,
          TEST_USERS[1].id,
          "BTC",
          "BUY",
          0.2,
          51000.0,
          1
        );
        console.log(`✅ Created position: ${position.id}`);

        // Create TP/SL orders for the position
        const tpOrder = await db.insertOrderInDB(
          supabase,
          game.id,
          TEST_USERS[1].id,
          "BTC",
          "TAKE_PROFIT",
          "SELL",
          0.2,
          null,
          55000.0, // trigger price
          position.id
        );
        
        const slOrder = await db.insertOrderInDB(
          supabase,
          game.id,
          TEST_USERS[1].id,
          "BTC",
          "STOP_LOSS",
          "SELL",
          0.2,
          null,
          48000.0, // trigger price
          position.id
        );
        console.log(`✅ Created TP order: ${tpOrder.id}`);
        console.log(`✅ Created SL order: ${slOrder.id}`);
      }
    }

    console.log("\n✅ Test data setup complete!");
    console.log(`\n📋 Summary:`);
    console.log(`   Games: ${games.length}`);
    console.log(`   Players per game: ${playersPerGame}`);
    console.log(`   Initial balance: $${initialBalance}`);
    console.log(`   Symbols: ${symbols.join(", ")}`);
    console.log(`   Current Tick: ${currentTick}`);
    console.log(`\n💡 Next steps:`);
    console.log(`   1. Insert current tick price data (needed for order execution)`);
    console.log(`   2. Run: npx tsx src/test-setup.ts tick`);
  } catch (error) {
    console.error("❌ Error setting up test data:", error);
    throw error;
  }
}

/**
 * Process a single game tick
 */
export async function processTestTick(gameId?: string): Promise<void> {
  console.log("⚙️  Processing game tick...");
  
  // Check database connection first
  await checkDatabaseConnection();
  
  const supabase = getSupabase();

  try {
    // Get or increment game state
    const gameState = await db.fetchGameStateFromDB(supabase);
    if (!gameState) {
      throw new Error("Game state not initialized. Run 'setup' first.");
    }

    const newTick = gameState.current_tick + 1;
    console.log(`📊 Current tick: ${gameState.current_tick} -> ${newTick}`);

    // Insert price data for the new tick
    console.log("📈 Inserting price data for new tick...");
    for (const symbol of TEST_SYMBOLS) {
      const basePrice = symbol === "BTC" ? 51000 : symbol === "ETH" ? 3100 : 151;
      // Add some random variation
      const variation = (Math.random() - 0.5) * 1000;
      const price = basePrice + variation;
      
      await db.insertPrice(supabase, symbol, price, newTick);
      console.log(`   ${symbol}: $${price.toFixed(2)}`);
    }

    // Update game state
    await db.updateGameStateInDB(supabase, newTick);

    // Get active games
    let games;
    if (gameId) {
      const allGames = await db.fetchGamesFromDB(supabase);
      const foundGame = allGames.find((g) => g.id === gameId);
      games = foundGame ? [foundGame] : [];
    } else {
      games = await db.fetchGamesFromDB(supabase, "active");
    }

    if (games.length === 0) {
      console.log("⚠️  No active games found");
      return;
    }

    // Process each game
    for (const game of games) {
      console.log(`\n🎮 Processing game: ${game.id}`);
      await processGameTick(game.id, newTick, supabase);
    }

    // Show results
    console.log("\n📊 Game State Summary:");
    for (const game of games) {
      const players = await db.fetchGamePlayersFromDB(supabase, game.id);
      const positions = await db.fetchPositionsFromDB(supabase, game.id, "open");
      const orders = await db.fetchOrdersFromDB(supabase, game.id, "pending");

      console.log(`\n   Game ${game.id}:`);
      for (const player of players) {
        console.log(`     Player ${player.user_id}:`);
        console.log(`       Balance: $${Number(player.balance).toFixed(2)}`);
        console.log(`       Equity: $${Number(player.equity).toFixed(2)}`);
      }
      console.log(`     Open Positions: ${positions.length}`);
      console.log(`     Pending Orders: ${orders.length}`);
    }

    console.log("\n✅ Game tick processed successfully!");
  } catch (error) {
    console.error("❌ Error processing game tick:", error);
    throw error;
  }
}

/**
 * Clean up test data
 */
export async function cleanTestData(): Promise<void> {
  console.log("🧹 Cleaning up test data...");
  
  // Check database connection first
  await checkDatabaseConnection();
  
  const supabase = getSupabase();

  try {
    // Ensure test users are initialized
    if (!TEST_USERS || TEST_USERS.length === 0) {
      console.log("👤 Initializing test users...");
      TEST_USERS = await createTestUsers(supabase);
    }

    // Get all test games
    const games = await db.fetchGamesFromDB(supabase);
    const testGames = games.filter(
      (g) =>
        (TEST_USERS[0] && (g.player1_id === TEST_USERS[0].id || g.player2_id === TEST_USERS[0].id)) ||
        (TEST_USERS[1] && (g.player1_id === TEST_USERS[1].id || g.player2_id === TEST_USERS[1].id))
    );

    // Delete test games (cascade will delete related data)
    for (const game of testGames) {
      const { error } = await supabase.from("games").delete().eq("id", game.id);
      if (error) {
        console.error(`Failed to delete game ${game.id}:`, error);
      } else {
        console.log(`✅ Deleted game: ${game.id}`);
      }
    }

    // Clean price data (optional - you might want to keep this)
    console.log("⚠️  Note: Price data not cleaned. Clean manually if needed.");

    console.log("\n✅ Cleanup complete!");
  } catch (error) {
    console.error("❌ Error cleaning up:", error);
    throw error;
  }
}

/**
 * Validation result interface
 */
interface ValidationResult {
  passed: boolean;
  message: string;
  details?: any;
}

/**
 * Validate test results after a game tick
 */
export async function validateTestResults(
  gameId: string,
  expectedState?: {
    filledOrders?: string[];
    rejectedOrders?: string[];
    openPositions?: number;
    playerBalances?: Record<string, { balance: number; equity: number }>;
    equityHistoryRecorded?: boolean;
  }
): Promise<ValidationResult[]> {
  const supabase = getSupabase();
  const results: ValidationResult[] = [];

  try {
    // Validate orders
    const allOrders = await db.fetchOrdersFromDB(supabase, gameId);
    if (expectedState?.filledOrders) {
      for (const orderId of expectedState.filledOrders) {
        const order = allOrders.find((o) => o.id === orderId);
        if (order?.status === "filled") {
          results.push({
            passed: true,
            message: `Order ${orderId} was filled as expected`,
          });
        } else {
          results.push({
            passed: false,
            message: `Order ${orderId} was not filled. Status: ${order?.status || "not found"}`,
          });
        }
      }
    }

    if (expectedState?.rejectedOrders) {
      for (const orderId of expectedState.rejectedOrders) {
        const order = allOrders.find((o) => o.id === orderId);
        if (order?.status === "rejected") {
          results.push({
            passed: true,
            message: `Order ${orderId} was rejected as expected`,
          });
        } else {
          results.push({
            passed: false,
            message: `Order ${orderId} was not rejected. Status: ${order?.status || "not found"}`,
          });
        }
      }
    }

    // Validate positions
    const openPositions = await db.fetchPositionsFromDB(supabase, gameId, "open");
    if (expectedState?.openPositions !== undefined) {
      if (openPositions.length === expectedState.openPositions) {
        results.push({
          passed: true,
          message: `Correct number of open positions: ${openPositions.length}`,
        });
      } else {
        results.push({
          passed: false,
          message: `Expected ${expectedState.openPositions} open positions, got ${openPositions.length}`,
        });
      }
    }

    // Validate player balances and equity
    const players = await db.fetchGamePlayersFromDB(supabase, gameId);
    if (expectedState?.playerBalances) {
      for (const [playerId, expected] of Object.entries(expectedState.playerBalances)) {
        const player = players.find((p) => p.user_id === playerId);
        if (player) {
          const balanceMatch = Math.abs(Number(player.balance) - expected.balance) < 0.01;
          const equityMatch = Math.abs(Number(player.equity) - expected.equity) < 0.01;

          if (balanceMatch && equityMatch) {
            results.push({
              passed: true,
              message: `Player ${playerId} balances match`,
              details: { balance: Number(player.balance), equity: Number(player.equity) },
            });
          } else {
            results.push({
              passed: false,
              message: `Player ${playerId} balances don't match`,
              details: {
                expected: expected,
                actual: {
                  balance: Number(player.balance),
                  equity: Number(player.equity),
                },
                diff: {
                  balance: Number(player.balance) - expected.balance,
                  equity: Number(player.equity) - expected.equity,
                },
              },
            });
          }
        } else {
          results.push({
            passed: false,
            message: `Player ${playerId} not found`,
          });
        }
      }
    }

    // Validate equity history
    if (expectedState?.equityHistoryRecorded) {
      const gameState = await db.fetchGameStateFromDB(supabase);
      if (gameState) {
        const history = await db.fetchEquityHistoryFromDB(supabase, gameId);
        const recentHistory = history.filter((h) => h.game_state === gameState.current_tick);
        if (recentHistory.length > 0) {
          results.push({
            passed: true,
            message: `Equity history recorded for tick ${gameState.current_tick}`,
          });
        } else {
          results.push({
            passed: false,
            message: `Equity history not recorded for tick ${gameState.current_tick}`,
          });
        }
      }
    }

    return results;
  } catch (error) {
    results.push({
      passed: false,
      message: `Validation error: ${error instanceof Error ? error.message : String(error)}`,
    });
    return results;
  }
}

/**
 * Run a predefined test scenario
 */
export async function runScenario(scenarioName: string): Promise<boolean> {
  console.log(`\n🧪 Running scenario: ${scenarioName}\n`);
  const supabase = getSupabase();

  try {
    // Ensure test users are initialized
    if (!TEST_USERS || TEST_USERS.length === 0) {
      console.log("👤 Initializing test users...");
      TEST_USERS = await createTestUsers(supabase);
      if (TEST_USERS.length < 2) {
        throw new Error(`Expected 2 test users, but only ${TEST_USERS.length} were created`);
      }
    }

    switch (scenarioName) {
      case "marketBuy":
        return await scenario_marketBuyCreatesPosition();
      case "marketSell":
        return await scenario_marketSellRejected();
      case "takeProfit":
        return await scenario_takeProfitTriggers();
      case "stopLoss":
        return await scenario_stopLossTriggers();
      case "positionPnl":
        return await scenario_positionPnlCalculation();
      case "equityHistory":
        return await scenario_equityHistoryTracking();
      case "extended":
        return await scenario_extendedTrading();
      case "gameExpiration":
        return await scenario_gameExpiration();
      case "positionMerging":
        return await scenario_positionMerging();
      case "insufficientBalance":
        return await scenario_insufficientBalance();
      case "partialSell":
        return await scenario_partialSell();
      case "partialTakeProfit":
        return await scenario_partialTakeProfit();
      default:
        console.error(`Unknown scenario: ${scenarioName}`);
        return false;
    }
  } catch (error) {
    console.error(`❌ Scenario ${scenarioName} failed:`, error);
    return false;
  }
}

/**
 * Scenario 1: Market buy order creates position
 */
async function scenario_marketBuyCreatesPosition(): Promise<boolean> {
  const supabase = getSupabase();
  const playerId = TEST_USERS[0].id;
  const symbol = "BTC";
  const quantity = 0.1;
  const fillPrice = 50000;

  try {
    // Setup: Create game and player
    const game = await db.insertGameInDB(supabase, playerId, null, 10000.0, 60);
    await db.updateGameStatusInDB(supabase, game.id, "active");
    await db.insertGamePlayerInDB(supabase, game.id, playerId, 10000.0);

    // Create market buy order
    const order = await db.insertOrderInDB(
      supabase,
      game.id,
      playerId,
      symbol,
      "MARKET",
      "BUY",
      quantity
    );

    // Insert price data
    const gameState = await db.fetchGameStateFromDB(supabase);
    const tick = (gameState?.current_tick || 0) + 1;
    await db.insertPrice(supabase, symbol, fillPrice, tick);
    await db.updateGameStateInDB(supabase, tick);

    // Execute tick
    await processGameTick(game.id, tick, supabase);

    // Validate
    const cost = fillPrice * quantity; // 50000 * 0.1 = 5000
    const results = await validateTestResults(game.id, {
      filledOrders: [order.id],
      openPositions: 1,
      playerBalances: {
        [playerId]: {
          balance: 10000.0 - cost, // 5000 after purchase
          equity: 10000.0 - cost, // Equity = balance + unrealized P&L. Since position just opened at current price, P&L = 0, so equity = balance
        },
      },
    });

    // Report
    const passed = results.every((r) => r.passed);
    console.log(passed ? "✅ Scenario passed" : "❌ Scenario failed");
    results.forEach((r) => {
      console.log(`  ${r.passed ? "✓" : "✗"} ${r.message}`);
      if (!r.passed && r.details) {
        console.log(`    Details:`, JSON.stringify(r.details, null, 2));
      }
    });

    // Cleanup
    await supabase.from("games").delete().eq("id", game.id);

    return passed;
  } catch (error) {
    console.error("Error in scenario:", error);
    return false;
  }
}

/**
 * Scenario 2: Market sell order rejected (no position)
 */
async function scenario_marketSellRejected(): Promise<boolean> {
  const supabase = getSupabase();
  const playerId = TEST_USERS[0].id;
  const symbol = "ETH";
  const quantity = 1.0;

  try {
    const game = await db.insertGameInDB(supabase, playerId, null, 10000.0, 60);
    await db.updateGameStatusInDB(supabase, game.id, "active");
    await db.insertGamePlayerInDB(supabase, game.id, playerId, 10000.0);

    const order = await db.insertOrderInDB(
      supabase,
      game.id,
      playerId,
      symbol,
      "MARKET",
      "SELL",
      quantity
    );

    const gameState = await db.fetchGameStateFromDB(supabase);
    const tick = (gameState?.current_tick || 0) + 1;
    await db.insertPrice(supabase, symbol, 3000, tick);
    await db.updateGameStateInDB(supabase, tick);

    await processGameTick(game.id, tick, supabase);

    const results = await validateTestResults(game.id, {
      rejectedOrders: [order.id],
      openPositions: 0,
      playerBalances: {
        [playerId]: { balance: 10000.0, equity: 10000.0 },
      },
    });

    const passed = results.every((r) => r.passed);
    console.log(passed ? "✅ Scenario passed" : "❌ Scenario failed");
    results.forEach((r) => {
      console.log(`  ${r.passed ? "✓" : "✗"} ${r.message}`);
    });

    await supabase.from("games").delete().eq("id", game.id);
    return passed;
  } catch (error) {
    console.error("Error in scenario:", error);
    return false;
  }
}

/**
 * Scenario 3: Take profit order triggers
 */
async function scenario_takeProfitTriggers(): Promise<boolean> {
  const supabase = getSupabase();
  const playerId = TEST_USERS[0].id;
  const symbol = "BTC";
  const entryPrice = 51000;
  const triggerPrice = 55000;
  const currentPrice = 55100;
  const quantity = 0.2;

  try {
    const game = await db.insertGameInDB(supabase, playerId, null, 10000.0, 60);
    await db.updateGameStatusInDB(supabase, game.id, "active");
    await db.insertGamePlayerInDB(supabase, game.id, playerId, 10000.0);

    // Create position
    const position = await db.insertPositionInDB(
      supabase,
      game.id,
      playerId,
      symbol,
      "BUY",
      quantity,
      entryPrice
    );

    // Create TP order
    const tpOrder = await db.insertOrderInDB(
      supabase,
      game.id,
      playerId,
      symbol,
      "TAKE_PROFIT",
      "SELL",
      quantity,
      null,
      triggerPrice,
      position.id
    );

    const gameState = await db.fetchGameStateFromDB(supabase);
    const tick = (gameState?.current_tick || 0) + 1;
    await db.insertPrice(supabase, symbol, currentPrice, tick);
    await db.updateGameStateInDB(supabase, tick);

    await processGameTick(game.id, tick, supabase);

    const results = await validateTestResults(game.id, {
      filledOrders: [tpOrder.id],
      openPositions: 0, // Position should be closed
    });

    const passed = results.every((r) => r.passed);
    console.log(passed ? "✅ Scenario passed" : "❌ Scenario failed");
    results.forEach((r) => {
      console.log(`  ${r.passed ? "✓" : "✗"} ${r.message}`);
    });

    await supabase.from("games").delete().eq("id", game.id);
    return passed;
  } catch (error) {
    console.error("Error in scenario:", error);
    return false;
  }
}

/**
 * Scenario 4: Stop loss order triggers
 */
async function scenario_stopLossTriggers(): Promise<boolean> {
  const supabase = getSupabase();
  const playerId = TEST_USERS[0].id;
  const symbol = "BTC";
  const entryPrice = 51000;
  const triggerPrice = 48000;
  const currentPrice = 47900;
  const quantity = 0.2;

  try {
    const game = await db.insertGameInDB(supabase, playerId, null, 10000.0, 60);
    await db.updateGameStatusInDB(supabase, game.id, "active");
    await db.insertGamePlayerInDB(supabase, game.id, playerId, 10000.0);

    const position = await db.insertPositionInDB(
      supabase,
      game.id,
      playerId,
      symbol,
      "BUY",
      quantity,
      entryPrice
    );

    const slOrder = await db.insertOrderInDB(
      supabase,
      game.id,
      playerId,
      symbol,
      "STOP_LOSS",
      "SELL",
      quantity,
      null,
      triggerPrice,
      position.id
    );

    const gameState = await db.fetchGameStateFromDB(supabase);
    const tick = (gameState?.current_tick || 0) + 1;
    await db.insertPrice(supabase, symbol, currentPrice, tick);
    await db.updateGameStateInDB(supabase, tick);

    await processGameTick(game.id, tick, supabase);

    const results = await validateTestResults(game.id, {
      filledOrders: [slOrder.id],
      openPositions: 0,
    });

    const passed = results.every((r) => r.passed);
    console.log(passed ? "✅ Scenario passed" : "❌ Scenario failed");
    results.forEach((r) => {
      console.log(`  ${r.passed ? "✓" : "✗"} ${r.message}`);
    });

    await supabase.from("games").delete().eq("id", game.id);
    return passed;
  } catch (error) {
    console.error("Error in scenario:", error);
    return false;
  }
}

/**
 * Scenario 5: Position P&L calculation
 */
async function scenario_positionPnlCalculation(): Promise<boolean> {
  const supabase = getSupabase();
  const playerId = TEST_USERS[0].id;
  const symbol = "BTC";
  const entryPrice = 50000;
  const currentPrice = 51000;
  const quantity = 0.1;

  try {
    const game = await db.insertGameInDB(supabase, playerId, null, 10000.0, 60);
    await db.updateGameStatusInDB(supabase, game.id, "active");
    await db.insertGamePlayerInDB(supabase, game.id, playerId, 10000.0);

    await db.insertPositionInDB(
      supabase,
      game.id,
      playerId,
      symbol,
      "BUY",
      quantity,
      entryPrice
    );

    const gameState = await db.fetchGameStateFromDB(supabase);
    const tick = (gameState?.current_tick || 0) + 1;
    await db.insertPrice(supabase, symbol, currentPrice, tick);
    await db.updateGameStateInDB(supabase, tick);

    await processGameTick(game.id, tick, supabase);

    // Check position P&L
    const positions = await db.fetchPositionsFromDB(supabase, game.id, "open");
    const position = positions[0];
    const expectedPnl = (currentPrice - entryPrice) * quantity;

    if (position && Math.abs(Number(position.unrealized_pnl) - expectedPnl) < 0.01) {
      console.log("✅ Scenario passed: P&L calculated correctly");
      await supabase.from("games").delete().eq("id", game.id);
      return true;
    } else {
      console.log("❌ Scenario failed: P&L mismatch");
      await supabase.from("games").delete().eq("id", game.id);
      return false;
    }
  } catch (error) {
    console.error("Error in scenario:", error);
    return false;
  }
}

/**
 * Scenario 6: Equity history tracking
 */
async function scenario_equityHistoryTracking(): Promise<boolean> {
  const supabase = getSupabase();
  const playerId = TEST_USERS[0].id;

  try {
    const game = await db.insertGameInDB(supabase, playerId, null, 10000.0, 60);
    await db.updateGameStatusInDB(supabase, game.id, "active");
    await db.insertGamePlayerInDB(supabase, game.id, playerId, 10000.0);

    const gameState = await db.fetchGameStateFromDB(supabase);
    const tick = (gameState?.current_tick || 0) + 1;
    await db.updateGameStateInDB(supabase, tick);

    await processGameTick(game.id, tick, supabase);

    const results = await validateTestResults(game.id, {
      equityHistoryRecorded: true,
    });

    const passed = results.every((r) => r.passed);
    console.log(passed ? "✅ Scenario passed" : "❌ Scenario failed");
    results.forEach((r) => {
      console.log(`  ${r.passed ? "✓" : "✗"} ${r.message}`);
    });

    await supabase.from("games").delete().eq("id", game.id);
    return passed;
  } catch (error) {
    console.error("Error in scenario:", error);
    return false;
  }
}

/**
 * Scenario 7: Extended trading scenario with multiple trades across multiple ticks
 */
async function scenario_extendedTrading(): Promise<boolean> {
  const supabase = getSupabase();
  const playerId = TEST_USERS[0].id;
  const initialBalance = 10000.0;
  let allPassed = true;

  try {
    // Setup: Create game and player
    console.log("📋 Setting up extended trading scenario...");
    const game = await db.insertGameInDB(supabase, playerId, null, initialBalance, 60);
    await db.updateGameStatusInDB(supabase, game.id, "active");
    await db.insertGamePlayerInDB(supabase, game.id, playerId, initialBalance);

    // Get initial game state
    let gameState = await db.fetchGameStateFromDB(supabase);
    let currentTick = (gameState?.current_tick || 0);

    // Price progression: BTC starts at 50000, ETH at 3000
    const priceData: Array<{ tick: number; BTC: number; ETH: number }> = [
      { tick: currentTick + 1, BTC: 50000, ETH: 3000 }, // Tick 1: Buy BTC
      { tick: currentTick + 2, BTC: 51000, ETH: 3100 }, // Tick 2: Buy ETH (BTC up)
      { tick: currentTick + 3, BTC: 52000, ETH: 3200 }, // Tick 3: Sell BTC (profit)
      { tick: currentTick + 4, BTC: 51500, ETH: 3250 }, // Tick 4: Sell ETH (profit)
      { tick: currentTick + 5, BTC: 53000, ETH: 3300 }, // Tick 5: Buy BTC again
    ];

    const btcQuantity1 = 0.1;
    const ethQuantity2 = 1.5;
    const btcQuantity5 = 0.15;

    console.log("\n🎯 Tick 1: Buy 0.1 BTC at $50,000");
    // Insert price data for tick 1
    await db.insertPrice(supabase, "BTC", priceData[0].BTC, priceData[0].tick);
    await db.insertPrice(supabase, "ETH", priceData[0].ETH, priceData[0].tick);
    await db.updateGameStateInDB(supabase, priceData[0].tick);
    
    // Create buy order for BTC
    const order1 = await db.insertOrderInDB(
      supabase,
      game.id,
      playerId,
      "BTC",
      "MARKET",
      "BUY",
      btcQuantity1
    );
    
    await processGameTick(game.id, priceData[0].tick, supabase);
    
    // Validate
    const players1 = await db.fetchGamePlayersFromDB(supabase, game.id);
    const positions1 = await db.fetchPositionsFromDB(supabase, game.id, "open");
    const cost1 = priceData[0].BTC * btcQuantity1; // 50000 * 0.1 = 5000
    const expectedBalance1 = initialBalance - cost1; // 5000
    
    console.log(`   Balance: $${Number(players1[0].balance).toFixed(2)} (expected: $${expectedBalance1.toFixed(2)})`);
    console.log(`   Positions: ${positions1.length} (expected: 1)`);
    
    if (Math.abs(Number(players1[0].balance) - expectedBalance1) > 0.01 || positions1.length !== 1) {
      console.log("   ❌ Validation failed");
      allPassed = false;
    } else {
      console.log("   ✅ Validation passed");
    }

    console.log("\n🎯 Tick 2: Buy 1.5 ETH at $3,100 (while holding BTC)");
    await db.insertPrice(supabase, "BTC", priceData[1].BTC, priceData[1].tick);
    await db.insertPrice(supabase, "ETH", priceData[1].ETH, priceData[1].tick);
    await db.updateGameStateInDB(supabase, priceData[1].tick);
    
    const order2 = await db.insertOrderInDB(
      supabase,
      game.id,
      playerId,
      "ETH",
      "MARKET",
      "BUY",
      ethQuantity2
    );
    
    await processGameTick(game.id, priceData[1].tick, supabase);
    
    // Validate
    const players2 = await db.fetchGamePlayersFromDB(supabase, game.id);
    const positions2 = await db.fetchPositionsFromDB(supabase, game.id, "open");
    const cost2 = priceData[1].ETH * ethQuantity2; // 3100 * 1.5 = 4650
    const expectedBalance2 = expectedBalance1 - cost2; // 5000 - 4650 = 350
    
    console.log(`   Balance: $${Number(players2[0].balance).toFixed(2)} (expected: $${expectedBalance2.toFixed(2)})`);
    console.log(`   Positions: ${positions2.length} (expected: 2)`);
    
    if (Math.abs(Number(players2[0].balance) - expectedBalance2) > 0.01 || positions2.length !== 2) {
      console.log("   ❌ Validation failed");
      allPassed = false;
    } else {
      console.log("   ✅ Validation passed");
    }

    console.log("\n🎯 Tick 3: Sell 0.1 BTC at $52,000 (realize profit)");
    await db.insertPrice(supabase, "BTC", priceData[2].BTC, priceData[2].tick);
    await db.insertPrice(supabase, "ETH", priceData[2].ETH, priceData[2].tick);
    await db.updateGameStateInDB(supabase, priceData[2].tick);
    
    const order3 = await db.insertOrderInDB(
      supabase,
      game.id,
      playerId,
      "BTC",
      "MARKET",
      "SELL",
      btcQuantity1
    );
    
    await processGameTick(game.id, priceData[2].tick, supabase);
    
    // Validate
    const players3 = await db.fetchGamePlayersFromDB(supabase, game.id);
    const positions3 = await db.fetchPositionsFromDB(supabase, game.id, "open");
    const proceeds3 = priceData[2].BTC * btcQuantity1; // 52000 * 0.1 = 5200
    const profit3 = proceeds3 - cost1; // 5200 - 5000 = 200
    const expectedBalance3 = expectedBalance2 + proceeds3; // -1200 + 5200 = 4000
    
    console.log(`   Balance: $${Number(players3[0].balance).toFixed(2)} (expected: $${expectedBalance3.toFixed(2)})`);
    console.log(`   Profit from BTC trade: $${profit3.toFixed(2)}`);
    console.log(`   Positions: ${positions3.length} (expected: 1, only ETH remaining)`);
    
    if (Math.abs(Number(players3[0].balance) - expectedBalance3) > 0.01 || positions3.length !== 1 || positions3[0].symbol !== "ETH") {
      console.log("   ❌ Validation failed");
      allPassed = false;
    } else {
      console.log("   ✅ Validation passed");
    }

    console.log("\n🎯 Tick 4: Sell 1.5 ETH at $3,250 (realize profit)");
    await db.insertPrice(supabase, "BTC", priceData[3].BTC, priceData[3].tick);
    await db.insertPrice(supabase, "ETH", priceData[3].ETH, priceData[3].tick);
    await db.updateGameStateInDB(supabase, priceData[3].tick);
    
    const order4 = await db.insertOrderInDB(
      supabase,
      game.id,
      playerId,
      "ETH",
      "MARKET",
      "SELL",
      ethQuantity2
    );
    
    await processGameTick(game.id, priceData[3].tick, supabase);
    
    // Validate
    const players4 = await db.fetchGamePlayersFromDB(supabase, game.id);
    const positions4 = await db.fetchPositionsFromDB(supabase, game.id, "open");
    const proceeds4 = priceData[3].ETH * ethQuantity2; // 3250 * 1.5 = 4875
    const profit4 = proceeds4 - cost2; // 4875 - 4650 = 225
    const expectedBalance4 = expectedBalance3 + proceeds4; // 4000 + 4875 = 8875
    
    console.log(`   Balance: $${Number(players4[0].balance).toFixed(2)} (expected: $${expectedBalance4.toFixed(2)})`);
    console.log(`   Profit from ETH trade: $${profit4.toFixed(2)}`);
    console.log(`   Total profit: $${(profit3 + profit4).toFixed(2)}`);
    console.log(`   Positions: ${positions4.length} (expected: 0)`);
    
    if (Math.abs(Number(players4[0].balance) - expectedBalance4) > 0.01 || positions4.length !== 0) {
      console.log("   ❌ Validation failed");
      allPassed = false;
    } else {
      console.log("   ✅ Validation passed");
    }

    console.log("\n🎯 Tick 5: Buy 0.15 BTC at $53,000");
    await db.insertPrice(supabase, "BTC", priceData[4].BTC, priceData[4].tick);
    await db.insertPrice(supabase, "ETH", priceData[4].ETH, priceData[4].tick);
    await db.updateGameStateInDB(supabase, priceData[4].tick);
    
    const order5 = await db.insertOrderInDB(
      supabase,
      game.id,
      playerId,
      "BTC",
      "MARKET",
      "BUY",
      btcQuantity5
    );
    
    await processGameTick(game.id, priceData[4].tick, supabase);
    
    // Validate
    const players5 = await db.fetchGamePlayersFromDB(supabase, game.id);
    const positions5 = await db.fetchPositionsFromDB(supabase, game.id, "open");
    const cost5 = priceData[4].BTC * btcQuantity5; // 53000 * 0.15 = 7950
    const expectedBalance5 = expectedBalance4 - cost5; // 10500 - 7950 = 2550
    
    console.log(`   Balance: $${Number(players5[0].balance).toFixed(2)} (expected: $${expectedBalance5.toFixed(2)})`);
    console.log(`   Positions: ${positions5.length} (expected: 1)`);
    
    if (Math.abs(Number(players5[0].balance) - expectedBalance5) > 0.01 || positions5.length !== 1) {
      console.log("   ❌ Validation failed");
      allPassed = false;
    } else {
      console.log("   ✅ Validation passed");
    }

    // Final summary
    console.log("\n📊 Final Summary:");
    const finalPlayers = await db.fetchGamePlayersFromDB(supabase, game.id);
    const finalPositions = await db.fetchPositionsFromDB(supabase, game.id, "open");
    const finalOrders = await db.fetchOrdersFromDB(supabase, game.id);
    
    console.log(`   Final Balance: $${Number(finalPlayers[0].balance).toFixed(2)}`);
    console.log(`   Final Equity: $${Number(finalPlayers[0].equity).toFixed(2)}`);
    console.log(`   Open Positions: ${finalPositions.length}`);
    console.log(`   Total Orders: ${finalOrders.length}`);
    console.log(`   Filled Orders: ${finalOrders.filter(o => o.status === "filled").length}`);
    
    const totalProfit = Number(finalPlayers[0].balance) - initialBalance;
    console.log(`   Net Profit/Loss: $${totalProfit.toFixed(2)} (${((totalProfit / initialBalance) * 100).toFixed(2)}%)`);

    // Cleanup
    await supabase.from("games").delete().eq("id", game.id);

    if (allPassed) {
      console.log("\n✅ Extended trading scenario passed!");
    } else {
      console.log("\n❌ Extended trading scenario failed (some validations failed)");
    }

    return allPassed;
  } catch (error) {
    console.error("❌ Error in extended trading scenario:", error);
    return false;
  }
}

/**
 * Show current test data state
 */
export async function showTestState(): Promise<void> {
  console.log("📊 Current Test Data State:\n");
  
  // Check database connection first
  await checkDatabaseConnection();
  
  const supabase = getSupabase();

  try {
    const gameState = await db.fetchGameStateFromDB(supabase);
    console.log(`Game State: Tick ${gameState?.current_tick || 0}`);

    const games = await db.fetchGamesFromDB(supabase);
    console.log(`\nGames (${games.length}):`);
    for (const game of games) {
      const players = await db.fetchGamePlayersFromDB(supabase, game.id);
      const positions = await db.fetchPositionsFromDB(supabase, game.id);
      const orders = await db.fetchOrdersFromDB(supabase, game.id);

      console.log(`  ${game.id} [${game.status}]`);
      console.log(`    Players: ${players.length}`);
      console.log(`    Positions: ${positions.length} (${positions.filter((p) => p.status === "open").length} open)`);
      console.log(`    Orders: ${orders.length} (${orders.filter((o) => o.status === "pending").length} pending)`);
    }
  } catch (error) {
    console.error("❌ Error showing state:", error);
    throw error;
  }
}

// CLI handler
async function main() {
  const command = process.argv[2] || "help";

  switch (command) {
    case "setup":
      await setupTestData();
      break;
    case "tick":
      await processTestTick(process.argv[3]);
      break;
    case "clean":
      await cleanTestData();
      break;
    case "state":
      await showTestState();
      break;
    case "scenario":
      const scenarioName = process.argv[3];
      if (!scenarioName) {
        console.log("Available scenarios: marketBuy, marketSell, takeProfit, stopLoss, positionPnl, equityHistory, extended");
        break;
      }
      await runScenario(scenarioName);
      break;
    default:
      console.log(`
Usage: npx tsx src/test-setup.ts <command> [options]

Commands:
  setup                    Populate database with test data
  tick [gameId]            Process one game tick (optionally for specific game)
  clean                    Clean up test data
  state                    Show current test data state
  scenario <name>          Run a predefined test scenario

Available scenarios:
  marketBuy                Test market buy order creates position
  marketSell               Test market sell order rejected (no position)
  takeProfit               Test take profit order triggers
  stopLoss                 Test stop loss order triggers
  positionPnl              Test position P&L calculation
  equityHistory            Test equity history tracking
  extended                 Extended trading scenario with multiple trades across multiple ticks
  gameExpiration           Test game expiration timeout functionality
  positionMerging          Test position merging when buying into existing position
  insufficientBalance      Test balance rejection when funds are insufficient
  partialSell              Test partial position close on sell
  partialTakeProfit        Test partial position close on take profit

Examples:
  npx tsx src/test-setup.ts setup
  npx tsx src/test-setup.ts tick
  npx tsx src/test-setup.ts tick <game-id>
  npx tsx src/test-setup.ts state
  npx tsx src/test-setup.ts clean
  npx tsx src/test-setup.ts scenario marketBuy
  npx tsx src/test-setup.ts scenario gameExpiration
      `);
  }
}

/**
 * Scenario 8: Game expiration timeout
 * Tests that games with duration_minutes automatically complete when expired
 */
async function scenario_gameExpiration(): Promise<boolean> {
  const supabase = getSupabase();
  const playerId = TEST_USERS[0].id;
  const initialBalance = 10000.0;

  try {
    console.log("📋 Setting up game expiration scenario...");
    
    // Create a game with a very short duration (1 minute)
    const game = await db.insertGameInDB(supabase, playerId, null, initialBalance, 1); // 1 minute duration
    await db.insertGamePlayerInDB(supabase, game.id, playerId, initialBalance);
    
    // Test 1: Game hasn't started yet (started_at is NULL) - should not expire
    console.log("\n🧪 Test 1: Game with NULL started_at should not expire");
    const notStartedResult = await db.checkAndCompleteGameIfExpired(supabase, game.id);
    const game1 = await db.fetchGamesFromDB(supabase);
    const game1State = game1.find(g => g.id === game.id);
    
    if (notStartedResult || game1State?.status === 'completed') {
      console.log("   ❌ Test failed: Game without started_at should not be expired");
      return false;
    }
    console.log("   ✅ Game correctly skipped expiration check (not started)");
    
    // Test 2: Start the game
    console.log("\n🧪 Test 2: Starting game...");
    await db.updateGameStatusInDB(supabase, game.id, "active");
    const game2 = await db.fetchGamesFromDB(supabase);
    const game2State = game2.find(g => g.id === game.id);
    
    if (!game2State?.started_at) {
      console.log("   ❌ Test failed: Game should have started_at set when activated");
      return false;
    }
    console.log(`   ✅ Game started at: ${new Date(game2State.started_at).toISOString()}`);
    console.log(`   ✅ Game duration: ${game2State.duration_minutes} minutes`);
    
    // Test 3: Game should not expire immediately after starting
    console.log("\n🧪 Test 3: Game should not expire immediately after starting");
    const justStartedResult = await db.checkAndCompleteGameIfExpired(supabase, game.id);
    const game3 = await db.fetchGamesFromDB(supabase);
    const game3State = game3.find(g => g.id === game.id);
    
    if (justStartedResult || game3State?.status === 'completed') {
      console.log("   ❌ Test failed: Game should not expire immediately");
      return false;
    }
    console.log("   ✅ Game correctly not expired (within duration)");
    
    // Test 4: Manually set started_at to 2 minutes ago (expired)
    console.log("\n🧪 Test 4: Testing with expired started_at...");
    const expiredStartedAt = new Date();
    expiredStartedAt.setMinutes(expiredStartedAt.getMinutes() - 2); // 2 minutes ago (past 1 minute duration)
    
    await supabase
      .from("games")
      .update({ started_at: expiredStartedAt.toISOString() })
      .eq("id", game.id);
    
    const expiredResult = await db.checkAndCompleteGameIfExpired(supabase, game.id);
    const game4 = await db.fetchGamesFromDB(supabase);
    const game4State = game4.find(g => g.id === game.id);
    
    if (!expiredResult || game4State?.status !== 'completed') {
      console.log("   ❌ Test failed: Expired game should be marked as completed");
      console.log(`      expiredResult: ${expiredResult}`);
      console.log(`      status: ${game4State?.status}`);
      return false;
    }
    console.log("   ✅ Expired game correctly marked as completed");
    console.log(`   ✅ Game ended_at: ${game4State?.ended_at ? new Date(game4State.ended_at).toISOString() : 'null'}`);
    
    // Test 5: Expired games should return false on subsequent checks (already completed)
    console.log("\n🧪 Test 5: Expired game should return false on subsequent checks");
    const alreadyCompletedResult = await db.checkAndCompleteGameIfExpired(supabase, game.id);
    
    if (alreadyCompletedResult) {
      console.log("   ❌ Test failed: Already completed game should return false");
      return false;
    }
    console.log("   ✅ Already completed game correctly returns false");
    
    // Test 6: Create another game that expires and test it skips tick processing
    console.log("\n🧪 Test 6: Creating expired game to test skip in tick processing");
    const expiredGame = await db.insertGameInDB(supabase, playerId, null, initialBalance, 1); // 1 minute
    await db.insertGamePlayerInDB(supabase, expiredGame.id, playerId, initialBalance);
    await db.updateGameStatusInDB(supabase, expiredGame.id, "active");
    
    // Set started_at to past expiration
    const expiredStartedAt2 = new Date();
    expiredStartedAt2.setMinutes(expiredStartedAt2.getMinutes() - 2);
    await supabase
      .from("games")
      .update({ started_at: expiredStartedAt2.toISOString() })
      .eq("id", expiredGame.id);
    
    // Simulate what the bound worker does - check expiration before processing
    const shouldSkipProcessing = await db.checkAndCompleteGameIfExpired(supabase, expiredGame.id);
    const expiredGameState = await db.fetchGamesFromDB(supabase);
    const expiredGameFinal = expiredGameState.find(g => g.id === expiredGame.id);
    
    if (!shouldSkipProcessing || expiredGameFinal?.status !== 'completed') {
      console.log("   ❌ Test failed: Expired game should be completed before tick processing");
      return false;
    }
    console.log("   ✅ Expired game correctly skipped tick processing");
    
    // Cleanup
    await supabase.from("games").delete().in("id", [game.id, expiredGame.id]);
    
    console.log("\n✅ Game expiration scenario passed!");
    return true;
  } catch (error) {
    console.error("❌ Game expiration scenario failed:", error);
    return false;
  }
}

/**
 * Scenario 9: Position merging
 * Tests that buying into an existing position merges positions with weighted average entry price
 */
async function scenario_positionMerging(): Promise<boolean> {
  const supabase = getSupabase();
  const playerId = TEST_USERS[0].id;
  const symbol = "BTC";
  const initialBalance = 20000.0;

  try {
    console.log("📋 Setting up position merging scenario...");
    
    const game = await db.insertGameInDB(supabase, playerId, null, initialBalance, 60);
    await db.updateGameStatusInDB(supabase, game.id, "active");
    await db.insertGamePlayerInDB(supabase, game.id, playerId, initialBalance);

    // First buy: 0.1 BTC @ $50,000 (cost $5,000)
    const firstQty = 0.1;
    const firstPrice = 50000;
    const firstOrder = await db.insertOrderInDB(
      supabase,
      game.id,
      playerId,
      symbol,
      "MARKET",
      "BUY",
      firstQty
    );

    const gameState = await db.fetchGameStateFromDB(supabase);
    const tick1 = (gameState?.current_tick || 0) + 1;
    await db.insertPrice(supabase, symbol, firstPrice, tick1);
    await db.updateGameStateInDB(supabase, tick1);
    await processGameTick(game.id, tick1, supabase);

    console.log(`✅ First buy: ${firstQty} BTC @ $${firstPrice}`);

    // Second buy: 0.1 BTC @ $60,000 (cost $6,000)
    const secondQty = 0.1;
    const secondPrice = 60000;
    const secondOrder = await db.insertOrderInDB(
      supabase,
      game.id,
      playerId,
      symbol,
      "MARKET",
      "BUY",
      secondQty
    );

    const tick2 = tick1 + 1;
    await db.insertPrice(supabase, symbol, secondPrice, tick2);
    await db.updateGameStateInDB(supabase, tick2);
    await processGameTick(game.id, tick2, supabase);

    console.log(`✅ Second buy: ${secondQty} BTC @ $${secondPrice}`);

    // Validate
    const positions = await db.fetchPositionsFromDB(supabase, game.id, "open");
    const players = await db.fetchGamePlayersFromDB(supabase, game.id);

    if (positions.length !== 1) {
      console.error(`❌ Expected 1 position, got ${positions.length}`);
      return false;
    }

    const pos = positions[0];
    const expectedQty = firstQty + secondQty; // 0.2
    const expectedEntry = (firstQty * firstPrice + secondQty * secondPrice) / expectedQty; // $55,000

    console.log(`📊 Position: ${Number(pos.quantity)} BTC @ $${Number(pos.entry_price).toFixed(2)}`);
    console.log(`   Expected: ${expectedQty} BTC @ $${expectedEntry.toFixed(2)}`);

    if (Math.abs(Number(pos.quantity) - expectedQty) > 0.001 ||
        Math.abs(Number(pos.entry_price) - expectedEntry) > 0.01) {
      console.error("❌ Position merging failed");
      return false;
    }

    // Verify balance: $20,000 - $5,000 - $6,000 = $9,000
    const expectedBalance = initialBalance - (firstQty * firstPrice) - (secondQty * secondPrice);
    const actualBalance = Number(players[0].balance);
    console.log(`💰 Balance: $${actualBalance.toFixed(2)} (expected: $${expectedBalance.toFixed(2)})`);

    if (Math.abs(actualBalance - expectedBalance) > 0.01) {
      console.error("❌ Balance incorrect after position merging");
      return false;
    }

    // Cleanup
    await supabase.from("games").delete().eq("id", game.id);

    console.log("\n✅ Position merging scenario passed!");
    return true;
  } catch (error) {
    console.error("❌ Position merging scenario failed:", error);
    return false;
  }
}

/**
 * Scenario 10: Insufficient balance rejection
 * Tests that buy orders are rejected when player has insufficient funds
 */
async function scenario_insufficientBalance(): Promise<boolean> {
  const supabase = getSupabase();
  const playerId = TEST_USERS[0].id;
  const symbol = "BTC";
  const balance = 4000.0; // Less than order cost

  try {
    console.log("📋 Setting up insufficient balance scenario...");
    
    const game = await db.insertGameInDB(supabase, playerId, null, balance, 60);
    await db.updateGameStatusInDB(supabase, game.id, "active");
    await db.insertGamePlayerInDB(supabase, game.id, playerId, balance);

    // Try to buy 0.1 BTC @ $50,000 (cost $5,000, but only have $4,000)
    const order = await db.insertOrderInDB(
      supabase,
      game.id,
      playerId,
      symbol,
      "MARKET",
      "BUY",
      0.1
    );

    const gameState = await db.fetchGameStateFromDB(supabase);
    const tick = (gameState?.current_tick || 0) + 1;
    await db.insertPrice(supabase, symbol, 50000, tick);
    await db.updateGameStateInDB(supabase, tick);
    await processGameTick(game.id, tick, supabase);

    // Validate order was rejected
    const orders = await db.fetchOrdersFromDB(supabase, game.id);
    const orderResult = orders.find(o => o.id === order.id);

    if (!orderResult) {
      console.error("❌ Order not found");
      return false;
    }

    if (orderResult.status !== "rejected") {
      console.error(`❌ Order should be rejected, but status is: ${orderResult.status}`);
      return false;
    }

    // Verify no position was created
    const positions = await db.fetchPositionsFromDB(supabase, game.id, "open");
    if (positions.length > 0) {
      console.error(`❌ No position should be created, but found ${positions.length}`);
      return false;
    }

    // Verify balance unchanged
    const players = await db.fetchGamePlayersFromDB(supabase, game.id);
    if (Math.abs(Number(players[0].balance) - balance) > 0.01) {
      console.error(`❌ Balance should be unchanged at $${balance}, but is $${Number(players[0].balance)}`);
      return false;
    }

    console.log("✅ Order correctly rejected due to insufficient balance");
    console.log("✅ No position created");
    console.log("✅ Balance unchanged");

    // Cleanup
    await supabase.from("games").delete().eq("id", game.id);

    console.log("\n✅ Insufficient balance scenario passed!");
    return true;
  } catch (error) {
    console.error("❌ Insufficient balance scenario failed:", error);
    return false;
  }
}

/**
 * Scenario 11: Partial sell
 * Tests that selling part of a position reduces the position size instead of closing it
 */
async function scenario_partialSell(): Promise<boolean> {
  const supabase = getSupabase();
  const playerId = TEST_USERS[0].id;
  const symbol = "BTC";
  const initialBalance = 10000.0;

  try {
    console.log("📋 Setting up partial sell scenario...");
    
    const game = await db.insertGameInDB(supabase, playerId, null, initialBalance, 60);
    await db.updateGameStatusInDB(supabase, game.id, "active");
    await db.insertGamePlayerInDB(supabase, game.id, playerId, initialBalance);

    // Buy 0.2 BTC @ $50,000 (cost $10,000)
    const buyQty = 0.2;
    const buyPrice = 50000;
    const buyOrder = await db.insertOrderInDB(
      supabase,
      game.id,
      playerId,
      symbol,
      "MARKET",
      "BUY",
      buyQty
    );

    const gameState = await db.fetchGameStateFromDB(supabase);
    const tick1 = (gameState?.current_tick || 0) + 1;
    await db.insertPrice(supabase, symbol, buyPrice, tick1);
    await db.updateGameStateInDB(supabase, tick1);
    await processGameTick(game.id, tick1, supabase);

    console.log(`✅ Bought ${buyQty} BTC @ $${buyPrice}`);

    // Sell 0.1 BTC @ $55,000 (partial close)
    const sellQty = 0.1;
    const sellPrice = 55000;
    const sellOrder = await db.insertOrderInDB(
      supabase,
      game.id,
      playerId,
      symbol,
      "MARKET",
      "SELL",
      sellQty
    );

    const tick2 = tick1 + 1;
    await db.insertPrice(supabase, symbol, sellPrice, tick2);
    await db.updateGameStateInDB(supabase, tick2);
    await processGameTick(game.id, tick2, supabase);

    console.log(`✅ Sold ${sellQty} BTC @ $${sellPrice}`);

    // Validate
    const positions = await db.fetchPositionsFromDB(supabase, game.id, "open");
    const players = await db.fetchGamePlayersFromDB(supabase, game.id);

    // Should have 1 open position with 0.1 BTC remaining
    if (positions.length !== 1) {
      console.error(`❌ Expected 1 open position, got ${positions.length}`);
      return false;
    }

    const pos = positions[0];
    const expectedQty = buyQty - sellQty; // 0.1
    if (Math.abs(Number(pos.quantity) - expectedQty) > 0.001) {
      console.error(`❌ Position quantity should be ${expectedQty}, got ${Number(pos.quantity)}`);
      return false;
    }

    if (pos.status !== "open") {
      console.error(`❌ Position should be open, but status is: ${pos.status}`);
      return false;
    }

    // Verify balance: $0 (all used) + $5,500 (proceeds) = $5,500
    const proceeds = sellPrice * sellQty; // $5,500
    const expectedBalance = initialBalance - (buyQty * buyPrice) + proceeds; // $5,500
    const actualBalance = Number(players[0].balance);

    console.log(`💰 Balance: $${actualBalance.toFixed(2)} (expected: $${expectedBalance.toFixed(2)})`);
    console.log(`📊 Position: ${Number(pos.quantity)} BTC (should be ${expectedQty})`);

    if (Math.abs(actualBalance - expectedBalance) > 0.01) {
      console.error("❌ Balance incorrect after partial sell");
      return false;
    }

    // Cleanup
    await supabase.from("games").delete().eq("id", game.id);

    console.log("\n✅ Partial sell scenario passed!");
    return true;
  } catch (error) {
    console.error("❌ Partial sell scenario failed:", error);
    return false;
  }
}

/**
 * Scenario 12: Partial take profit
 * Tests that a TP order can partially close a position
 */
async function scenario_partialTakeProfit(): Promise<boolean> {
  const supabase = getSupabase();
  const playerId = TEST_USERS[0].id;
  const symbol = "BTC";
  const initialBalance = 10000.0;

  try {
    console.log("📋 Setting up partial take profit scenario...");
    
    const game = await db.insertGameInDB(supabase, playerId, null, initialBalance, 60);
    await db.updateGameStatusInDB(supabase, game.id, "active");
    await db.insertGamePlayerInDB(supabase, game.id, playerId, initialBalance);

    // Buy 0.2 BTC @ $50,000
    const buyQty = 0.2;
    const buyPrice = 50000;
    const buyOrder = await db.insertOrderInDB(
      supabase,
      game.id,
      playerId,
      symbol,
      "MARKET",
      "BUY",
      buyQty
    );

    const gameState = await db.fetchGameStateFromDB(supabase);
    const tick1 = (gameState?.current_tick || 0) + 1;
    await db.insertPrice(supabase, symbol, buyPrice, tick1);
    await db.updateGameStateInDB(supabase, tick1);
    await processGameTick(game.id, tick1, supabase);

    // Get position ID
    const positionsAfterBuy = await db.fetchPositionsFromDB(supabase, game.id, "open");
    const positionId = positionsAfterBuy[0].id;

    console.log(`✅ Bought ${buyQty} BTC @ $${buyPrice}`);

    // Create TP order: 0.1 BTC @ $55,000
    const tpQty = 0.1;
    const triggerPrice = 55000;
    const tpOrder = await db.insertOrderInDB(
      supabase,
      game.id,
      playerId,
      symbol,
      "TAKE_PROFIT",
      "SELL",
      tpQty,
      null,
      triggerPrice,
      positionId
    );

    // Price reaches $56,000 (above trigger)
    const currentPrice = 56000;
    const tick2 = tick1 + 1;
    await db.insertPrice(supabase, symbol, currentPrice, tick2);
    await db.updateGameStateInDB(supabase, tick2);
    await processGameTick(game.id, tick2, supabase);

    console.log(`✅ Price reached $${currentPrice}, TP should trigger`);

    // Validate
    const positions = await db.fetchPositionsFromDB(supabase, game.id, "open");
    const orders = await db.fetchOrdersFromDB(supabase, game.id);
    const players = await db.fetchGamePlayersFromDB(supabase, game.id);

    // TP order should be filled
    const tpOrderResult = orders.find(o => o.id === tpOrder.id);
    if (!tpOrderResult || tpOrderResult.status !== "filled") {
      console.error(`❌ TP order should be filled, but status is: ${tpOrderResult?.status}`);
      return false;
    }

    // Position should still be open with 0.1 BTC remaining
    if (positions.length !== 1) {
      console.error(`❌ Expected 1 open position, got ${positions.length}`);
      return false;
    }

    const pos = positions[0];
    const expectedQty = buyQty - tpQty; // 0.1
    if (Math.abs(Number(pos.quantity) - expectedQty) > 0.001) {
      console.error(`❌ Position quantity should be ${expectedQty}, got ${Number(pos.quantity)}`);
      return false;
    }

    if (pos.status !== "open") {
      console.error(`❌ Position should be open, but status is: ${pos.status}`);
      return false;
    }

    // Verify balance credited with proceeds
    const proceeds = currentPrice * tpQty; // $5,600
    const cost = buyQty * buyPrice; // $10,000
    const expectedBalance = initialBalance - cost + proceeds; // $5,600
    const actualBalance = Number(players[0].balance);

    console.log(`💰 Balance: $${actualBalance.toFixed(2)} (expected: $${expectedBalance.toFixed(2)})`);
    console.log(`📊 Position: ${Number(pos.quantity)} BTC (should be ${expectedQty})`);

    if (Math.abs(actualBalance - expectedBalance) > 0.01) {
      console.error("❌ Balance incorrect after partial TP");
      return false;
    }

    // Cleanup
    await supabase.from("games").delete().eq("id", game.id);

    console.log("\n✅ Partial take profit scenario passed!");
    return true;
  } catch (error) {
    console.error("❌ Partial take profit scenario failed:", error);
    return false;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
