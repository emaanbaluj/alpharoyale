import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

const COMPATIBLETICKERS = ['ETH', 'BTC', 'AAPL'] as const;
type CompatibleTickers = (typeof COMPATIBLETICKERS)[number];

type ChartUnit = { 
    time: string; 
    value: number
};
type TickerPriceData = { 
    ticker: CompatibleTickers; 
    price: ChartUnit[] 
};
type MarketData = Partial<Record<CompatibleTickers, TickerPriceData>>;

export async function GET() {

    const supabase = createClient(supabaseUrl, supabaseKey);

    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    const { data: priceData, error } = await supabase
        .from('price_data')
        .select('*')
        .gte('timestamp', oneMonthAgo.toISOString())
        .order('timestamp', { ascending: true });
    
    if (error) {
        return NextResponse.json({ error: error.message}, { status: 500 });
    }

    const marketData: MarketData = {};

    for (const ticker of COMPATIBLETICKERS) {
        marketData[ticker] = { ticker, price: [] };
    }

    for (const row of priceData ?? []) {
        const ticker = row.symbol as CompatibleTickers;
        if (!marketData[ticker]) continue;

        marketData[ticker]!.price.push({
            time: row.timestamp, 
            value: Number(row.price), 
        });
    }

    return NextResponse.json({ marketData });
    
}