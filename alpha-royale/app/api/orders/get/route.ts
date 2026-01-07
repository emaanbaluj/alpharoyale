import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const gameId = searchParams.get('gameId');
  const playerId = searchParams.get('playerId');
  const status = searchParams.get('status') || 'pending';

  if (!gameId || !playerId) {
    return NextResponse.json({ error: 'gameId and playerId are required' }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  let query = supabase
    .from('orders')
    .select('*')
    .eq('game_id', gameId)
    .eq('player_id', playerId)
    .order('created_at', { ascending: false });

  // If status is 'all', don't filter by status, otherwise filter
  if (status !== 'all') {
    query = query.eq('status', status);
  }

  const { data: orders, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ orders: orders || [] });
}
