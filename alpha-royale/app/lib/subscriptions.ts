import { supabase } from '../auth/supabaseClient/supabaseClient';

export const subscribeToGame = (gameId: string, callback: (payload: any) => void) => {
  const channel = supabase
    .channel(`game-${gameId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'games',
        filter: `id=eq.${gameId}`
      },
      callback
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

export const subscribeToPositions = (gameId: string, playerId: string, callback: (payload: any) => void) => {
  const channel = supabase
    .channel(`positions-${gameId}-${playerId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'positions',
        filter: `game_id=eq.${gameId}`
      },
      callback
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

export const subscribeToGamePlayers = (gameId: string, callback: (payload: any) => void) => {
  const channel = supabase
    .channel(`game-players-${gameId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'game_players',
        filter: `game_id=eq.${gameId}`
      },
      callback
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

export const subscribeToPrices = (callback: (payload: any) => void) => {
  const channel = supabase
    .channel('price-updates')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'price_data'
      },
      callback
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};
