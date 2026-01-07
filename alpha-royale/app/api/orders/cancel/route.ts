import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export async function POST(request: Request) {
  const { orderId, playerId } = await request.json();

  if (!orderId || !playerId) {
    return NextResponse.json({ error: 'orderId and playerId are required' }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // First, verify the order belongs to the player and is pending
  const { data: order, error: fetchError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .eq('player_id', playerId)
    .single();

  if (fetchError || !order) {
    return NextResponse.json({ error: 'Order not found or access denied' }, { status: 404 });
  }

  if (order.status !== 'pending') {
    return NextResponse.json({ error: 'Only pending orders can be cancelled' }, { status: 400 });
  }

  // Update order status to cancelled
  const { data: updatedOrder, error: updateError } = await supabase
    .from('orders')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ order: updatedOrder });
}
