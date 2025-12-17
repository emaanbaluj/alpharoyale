
import "dotenv/config";

// Finnhub API token from environment variable
const token = process.env.FINNHUB_API_KEY!;


// Fetch stock quote for a given symbol from Finnhub
async function getQuoteFromFinnhub(symbol: string) {
  const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${"d4u66rhr01qu53ud20a0d4u66rhr01qu53ud20ag"}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Poll stock price at regular intervals and call callback with data
async function pollQuotefromFinnhub(symbol: string, intervalMs: number, callback: (data: any) => void) {
  setInterval(async () => {
    try {
      const q = await getQuoteFromFinnhub(symbol);
      callback(q);
    } catch (e) {
      console.error(`Error fetching data for ${symbol}:`, e);
    }
  }, intervalMs);
}

// Example usage
const symbol = "AAPL"; 
const interval = 5000; 

pollQuotefromFinnhub(symbol, interval, (data) => {
  console.log(new Date(data.t * 1000).toISOString(), "price:", data.c);
});
