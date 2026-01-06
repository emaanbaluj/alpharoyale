/**
 * Interactive CLI Tool for Game Management
 * 
 * Usage:
 *   npm run cli
 * 
 * Commands:
 *   - Main menu: Select a game or run global commands
 *   - Game context: Commands scoped to the selected game
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as db from "./db";
import { createInterface } from "readline";
import prompts from "prompts";

// Initialize Supabase client
function getSupabase(): SupabaseClient {
  // Use the same database as the worker (from .dev.vars)
  // Worker uses: https://zoejnlntnbcchsixkkps.supabase.co (from .dev.vars)
  // CLI default: http://localhost:54321 (local)
  // To use remote: export SUPABASE_URL=https://zoejnlntnbcchsixkkps.supabase.co
  // To use local: export SUPABASE_URL=http://localhost:54321
  const url = process.env.SUPABASE_URL || "http://localhost:54321";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";


  return createClient(url, key);
}

// Create readline interface
function createReadlineInterface() {
  return createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "game> ",
  });
}

/**
 * Parse command line arguments (space-separated)
 */
function parseArgs(input: string): string[] {
  const parts = input.trim().split(/\s+/);
  return parts.filter(p => p.length > 0);
}

/**
 * Show game status (helper function)
 */
async function showGameStatus(supabase: SupabaseClient, gameId: string): Promise<void> {
  try {
    const games = await db.fetchGamesFromDB(supabase);
    const game = games.find((g) => g.id === gameId);

    if (!game) {
      console.log(`❌ Game not found: ${gameId}`);
      return;
    }

    const players = await db.fetchGamePlayersFromDB(supabase, gameId);
    const positions = await db.fetchPositionsFromDB(supabase, gameId);
    const orders = await db.fetchOrdersFromDB(supabase, gameId);
    const gameState = await db.fetchGameStateFromDB(supabase);

    console.log(`\n📊 Game Status: ${gameId}\n`);
    console.log(`Status: ${game.status}`);
    console.log(`Current Tick: ${gameState?.current_tick || 0}`);
    console.log(`Created: ${new Date(game.created_at).toLocaleString()}`);
    console.log("");

    console.log(`👥 Players (${players.length}):`);
    for (const player of players) {
      console.log(`  ${player.user_id}:`);
      console.log(`    Balance: $${Number(player.balance).toFixed(2)}`);
      console.log(`    Equity: $${Number(player.equity).toFixed(2)}`);
    }
    console.log("");

    const openPositions = positions.filter((p) => p.status === "open");
    const closedPositions = positions.filter((p) => p.status === "closed");
    console.log(`💼 Positions: ${openPositions.length} open, ${closedPositions.length} closed`);
    if (openPositions.length > 0) {
      for (const pos of openPositions) {
        const pnl = pos.unrealized_pnl ? Number(pos.unrealized_pnl) : 0;
        console.log(`  ${pos.symbol} ${pos.side} ${pos.quantity} @ $${Number(pos.entry_price).toFixed(2)} (P&L: ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)})`);
      }
    }
    console.log("");

    const pendingOrders = orders.filter((o) => o.status === "pending");
    const filledOrders = orders.filter((o) => o.status === "filled");
    console.log(`📋 Orders: ${pendingOrders.length} pending, ${filledOrders.length} filled, ${orders.length - pendingOrders.length - filledOrders.length} other`);
    if (pendingOrders.length > 0) {
      for (const order of pendingOrders) {
        console.log(`  ${order.order_type} ${order.side} ${order.quantity} ${order.symbol}${order.price ? ` @ $${Number(order.price).toFixed(2)}` : ""}`);
      }
    }
  } catch (error) {
    console.log("❌ Error showing status:", error instanceof Error ? error.message : error);
  }
}

/**
 * List orders for a game
 */
async function listOrders(supabase: SupabaseClient, gameId: string, status?: string): Promise<void> {
  try {
    const orders = await db.fetchOrdersFromDB(supabase, gameId, status as any);

    if (orders.length === 0) {
      console.log(`No orders found${status ? ` with status: ${status}` : ""}`);
      return;
    }

    console.log(`\n📋 Orders (${orders.length}):\n`);
    for (const order of orders) {
      console.log(`  ${order.id}`);
      console.log(`    Status: ${order.status}`);
      console.log(`    Type: ${order.order_type}`);
      console.log(`    Side: ${order.side}`);
      console.log(`    Symbol: ${order.symbol}`);
      console.log(`    Quantity: ${order.quantity}`);
      if (order.price) console.log(`    Price: $${Number(order.price).toFixed(2)}`);
      if (order.trigger_price) console.log(`    Trigger Price: $${Number(order.trigger_price).toFixed(2)}`);
      if (order.filled_price) console.log(`    Filled Price: $${Number(order.filled_price).toFixed(2)}`);
      console.log(`    Player: ${order.player_id}`);
      console.log(`    Created: ${new Date(order.created_at).toLocaleString()}`);
      console.log("");
    }
  } catch (error) {
    console.log("❌ Error listing orders:", error instanceof Error ? error.message : error);
  }
}

/**
 * List positions for a game
 */
async function listPositions(supabase: SupabaseClient, gameId: string, status = "open"): Promise<void> {
  try {
    const positions = await db.fetchPositionsFromDB(supabase, gameId, status as any);

    if (positions.length === 0) {
      console.log(`No ${status} positions found`);
      return;
    }

    console.log(`\n💼 Positions (${positions.length}, ${status}):\n`);
    for (const pos of positions) {
      console.log(`  ${pos.id}`);
      console.log(`    Status: ${pos.status}`);
      console.log(`    Symbol: ${pos.symbol}`);
      console.log(`    Side: ${pos.side}`);
      console.log(`    Quantity: ${pos.quantity}`);
      console.log(`    Entry Price: $${Number(pos.entry_price).toFixed(2)}`);
      if (pos.current_price) console.log(`    Current Price: $${Number(pos.current_price).toFixed(2)}`);
      if (pos.unrealized_pnl !== null) {
        const pnl = Number(pos.unrealized_pnl);
        console.log(`    Unrealized P&L: ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`);
      }
      if (pos.realized_pnl !== null) {
        const pnl = Number(pos.realized_pnl);
        console.log(`    Realized P&L: ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`);
      }
      console.log(`    Player: ${pos.player_id}`);
      console.log(`    Opened: ${new Date(pos.created_at).toLocaleString()}`);
      if (pos.closed_at) console.log(`    Closed: ${new Date(pos.closed_at).toLocaleString()}`);
      console.log("");
    }
  } catch (error) {
    console.log("❌ Error listing positions:", error instanceof Error ? error.message : error);
  }
}

/**
 * Create an order (interactive prompt)
 */
async function createOrderInteractive(
  supabase: SupabaseClient,
  gameId: string,
  rl: any,
  onComplete: () => void
): Promise<void> {
  try {
    const players = await db.fetchGamePlayersFromDB(supabase, gameId);
    if (players.length === 0) {
      console.log("❌ No players found in this game");
      onComplete();
      return;
    }

    const response = await prompts([
      {
        type: "select",
        name: "playerId",
        message: "Select player",
        choices: players.map(p => ({ title: p.user_id, value: p.user_id })),
      },
      {
        type: "text",
        name: "symbol",
        message: "Symbol (e.g., BTC, ETH)",
        validate: (value) => value.length > 0 || "Symbol is required",
      },
      {
        type: "select",
        name: "orderType",
        message: "Order type",
        choices: [
          { title: "MARKET", value: "MARKET" },
          { title: "LIMIT", value: "LIMIT" },
          { title: "TAKE_PROFIT", value: "TAKE_PROFIT" },
          { title: "STOP_LOSS", value: "STOP_LOSS" },
        ],
      },
      {
        type: "select",
        name: "side",
        message: "Side",
        choices: [
          { title: "BUY", value: "BUY" },
          { title: "SELL", value: "SELL" },
        ],
      },
      {
        type: "number",
        name: "quantity",
        message: "Quantity",
        validate: (value) => value > 0 || "Quantity must be greater than 0",
      },
      {
        type: (prev) => (prev === "LIMIT" || prev === "TAKE_PROFIT" || prev === "STOP_LOSS") ? "number" : null,
        name: "price",
        message: "Price (for LIMIT orders)",
        validate: (value, prev) => {
          if (prev === "LIMIT" && (!value || value <= 0)) {
            return "Price is required for LIMIT orders";
          }
          return true;
        },
      },
      {
        type: (prev, values) => (values.orderType === "TAKE_PROFIT" || values.orderType === "STOP_LOSS") ? "number" : null,
        name: "triggerPrice",
        message: "Trigger price (for TP/SL orders)",
        validate: (value, prev, values) => {
          if ((values.orderType === "TAKE_PROFIT" || values.orderType === "STOP_LOSS") && (!value || value <= 0)) {
            return "Trigger price is required for TP/SL orders";
          }
          return true;
        },
      },
    ]);

    if (!response.playerId || !response.symbol || !response.orderType || !response.side || !response.quantity) {
      console.log("❌ Order creation cancelled");
      onComplete();
      return;
    }

    const order = await db.insertOrderInDB(
      supabase,
      gameId,
      response.playerId,
      response.symbol.toUpperCase(),
      response.orderType,
      response.side,
      response.quantity,
      response.price,
      response.triggerPrice
    );

    console.log(`\n✅ Order created: ${order.id}`);
    console.log(`   Type: ${response.orderType} ${response.side}`);
    console.log(`   Symbol: ${response.symbol.toUpperCase()}`);
    console.log(`   Quantity: ${response.quantity}`);
    if (response.price) console.log(`   Price: $${response.price}`);
    if (response.triggerPrice) console.log(`   Trigger Price: $${response.triggerPrice}`);

    onComplete();
  } catch (error) {
    console.log("❌ Error creating order:", error instanceof Error ? error.message : error);
    onComplete();
  }
}

/**
 * Create or get user by email
 */
async function getOrCreateUser(supabase: SupabaseClient, email: string): Promise<string> {
  const url = process.env.SUPABASE_URL || "http://localhost:54321";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

  // Check if user exists
  const getResponse = await fetch(`${url}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
    },
  });

  if (getResponse.ok) {
    const data = await getResponse.json();
    if (data.users && data.users.length > 0) {
      const user = data.users.find((u: any) => u.email === email);
      if (user) {
        return user.id;
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
      password: 'temp-password-' + Math.random().toString(36).slice(2),
      email_confirm: true,
      user_metadata: {},
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create user: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.id;
}

/**
 * Create a new game (interactive)
 */
async function createGameInteractive(supabase: SupabaseClient): Promise<void> {
  try {
    const response = await prompts([
      {
        type: "text",
        name: "player1Email",
        message: "Player 1 email",
        validate: (value) => value.includes('@') || "Please enter a valid email",
      },
      {
        type: "confirm",
        name: "hasPlayer2",
        message: "Add a second player?",
        initial: false,
      },
      {
        type: (prev) => prev ? "text" : null,
        name: "player2Email",
        message: "Player 2 email",
        validate: (value, prev) => {
          if (prev && (!value || !value.includes('@'))) {
            return "Please enter a valid email";
          }
          return true;
        },
      },
      {
        type: "number",
        name: "initialBalance",
        message: "Initial balance",
        initial: 10000,
        validate: (value) => value > 0 || "Initial balance must be greater than 0",
      },
    ]);

    if (!response.player1Email) {
      console.log("❌ Game creation cancelled");
      return;
    }

    console.log("\n👤 Creating/finding users...");
    const player1Id = await getOrCreateUser(supabase, response.player1Email);
    console.log(`   ✅ Player 1: ${response.player1Email} (${player1Id})`);

    let player2Id: string | null = null;
    if (response.hasPlayer2 && response.player2Email) {
      player2Id = await getOrCreateUser(supabase, response.player2Email);
      console.log(`   ✅ Player 2: ${response.player2Email} (${player2Id})`);
    }

    console.log("\n🎮 Creating game...");
    const game = await db.insertGameInDB(supabase, player1Id, player2Id, response.initialBalance);
    await db.updateGameStatusInDB(supabase, game.id, "active");

    console.log(`   ✅ Game created: ${game.id}`);
    console.log(`   Status: active`);
    console.log(`   Initial balance: $${response.initialBalance}`);

    // Add players to the game
    console.log("\n👥 Adding players to game...");
    await db.insertGamePlayerInDB(supabase, game.id, player1Id, response.initialBalance);
    console.log(`   ✅ Added player 1`);
    if (player2Id) {
      await db.insertGamePlayerInDB(supabase, game.id, player2Id, response.initialBalance);
      console.log(`   ✅ Added player 2`);
    }

    console.log(`\n✅ Game ${game.id} created and activated!`);
  } catch (error) {
    console.log("❌ Error creating game:", error instanceof Error ? error.message : error);
  }
}

/**
 * Reset all games (delete all games and related data)
 */
async function resetAllGames(supabase: SupabaseClient): Promise<void> {
  try {
    const response = await prompts({
      type: "confirm",
      name: "value",
      message: "⚠️  This will DELETE ALL GAMES and all related data. Are you sure?",
      initial: false,
    });

    if (!response.value) {
      console.log("❌ Reset cancelled");
      return;
    }

    console.log("\n🗑️  Deleting all games and related data...");
    const games = await db.fetchGamesFromDB(supabase);

    if (games.length === 0) {
      console.log("✅ No games to delete");
      return;
    }

    const gameIds = games.map(g => g.id);

    // Delete in correct order to avoid foreign key constraint violations
    // order_executions references both orders and games, and doesn't have CASCADE
    // So we need to delete it first, then games (which will CASCADE delete orders, positions, equity_history, game_players)
    console.log("   Deleting order executions...");
    const { error: execError } = await supabase.from("order_executions").delete().in("game_id", gameIds);
    if (execError) {
      console.log(`   ⚠️  Error deleting order_executions: ${execError.message}`);
    } else {
      console.log(`   ✅ Deleted order_executions`);
    }

    console.log("   Deleting games (will cascade delete orders, positions, equity_history, game_players)...");
    // Now delete the games - this will CASCADE delete orders, positions, equity_history, and game_players
    const { error: gamesError } = await supabase.from("games").delete().in("id", gameIds);
    if (gamesError) {
      console.log(`   ❌ Error deleting games: ${gamesError.message}`);
      throw gamesError;
    }

    console.log(`\n✅ Deleted ${games.length} game(s) and all related data`);
  } catch (error) {
    console.log("❌ Error resetting games:", error instanceof Error ? error.message : error);
  }
}

/**
 * Game context mode - interactive commands for a specific game
 */
async function gameContextMode(supabase: SupabaseClient, gameId: string): Promise<void> {
  // Show initial status first
  await showGameStatus(supabase, gameId);
  console.log("\n🎮 Game Context Mode");
  console.log(`Game ID: ${gameId}`);
  console.log("Type 'help' for commands, 'back' to return to main menu\n");

  return new Promise((resolve) => {
    const rl = createReadlineInterface();
    rl.setPrompt(`game:${gameId}> `);
    rl.prompt();

    let isProcessingPrompt = false; // Flag to ignore input during prompts

    rl.on("line", async (input) => {
      // Ignore input if we're processing a prompt
      if (isProcessingPrompt) {
        return;
      }

      const trimmed = input.trim();
      if (!trimmed) {
        rl.prompt();
        return;
      }

      const parts = parseArgs(trimmed);
      const command = parts[0]?.toLowerCase();

      try {
        switch (command) {
          case "status":
            await showGameStatus(supabase, gameId);
            break;
          case "orders":
            await listOrders(supabase, gameId, parts[1]);
            break;
          case "positions":
            await listPositions(supabase, gameId, parts[1] || "open");
            break;
          case "order":
            isProcessingPrompt = true;
            rl.pause();
            await createOrderInteractive(supabase, gameId, rl, () => {
              isProcessingPrompt = false;
              rl.resume();
              rl.prompt();
            });
            break;
          case "tick":
            await processTick(supabase);
            break;
          case "help":
          case "?":
            console.log(`
📖 Game Context Commands:

  status                  Show game status summary
  orders [status]         List orders (status: pending, filled, rejected, cancelled)
  positions [status]      List positions (status: open, closed)
  order                   Create a new order (interactive)
  tick                    Process a game tick (all active games)
  help                    Show this help
  back                    Return to main menu
          `);
            break;
          case "back":
          case "exit":
            console.log("👋 Returning to main menu...\n");
            rl.close();
            resolve();
            return;
          default:
            console.log(`Unknown command: ${command}. Type 'help' for commands.`);
        }
      } catch (error) {
        console.log("❌ Error:", error instanceof Error ? error.message : error);
      }

      // Always prompt again after command completes
      if (!rl.closed) {
        rl.prompt();
      }
    });

    rl.on("close", () => {
      resolve();
    });
  });
}

/**
 * Process a game tick by triggering the worker's scheduled handler
 */
async function processTick(supabase: SupabaseClient): Promise<void> {
  try {
    const workerUrl = process.env.WORKER_URL || "http://localhost:8787";
    const scheduledEndpoint = `${workerUrl}/cdn-cgi/handler/scheduled`;

    console.log(`\n⚙️  Triggering game tick via worker...`);
    console.log(`   Worker URL: ${workerUrl}\n`);

    // Check if worker is running by hitting the health endpoint
    try {
      const healthResponse = await fetch(`${workerUrl}/health`);
      if (!healthResponse.ok) {
        console.log(`❌ Worker health check failed (status: ${healthResponse.status})`);
        console.log(`   Make sure the worker is running: npm run dev`);
        return;
      }
    } catch (error) {
      console.log(`❌ Cannot connect to worker at ${workerUrl}`);
      console.log(`   Make sure the worker is running: npm run dev`);
      console.log(`   Error: ${error instanceof Error ? error.message : error}`);
      return;
    }

    // Get the current game state before triggering
    const gameStateBefore = await db.fetchGameStateFromDB(supabase);
    const tickBefore = gameStateBefore?.current_tick ?? 0;
    console.log(`📊 Current game state: tick ${tickBefore}`);

    // Trigger the scheduled handler
    const response = await fetch(scheduledEndpoint, {
      method: "GET",
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`❌ Failed to trigger scheduled handler (status: ${response.status})`);
      console.log(`   Response: ${errorText}`);
      return;
    }

    const responseText = await response.text();
    console.log(`✅ Scheduled handler endpoint returned (status: ${response.status})`);
    
    // Give it time to process (scheduled handler is async)
    console.log(`\n⏳ Waiting for tick to process...`);
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check if the game state actually incremented
    const gameStateAfter = await db.fetchGameStateFromDB(supabase);
    const tickAfter = gameStateAfter?.current_tick ?? 0;

    if (tickAfter > tickBefore) {
      console.log(`\n📊 Game state incremented: tick ${tickBefore} -> ${tickAfter}`);
      console.log(`✅ Game tick processed successfully!`);
    } else {
      console.log(`\n⚠️  Game state did not increment (still at tick ${tickAfter})`);
      console.log(`   The scheduled handler may not have executed, or it failed silently.`);
      console.log(`   Check the worker logs for errors (especially FINNHUB_API_KEY).`);
      console.log(`   Worker logs should show "Fetching price data for symbols: BTC, ETH"`);
    }
  } catch (error) {
    console.log("❌ Error processing tick:", error instanceof Error ? error.message : error);
  }
}

/**
 * Main menu - select a game or run global commands
 */
async function mainMenu(supabase: SupabaseClient): Promise<void> {
  while (true) {
    const games = await db.fetchGamesFromDB(supabase);
    const gameState = await db.fetchGameStateFromDB(supabase);

    const choices = [
      ...games.map((game) => ({
        title: `${game.id} (${game.status}) - ${new Date(game.created_at).toLocaleString()}`,
        value: game.id,
        description: `Enter game context for ${game.id}`,
      })),
      {
        title: "➕ Create new game",
        value: "__create__",
        description: "Create a new game with players",
      },
      {
        title: "🗑️  Reset (delete all games)",
        value: "__reset__",
        description: "Delete all games (WARNING: destructive)",
      },
      {
        title: "📈 Process tick (all active games)",
        value: "__tick__",
        description: "Process a game tick for all active games",
      },
      {
        title: "❌ Exit",
        value: "__exit__",
        description: "Exit the CLI",
      },
    ];

    const response = await prompts({
      type: "select",
      name: "value",
      message: `🎮 Game Management CLI (Current Tick: ${gameState?.current_tick || 0})`,
      choices,
      initial: 0,
    });

    if (!response.value) {
      // User cancelled (Ctrl+C)
      console.log("\n👋 Goodbye!");
      process.exit(0);
    }

    if (response.value === "__exit__") {
      console.log("👋 Goodbye!");
      process.exit(0);
    } else if (response.value === "__tick__") {
      await processTick(supabase);
      console.log("\nPress Enter to continue...");
      await new Promise((resolve) => {
        const rl = createReadlineInterface();
        rl.once("line", () => {
          rl.close();
          resolve(undefined);
        });
      });
    } else if (response.value === "__create__") {
      await createGameInteractive(supabase);
      console.log("\nPress Enter to continue...");
      await new Promise((resolve) => {
        const rl = createReadlineInterface();
        rl.once("line", () => {
          rl.close();
          resolve(undefined);
        });
      });
    } else if (response.value === "__reset__") {
      await resetAllGames(supabase);
      console.log("\nPress Enter to continue...");
      await new Promise((resolve) => {
        const rl = createReadlineInterface();
        rl.once("line", () => {
          rl.close();
          resolve(undefined);
        });
      });
    } else {
      // Enter game context
      // Small delay to ensure prompts releases stdin
      await new Promise(resolve => setTimeout(resolve, 100));
      await gameContextMode(supabase, response.value);
    }
  }
}

/**
 * Main entry point
 */
async function main() {
  const supabase = getSupabase();

  // Check connection
  try {
    await db.fetchGameStateFromDB(supabase);
  } catch (error) {
    console.error("❌ Failed to connect to database");
    console.error("💡 Make sure local Supabase is running: cd ../alpha-royale && npx supabase start");
    process.exit(1);
  }

  // Get current game state and show tracked symbols
  try {
    const gameState = await db.fetchGameStateFromDB(supabase);
    console.log(`📊 Current Tick: ${gameState?.current_tick || 0}`);
    console.log("📈 Tracked Symbols: BTC, ETH (from scheduled handler)\n");
  } catch (error) {
    // Ignore
  }

  // Start main menu
  await mainMenu(supabase);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  });
}
