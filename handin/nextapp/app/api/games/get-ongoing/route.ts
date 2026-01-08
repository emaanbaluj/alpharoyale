import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const playerID = searchParams.get('playerID');

    if (!playerID) {
        return NextResponse.json({ error: 'Player ID is required' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const activeGameStatus = 'active';

    const { data: ongoingGames, error } = await supabase
        .from('games')
        .select('id, player1_id, player2_id, started_at, duration_minutes')
        .eq('status', activeGameStatus)
        .or(`player1_id.eq.${playerID},player2_id.eq.${playerID}`);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const transformedOngoingGames = (ongoingGames ?? []).map((currGame) => {
        const opponent = currGame.player1_id === playerID ? currGame.player2_id : currGame.player1_id;

        return {
            id: currGame.id,
            started_at: currGame.started_at,
            duration_minutes: currGame.duration_minutes,
            opponent,
        };
    });

    return NextResponse.json({ transformedOngoingGames });
}
