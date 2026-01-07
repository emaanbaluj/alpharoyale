# Frontend Implementation Guide

## Overview
This document outlines the current implementation status and what remains to be done for the Alpha Royale frontend application.

## Current Implementation Status (As of Jan 5, 2026)

### Completed Features

#### API Layer
All API routes have been implemented and are functional:
- `/api/games/create` - Creates new game in database
- `/api/games/join` - Joins existing game by ID
- `/api/games/get` - Retrieves game details and player data
- `/api/orders/place` - Saves order to database
- `/api/positions/get` - Fetches player positions
- `/api/leaderboard` - Returns top 10 players by win rate
- `/api/stats` - Returns individual player statistics

#### Client-side Utilities
- `app/lib/api.ts` - Helper functions for API calls
- `app/lib/subscriptions.ts` - Real-time subscription setup for Supabase

#### Page Implementations

**Home Page (app/(protected)/home/page.tsx)**
- Fetches and displays real user statistics from database
- Shows global leaderboard with actual data
- Create game functionality (working - creates game in DB and redirects)
- Join game functionality (working - validates and joins by game ID)
- Real-time updates for stats
- Loading states and error handling

**Game Page (app/game/page.tsx)**
- Loads game data from URL parameter
- Displays real player balances from database
- Order placement form (saves to database)
- Position display (shows data from positions table)
- Real-time subscriptions for balance and position updates
- Proper loading and disabled states

**Authentication (app/auth/page.tsx)**
- Supabase auth integration (working)
- Login and signup flows
- Redirect to home on successful auth

### What Works Right Now

#### Fully Functional
1. User authentication and session management
2. Game creation - generates unique game ID and saves to database
3. Game joining - validates game ID and adds second player
4. Order placement - orders saved to orders table with "pending" status
5. User stats retrieval - games played, wins, win rate
6. Leaderboard display - top players by win rate
7. Real-time UI updates via Supabase subscriptions

#### Partially Functional
1. Position display - UI ready but positions table empty (backend creates these)
2. Balance display - shows initial $10,000 but won't update until backend processes orders
3. Price display - shows static mock prices until worker populates price_data table

### What Does Not Work Yet (Backend Required)

#### Missing Backend Logic
1. Price data population - worker needs to write to price_data table from Finnhub
2. Order execution engine - process pending orders and create positions
3. Position creation - match orders to current prices and insert into positions table
4. P&L calculation - update unrealized_pnl on positions based on current prices
5. Balance updates - recalculate game_players equity when positions change
6. Game completion - determine winner and update games table
7. Order matching - execute market orders at current prices

### Testing Instructions

#### Local Testing Setup
```
1. Start development server: npm run dev
2. Open two browser windows (use incognito for second user)
3. Sign up/login with different accounts in each window
4. Window 1: Click "Start Game" - note the game ID in URL
5. Window 2: Enter game ID in "Join Game" field and click Join
6. Both users now in same game session
7. Try placing orders - check Supabase dashboard to verify order records
```

Tables to check:
- games: Created game records with player IDs
- game_players: Both players with initial balances
- orders: Placed orders with status "pending"
- positions: Currently empty (backend will populate)
- price_data: Currently empty (worker will populate)

### Current Limitations

1. Orders are placed but never executed (remain pending forever)
2. No positions appear because order execution is not implemented
3. Balances do not update because there are no positions to calculate P&L from
4. Prices are hardcoded placeholders
5. Games never complete or determine winners
6. No real-time price updates

## Backend Requirements

### Critical - Required for Functional Game

#### Worker (Cloudflare/Cron)
1. Fetch prices from Finnhub API every 15-20 seconds
2. Write to price_data table with current game_state tick
3. Symbols needed: BTC, ETH, AAPL (minimum)

#### Order Execution Engine
1. Query pending orders from orders table
2. Match market orders to current price from price_data
3. Create position records in positions table
4. Update order status to "filled" and set filled_price
5. Create order_executions record
6. Update game_players balance and equity

#### Position Management
1. Update positions.current_price based on latest price_data
2. Calculate unrealized_pnl for open positions
3. Recalculate game_players equity (balance + unrealized P&L)
4. Handle position closing logic

#### Game Management
1. Implement game timer/duration logic
2. Determine winner when game ends (higher equity)
3. Update games table with winner_id and ended_at
4. Set status to "completed"

## Frontend-Only Work (No Backend Required)

These tasks can be completed by frontend devs without waiting for backend implementation. They will work with mock data initially and automatically connect once backend is ready.

### Priority 1: Charts and Visualization

#### Price Chart Component
- Install chart library (Chart.js, Recharts, or TradingView)
- Build reusable price chart component with mock data
- Add to game page with responsive sizing
- Real-time updates ready for when price_data is populated

#### Equity Curve Chart
- Create equity chart showing both players over time
- Mock data structure matching equity_history table
- Display on game page below price chart

### Priority 2: Game Page Features

#### Order Management
- Order cancellation UI and logic (button for pending orders)
- Stop loss and take profit input fields
- Leverage selector component
- Order history table during game (query orders table)

#### Game Status
- Game timer display component (countdown from started_at)
- Status badge showing waiting/active/completed
- Winner display when game ends

### Priority 3: New Pages

#### Full Leaderboard Page
- Pagination for large player lists
- Time period filters (daily, weekly, all-time)
- Search by username
- User rank highlighting

#### Match History Page
- List of user's completed games
- Final scores and opponent names
- Link to review finished games
- Win/loss indicators

#### Settings/Profile Page
- Display name editor
- Avatar upload
- Notification preferences
- Game settings

### Priority 4: Home Page Improvements

#### Active Games Section
- Query and display ongoing games for user
- Show opponent username (fetch from auth.users table)
- Display time remaining per game
- Quick join button

### Priority 5: UI/UX Polish

#### Loading States
- Replace text with loading skeletons
- Add proper loading indicators

#### Notifications
- Toast notification system (react-hot-toast or sonner)
- Success/error messages for actions

#### Modals
- Confirmation modals for critical actions
- Better error displays

#### Icons
- Add icons throughout app (lucide-react or heroicons)
- Improve button hover states and transitions

### Priority 6: Code Quality

#### TypeScript
- Define interfaces for all API responses (Game, Player, Order, Position)
- Add proper typing to all components
- Remove any `any` types

#### Error Handling
- Error boundaries for React errors
- Better error messages throughout
- Retry logic for failed API calls

#### Testing
- Unit tests for API utility functions
- Component tests with React Testing Library
- E2E tests for critical flows

## Technical Debt

### Code Quality
- Add TypeScript interfaces for all API responses
- Implement proper error boundaries
- Add unit tests for API functions
- Add E2E tests for critical flows

### Performance
- Implement proper caching strategy
- Optimize real-time subscriptions
- Add pagination for large lists
- Lazy load chart components

### Accessibility
- Add ARIA labels
- Ensure keyboard navigation
- Add focus indicators
- Screen reader support

## Integration Points

### Frontend to Backend Data Flow

```
Frontend → Supabase DB ← Backend Worker

Frontend responsibilities:
- Create games
- Place orders
- Fetch game state
- Display positions
- Subscribe to updates

Backend responsibilities:
- Fetch prices from Finnhub
- Execute pending orders
- Update positions
- Calculate P&L
- Determine winners
```

### Required Environment Variables
```
NEXT_PUBLIC_SUPABASE_URL=<supabase-project-url>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<supabase-anon-key>
```

### Database Tables Used
- games: Game sessions
- game_players: Player state per game
- orders: Trading orders
- positions: Open/closed positions
- order_executions: Execution history
- price_data: Historical prices
- equity_history: Balance over time

## Development Workflow

### Starting Development
```bash
cd alpha-royale
npm install
npm run dev
```

### Testing Changes
1. Login with test account
2. Create game to get game ID
3. Use second browser/incognito to join as opponent
4. Test order placement
5. Check Supabase dashboard for data

### Before Pushing
- Test login/logout flow
- Verify game creation and joining
- Ensure order placement saves to DB
- Check console for errors
- Verify real-time updates work

## Known Issues
1. Game ID in URL is visible - consider hashing or short codes
2. No validation on order quantity limits
3. No check for sufficient balance before order
4. Position cards do not show leverage
5. No handling for disconnected opponents
6. No game timeout or forfeit logic

## Next Steps for Full Feature Completion
1. Backend team implements order execution engine
2. Backend team implements price data worker
3. Frontend integrates chart library for price visualization
4. Frontend adds equity curve charts
5. Backend implements game completion logic
6. Frontend adds match history and leaderboard pages
7. Full end-to-end testing with real users
Current state: Supabase auth component with logo and back button

What needs to be done:
- Style the Supabase auth component to match dark theme better
- Add error message display for failed login attempts
- Add loading state when submitting credentials
- Consider adding social auth providers if needed
- Add password reset flow

## Home Page (app/(protected)/home/page.tsx)
Current state: Sidebar with navigation, main area with stats cards

What needs to be done:
- Connect stats to actual user data from Supabase
- Wire up Leaderboard and Match History buttons to actual pages
- Add recent games list in main area
- Add active players count or online status
- Create actual routes for leaderboard and match history
- Add user profile section with editable settings

What can be improved:
- Add notifications or alerts system
- Add friend list or recent opponents
- Add achievement badges or progress indicators
- Better visual hierarchy in the stats section

## Game Page (app/game/page.tsx)
Current state: Basic trading interface with placeholder data

What needs to be done:
- Integrate real-time price data from Finnhub API (via worker)
- Connect market chart placeholder to actual charting library
- Hook up order form to Supabase orders table
- Display real open positions from database
- Add equity curve chart showing portfolio value over time
- Add opponent's equity curve for comparison
- Implement buy/sell order execution
- Add stop loss and take profit fields
- Add leverage trading controls
- Show live opponent trades in real-time
- Add game timer and end game logic
- Add connection status indicator
- Handle game state transitions (waiting, active, ended)

What can be improved:
- Add order confirmation modal before execution
- Add recent trades list/history during game
- Add hotkeys for quick trading
- Add sound effects for trades and notifications
- Better mobile responsiveness
- Add pause/forfeit game option
- Add chat or emote system for players

## Pages That Don't Exist Yet

### Leaderboard Page
- Display top players by wins, win rate, or returns
- Show user's rank and stats
- Add filters for time periods (daily, weekly, all-time)
- Add search to find specific players

### Match History Page
- List all past games with results
- Show detailed breakdown of each game
- Display opponent info and final scores
- Add replay or review feature
- Add filters and sorting

### Settings/Profile Page
- Edit user profile information
- Change avatar or display name
- Notification preferences
- Game settings (sound, hotkeys, etc)
- Account security settings

## Technical TODOs

### State Management
- Decide on state management approach (Context, Zustand, etc)
- Set up global state for user data
- Set up real-time listeners for game state
- Handle WebSocket connections for live updates

### API Integration
- Create API routes in Next.js for backend calls
- Set up Supabase real-time subscriptions
- Connect to Finnhub worker for price data
- Handle error states and retries

### Components to Create
- Chart component for price data
- Chart component for equity curves
- Order book display
- Position card component
- Trade history item component
- Leaderboard row component
- Match history card component
- Modal components for confirmations
- Toast/notification component

### Data Flow
- User authentication flow is working
- Need to set up game creation and joining flow
- Need to implement matchmaking logic
- Need to handle game state updates
- Need to sync prices across both players
- Need to calculate and update equity in real-time

### Testing Needs
- Test with two users in same game
- Test order execution logic
- Test real-time price updates
- Test game end conditions
- Test edge cases (disconnect, reload, etc)

## Design Improvements
- Current design is very basic gray boxes
- Could add better spacing and typography
- Add hover states and transitions
- Add loading skeletons instead of blank states
- Improve button styles and consistency
- Add icons to navigation items
- Consider adding a design system or component library

## Performance Considerations
- Optimize real-time updates to avoid excessive re-renders
- Implement proper loading states
- Add pagination for history and leaderboard
- Consider caching price data
- Lazy load heavy components like charts

## Accessibility
- Add proper ARIA labels
- Ensure keyboard navigation works
- Add focus indicators
- Ensure color contrast is sufficient
- Add screen reader announcements for game events

## Priority Order
1. Get game page fully functional with real data
2. Implement matchmaking and game creation
3. Add leaderboard and match history pages
4. Polish the home page with real stats
5. Improve overall design and UX
6. Add advanced features (chat, replays, etc)
