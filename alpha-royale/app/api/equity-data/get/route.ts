import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

type ChartUnit = { time: string; value: number };

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const gameID = searchParams.get('gameID');

    if (!gameID) {
        return NextResponse.json({ error: 'Game ID required' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: rows, error } = await supabase
        .from('equity_history')
        .select('player_id,equity,timestamp')
        .eq('game_id', gameID)
        .order('timestamp', { ascending: true });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const equityData: Record<string, ChartUnit[]> = {};

    for (const r of rows ?? []) {
        const playerId = r.player_id as string;
        (equityData[playerId] ??= []).push({
            time: r.timestamp as string,
            value: Number(r.equity),
        });
    }

    return NextResponse.json({ equityData });
}