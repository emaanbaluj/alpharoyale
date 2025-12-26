// Fetch stock quote for a given symbol from Finnhub
export async function getQuoteFromFinnhub(symbol: string, token: string) {
  const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${token}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Poll stock price at regular intervals and call callback with data
export async function pollQuotefromFinnhub(
  symbol: string,
  intervalMs: number,
  token: string,
  callback: (data: any) => void
) {
  setInterval(async () => {
    try {
      const q = await getQuoteFromFinnhub(symbol, token);
      callback(q);
    } catch (e) {
      console.error(`Error fetching data for ${symbol}:`, e);
    }
  }, intervalMs);
}

