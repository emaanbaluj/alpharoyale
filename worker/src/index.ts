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
};

