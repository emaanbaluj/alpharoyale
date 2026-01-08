// worker/src/finnhub.ts

// Fetch stock quote for a given symbol from Finnhub

export async function fetchPriceDataFromFinnhub(
  symbols: string | string[],
  token: string
): Promise<Array<{ symbol: string; price: number; timestamp: string }>> {
  const list = Array.isArray(symbols) ? symbols : [symbols];

  const results = await Promise.all(
    list.map(async (symbol) => {
      const res = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`
      );
      if (!res.ok) throw new Error(`Finnhub HTTP ${res.status} for ${symbol}`);

      const q = (await res.json()) as { c: number; t: number };

      return {
        symbol,
        price: Number(q.c),
        timestamp: new Date(q.t * 1000).toISOString(),
      };
    })
  );

  return results;
}


