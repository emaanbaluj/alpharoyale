// worker/src/index.ts

export interface Env {
  FINNHUB_API_KEY?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Health endpoint
    if (path === '/health' || path === '/') {
      return new Response(
        JSON.stringify({ status: 'ok' }),
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // 404 for unknown routes
    return new Response('Not Found', { status: 404 });
  },

  // Cron handler for game ticks
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // This is called on each cron trigger
    // TODO: Implement game tick logic here
    // - Process pending orders
    // - Update market prices
    // - Execute trades
    // - Update game state
  
    
    console.log(`Game tick executed at ${new Date(event.scheduledTime).toISOString()}`);
  },
};
