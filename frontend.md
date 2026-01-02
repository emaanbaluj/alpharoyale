# Frontend Implementation Guide

## Overview
This document outlines what needs to be implemented in each page of the Alpha Royale application. Currently, all pages have placeholder UI with no backend connections. The styling is minimal and functional.

## Landing Page (app/page.tsx)
Current state: Basic landing with logo, tagline, and two buttons

What needs to be done:
- Add animation to logo on page load
- Consider adding a brief feature list or game preview
- Maybe add a background gradient or subtle pattern
- Link to documentation or help section

## Auth Page (app/auth/page.tsx)
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

## Mobile Support
- Current layout is desktop-focused
- Need responsive breakpoints for all pages
- Consider mobile-specific game interface
- Test touch interactions for trading

## Priority Order
1. Get game page fully functional with real data
2. Implement matchmaking and game creation
3. Add leaderboard and match history pages
4. Polish the home page with real stats
5. Improve overall design and UX
6. Add advanced features (chat, replays, etc)
