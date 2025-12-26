# Alpha Royale Worker

Cloudflare Worker for Alpha Royale game backend.

## Installation

```bash
npm install
```

## Running

Start the development server:

```bash
npm run dev
```

The worker will be available at `http://localhost:8787`

## Testing Cron Trigger

To manually test the cron trigger (game tick) in development:

```bash
curl "http://localhost:8787/cdn-cgi/handler/scheduled"
```

## Deployment

Deploy to Cloudflare:

```bash
npm run deploy
```

