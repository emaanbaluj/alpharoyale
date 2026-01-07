import { createClient } from "@supabase/supabase-js";

// Use remote Supabase
const supabaseUrl = "https://zoejnlntnbcchsixkkps.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseKey) {
  console.error("Error: SUPABASE_SERVICE_ROLE_KEY environment variable not set");
  console.error("Please set it or run: SUPABASE_SERVICE_ROLE_KEY=your_key tsx check-prices.ts");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPrices() {
  try {
    // Get symbol counts
    const { data, error } = await supabase
      .from("price_data")
      .select("symbol, timestamp, price")
      .order("timestamp", { ascending: false });

    if (error) {
      console.error("Error querying database:", error);
      process.exit(1);
    }

    if (!data || data.length === 0) {
      console.log("❌ No price data found in database!");
      return;
    }

    // Group by symbol
    const symbolCounts: Record<string, number> = {};
    const latestPrices: Record<string, { price: number; timestamp: string }> = {};

    data.forEach((row) => {
      if (!symbolCounts[row.symbol]) {
        symbolCounts[row.symbol] = 0;
      }
      symbolCounts[row.symbol]++;

      if (!latestPrices[row.symbol] || new Date(row.timestamp) > new Date(latestPrices[row.symbol].timestamp)) {
        latestPrices[row.symbol] = {
          price: parseFloat(row.price),
          timestamp: row.timestamp,
        };
      }
    });

    console.log("\n📊 Price Data Summary:\n");
    
    const sortedSymbols = Object.keys(symbolCounts).sort();
    
    sortedSymbols.forEach((symbol) => {
      const count = symbolCounts[symbol];
      const latest = latestPrices[symbol];
      const timeAgo = Math.round((Date.now() - new Date(latest.timestamp).getTime()) / 1000);
      console.log(`  ${symbol.padEnd(6)} ${count.toString().padStart(5)} entries | Latest: $${latest.price.toFixed(2)} (${timeAgo}s ago)`);
    });

    console.log(`\n✅ Total symbols: ${sortedSymbols.length}`);
    console.log(`   Symbols: ${sortedSymbols.join(", ")}\n`);

    // Check for new tickers
    const expectedTickers = ["BTC", "ETH", "AAPL", "TSLA", "MSFT", "SPY"];
    const missing = expectedTickers.filter((t) => !sortedSymbols.includes(t));
    
    if (missing.length > 0) {
      console.log(`⚠️  Missing tickers: ${missing.join(", ")}\n`);
    } else {
      console.log(`✅ All expected tickers are present!\n`);
    }
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

checkPrices();
