import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const limitStr = searchParams.get('limit');
  
  if (!symbol) {
    return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
  }

  const limit = limitStr ? parseInt(limitStr) : 100;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: prices, error } = await supabase
    .from('price_data')
    .select('*')
    .eq('symbol', symbol)
    .order('game_state', { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Transform to chart format: { time, value }
  const chartData = prices?.reverse().map((p) => ({
    time: p.created_at,
    value: parseFloat(p.price)
  })) || [];

  return NextResponse.json({ prices: chartData });
}
