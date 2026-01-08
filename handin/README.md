# Alpha Royale - Trading Game

Alpha Royale real-time multiplayer trading game.

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
- Supabase account and project
- Cloudflare account
- Finnhub API key (free at https://finnhub.io)

### Database Setup (Supabase)

1. Create a Supabase project at https://supabase.com
2. Navigate to the nextapp directory and run migrations:
```bash
cd nextapp
npx supabase db push
```
This will apply all database migrations from `nextapp/supabase/migrations/`.

### Frontend Setup (Next.js)

1. Navigate to nextapp directory:
```bash
cd nextapp
npm install
```

2. Create environment file from example:
```bash
cp .env.example .env.local
```

3. Edit `.env.local` with your Supabase credentials:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
```
Get these from your Supabase project settings → API.

4. Start development server:
```bash
npm run dev
```

### Backend Setup (Cloudflare Workers)

1. Navigate to worker directory:
```bash
cd worker
npm install
```

2. Create environment file from example:
```bash
cp .dev.vars.example .dev.vars
```

3. Edit `.dev.vars` with your credentials:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
FINNHUB_API_KEY=your_finnhub_api_key
```
Get service role key from Supabase project settings → API (keep this secret!).

4. For local development:
```bash
npm run dev
```

## Deployment

### Frontend Deployment (Vercel)

1. Install Vercel CLI (if not already installed):
```bash
npm i -g vercel
```

2. Navigate to nextapp directory:
```bash
cd nextapp
```

3. Deploy to Vercel:
```bash
vercel
```
Follow the prompts for first-time setup.

4. Set environment variables in Vercel dashboard or via CLI:
```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```
For each command, enter the value when prompted. Select "Production", "Preview", and "Development" environments.

5. Deploy to production:
```bash
vercel --prod
```

**Or use Vercel Dashboard:**
- Go to https://vercel.com
- Import your repository
- Set environment variables in Project Settings → Environment Variables
- Deploy

### Backend Deployment (Cloudflare Workers)

1. Install Wrangler CLI (comes with npm install, but can also install globally):
```bash
npm install -g wrangler
```

2. Login to Cloudflare:
```bash
cd worker
npx wrangler login
```

3. Set secrets for main worker:
```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put FINNHUB_API_KEY
```
For each command, enter the value when prompted.

4. Set secrets for game-tick worker:
```bash
npx wrangler secret put SUPABASE_URL --config wrangler-game-tick.toml
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --config wrangler-game-tick.toml
npx wrangler secret put FINNHUB_API_KEY --config wrangler-game-tick.toml
```

5. Deploy both workers:
```bash
npm run deploy:all
```

Or deploy individually:
```bash
# Deploy game-tick worker first (required for service binding)
npm run deploy:game-tick

# Then deploy main worker (binds to game-tick worker)
npm run deploy:main
```

**Important:** The game-tick worker must be deployed before the main worker because the main worker uses a service binding to it.

## Verification

After deployment:

1. **Frontend**: Visit your Vercel deployment URL. You should see the login page.
2. **Backend**: Check worker logs:
```bash
cd worker
npx wrangler tail
```
You should see cron logs and game tick processing.

## Architecture

The system uses a serverless architecture:
- **Frontend**: Next.js hosted on Vercel
- **Backend**: Cloudflare Workers with Durable Objects
- **Database**: Supabase (PostgreSQL + Realtime)
- **External APIs**: Finnhub for price data

Game ticks run every 10 seconds via Durable Object alarms, with cron fallback for reliability.
