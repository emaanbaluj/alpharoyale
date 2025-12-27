// worker/src/finnhub.ts

// Fetch stock quote for a given symbol from Finnhub
export async function fetchPriceDataFromFinnhub(symbol: string, token: string) {
  const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${token}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}



