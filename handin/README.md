# Alpha Royale - Trading Game

Complete handin package for the Alpha Royale real-time multiplayer trading game.

## Project Structure

```
handin/
├── nextapp/                # Next.js frontend application
│   ├── app/               # Next.js app directory
│   ├── public/            # Static assets
│   ├── supabase/          # Database migrations
│   └── package.json       # Frontend dependencies
├── worker/                # Cloudflare Workers backend
│   └── src/               # Worker source code
└── README.md              # This file
```

## Components

### Frontend (Next.js) - `nextapp/`
- **Authentication**: Supabase Auth integration
- **Game Interface**: Real-time trading interface with live charts
- **API Routes**: RESTful API endpoints for game operations
- **Real-time Subscriptions**: WebSocket integration via Supabase Realtime

### Backend (Cloudflare Workers) - `worker/`
- **Main Worker**: Orchestrates price fetching and game ticks
- **Game-Tick Worker**: Processes individual game ticks
- **Durable Object Scheduler**: 10-second game tick scheduling
- **Game Logic**: Order processing, position management, equity calculations

### Database (Supabase) - `nextapp/supabase/`
- PostgreSQL database with migrations
- Real-time subscriptions for live updates
- Row-level security policies

## Setup

### Prerequisites
- Node.js 18+
- Supabase account
- Cloudflare account
- Finnhub API key

### Frontend Setup

1. Navigate to nextapp directory:
```bash
cd nextapp
npm install
```

2. Set environment variables (create `.env.local`):
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

3. Run database migrations:
```bash
npx supabase db push
```

4. Start development server:
```bash
npm run dev
```

### Backend Setup

1. Navigate to worker directory:
```bash
cd worker
npm install
```

2. Configure environment variables (create `.dev.vars`):
```
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
FINNHUB_API_KEY=your_finnhub_api_key
```

3. Deploy workers:
```bash
npm run deploy:all
```

## Deployment

### Frontend (Vercel)
```bash
cd nextapp
vercel deploy --prod
```

### Backend (Cloudflare)
```bash
cd worker
npm run deploy:all
```

## Architecture

The system uses a serverless architecture:
- **Frontend**: Next.js hosted on Vercel
- **Backend**: Cloudflare Workers with Durable Objects
- **Database**: Supabase (PostgreSQL + Realtime)
- **External APIs**: Finnhub for price data

Game ticks run every 10 seconds via Durable Object alarms, with cron fallback for reliability.
