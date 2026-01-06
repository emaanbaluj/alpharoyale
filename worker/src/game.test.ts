import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as db from './db';
import {
  processMarketOrders,
  processConditionalOrders,
  updatePositions,
  updatePlayerBalances,
  updateEquityHistory,
} from './game';

// Mock the db module
vi.mock('./db', () => ({
  fetchOrdersFromDB: vi.fn(),
  fetchPriceDataFromDB: vi.fn(),
  fetchPositionsFromDB: vi.fn(),
  fetchGamePlayersFromDB: vi.fn(),
  updateOrderInDB: vi.fn(),
  insertOrderExecutionInDB: vi.fn(),
  insertPositionInDB: vi.fn(),
  updatePositionInDB: vi.fn(),
  updateGamePlayerBalanceInDB: vi.fn(),
  insertEquityHistoryInDB: vi.fn(),
}));

describe('processMarketOrders', () => {
  let mockSupabase: SupabaseClient;
  const gameId = 'test-game-id';
  const tick = 1;

  beforeEach(() => {
    mockSupabase = {} as SupabaseClient;
    vi.clearAllMocks();
  });

  it('should execute pending market buy orders and create position', async () => {
    const playerId = 'player-1';
    const symbol = 'BTC';
    const quantity = 0.1;
    const fillPrice = 50000;

    // Mock pending market buy order
    vi.mocked(db.fetchOrdersFromDB).mockResolvedValue([
      {
        id: 'order-1',
        game_id: gameId,
        player_id: playerId,
        symbol,
        order_type: 'MARKET',
        side: 'BUY',
        quantity: quantity.toString(),
        status: 'pending',
      } as any,
    ]);

    // Mock price data
    vi.mocked(db.fetchPriceDataFromDB).mockResolvedValue([
      { symbol, price: fillPrice.toString(), game_state: tick } as any,
    ]);

    // Mock no existing positions
    vi.mocked(db.fetchPositionsFromDB).mockResolvedValue([]);

    // Mock game player data
    vi.mocked(db.fetchGamePlayersFromDB).mockResolvedValue([
      {
        id: 'gp-1',
        game_id: gameId,
        user_id: playerId,
        balance: '10000',
        equity: '10000',
      } as any,
    ]);

    // Mock DB updates
    vi.mocked(db.updateOrderInDB).mockResolvedValue();
    vi.mocked(db.insertOrderExecutionInDB).mockResolvedValue();
    vi.mocked(db.updateGamePlayerBalanceInDB).mockResolvedValue();
    vi.mocked(db.insertPositionInDB).mockResolvedValue({
      id: 'pos-1',
      game_id: gameId,
      player_id: playerId,
      symbol,
      side: 'BUY',
      quantity: quantity.toString(),
      entry_price: fillPrice.toString(),
      status: 'open',
    } as any);

    await processMarketOrders(mockSupabase, gameId, tick);

    // Verify order was filled
    expect(db.updateOrderInDB).toHaveBeenCalledWith(
      mockSupabase,
      'order-1',
      'filled',
      fillPrice
    );

    // Verify execution was logged
    expect(db.insertOrderExecutionInDB).toHaveBeenCalledWith(
      mockSupabase,
      'order-1',
      gameId,
      playerId,
      symbol,
      'BUY',
      quantity,
      fillPrice,
      tick
    );

    // Verify position was created
    expect(db.insertPositionInDB).toHaveBeenCalledWith(
      mockSupabase,
      gameId,
      playerId,
      symbol,
      'BUY',
      quantity,
      fillPrice,
      1
    );

    // Verify balance was deducted (10000 - 5000 = 5000)
    expect(db.updateGamePlayerBalanceInDB).toHaveBeenCalledWith(
      mockSupabase,
      gameId,
      playerId,
      5000, // New balance after purchase
      10000 // Equity remains same (will be recalculated later by updatePlayerBalances)
    );
  });

  it('should reject sell orders without existing position', async () => {
    const playerId = 'player-1';
    const symbol = 'BTC';
    const quantity = 0.1;
    const fillPrice = 50000;

    // Mock pending market sell order
    vi.mocked(db.fetchOrdersFromDB).mockResolvedValue([
      {
        id: 'order-2',
        game_id: gameId,
        player_id: playerId,
        symbol,
        order_type: 'MARKET',
        side: 'SELL',
        quantity: quantity.toString(),
        status: 'pending',
      } as any,
    ]);

    // Mock price data
    vi.mocked(db.fetchPriceDataFromDB).mockResolvedValue([
      { symbol, price: fillPrice.toString(), game_state: tick } as any,
    ]);

    // Mock no existing positions
    vi.mocked(db.fetchPositionsFromDB).mockResolvedValue([]);

    vi.mocked(db.updateOrderInDB).mockResolvedValue();

    await processMarketOrders(mockSupabase, gameId, tick);

    // Verify order was rejected
    expect(db.updateOrderInDB).toHaveBeenCalledWith(
      mockSupabase,
      'order-2',
      'rejected'
    );

    // Verify no execution was logged
    expect(db.insertOrderExecutionInDB).not.toHaveBeenCalled();
  });

  it('should skip orders when price data is missing', async () => {
    const playerId = 'player-1';
    const symbol = 'BTC';
    const quantity = 0.1;

    vi.mocked(db.fetchOrdersFromDB).mockResolvedValue([
      {
        id: 'order-3',
        game_id: gameId,
        player_id: playerId,
        symbol,
        order_type: 'MARKET',
        side: 'BUY',
        quantity: quantity.toString(),
        status: 'pending',
      } as any,
    ]);

    // Mock no price data
    vi.mocked(db.fetchPriceDataFromDB).mockResolvedValue([]);
    vi.mocked(db.fetchPositionsFromDB).mockResolvedValue([]);

    await processMarketOrders(mockSupabase, gameId, tick);

    // Verify order was not updated (remains pending)
    expect(db.updateOrderInDB).not.toHaveBeenCalled();
  });

  it('should reject orders with invalid quantity', async () => {
    const playerId = 'player-1';
    const symbol = 'BTC';
    const fillPrice = 50000;

    vi.mocked(db.fetchOrdersFromDB).mockResolvedValue([
      {
        id: 'order-4',
        game_id: gameId,
        player_id: playerId,
        symbol,
        order_type: 'MARKET',
        side: 'BUY',
        quantity: '-0.1', // Invalid negative quantity
        status: 'pending',
      } as any,
    ]);

    vi.mocked(db.fetchPriceDataFromDB).mockResolvedValue([
      { symbol, price: fillPrice.toString(), game_state: tick } as any,
    ]);
    vi.mocked(db.fetchPositionsFromDB).mockResolvedValue([]);
    vi.mocked(db.updateOrderInDB).mockResolvedValue();

    await processMarketOrders(mockSupabase, gameId, tick);

    // Verify order was rejected
    expect(db.updateOrderInDB).toHaveBeenCalledWith(
      mockSupabase,
      'order-4',
      'rejected'
    );
  });
});

describe('processConditionalOrders', () => {
  let mockSupabase: SupabaseClient;
  const gameId = 'test-game-id';
  const tick = 1;
  const playerId = 'player-1';
  const symbol = 'BTC';

  beforeEach(() => {
    mockSupabase = {} as SupabaseClient;
    vi.clearAllMocks();
  });

  it('should trigger take profit order when price exceeds trigger', async () => {
    const entryPrice = 51000;
    const triggerPrice = 55000;
    const currentPrice = 55100; // Above trigger
    const quantity = 0.2;
    const positionId = 'pos-1';

    // Mock TP order
    vi.mocked(db.fetchOrdersFromDB).mockResolvedValue([
      {
        id: 'tp-order-1',
        game_id: gameId,
        player_id: playerId,
        symbol,
        order_type: 'TAKE_PROFIT',
        side: 'SELL',
        quantity: quantity.toString(),
        trigger_price: triggerPrice.toString(),
        position_id: positionId,
        status: 'pending',
      } as any,
    ]);

    // Mock open position
    vi.mocked(db.fetchPositionsFromDB).mockResolvedValue([
      {
        id: positionId,
        game_id: gameId,
        player_id: playerId,
        symbol,
        side: 'BUY',
        quantity: quantity.toString(),
        entry_price: entryPrice.toString(),
        status: 'open',
      } as any,
    ]);

    // Mock price data
    vi.mocked(db.fetchPriceDataFromDB).mockResolvedValue([
      { symbol, price: currentPrice.toString(), game_state: tick } as any,
    ]);

    vi.mocked(db.updateOrderInDB).mockResolvedValue();
    vi.mocked(db.insertOrderExecutionInDB).mockResolvedValue();
    vi.mocked(db.updatePositionInDB).mockResolvedValue();

    await processConditionalOrders(mockSupabase, gameId, tick);

    // Verify TP order was filled
    expect(db.updateOrderInDB).toHaveBeenCalledWith(
      mockSupabase,
      'tp-order-1',
      'filled',
      currentPrice
    );

    // Verify position was closed
    const expectedPnl = (currentPrice - entryPrice) * quantity;
    expect(db.updatePositionInDB).toHaveBeenCalledWith(
      mockSupabase,
      positionId,
      {
        status: 'closed',
        currentPrice: currentPrice,
        unrealizedPnl: expectedPnl,
      }
    );
  });

  it('should trigger stop loss order when price drops below trigger', async () => {
    const entryPrice = 51000;
    const triggerPrice = 48000;
    const currentPrice = 47900; // Below trigger
    const quantity = 0.2;
    const positionId = 'pos-1';

    vi.mocked(db.fetchOrdersFromDB).mockResolvedValue([
      {
        id: 'sl-order-1',
        game_id: gameId,
        player_id: playerId,
        symbol,
        order_type: 'STOP_LOSS',
        side: 'SELL',
        quantity: quantity.toString(),
        trigger_price: triggerPrice.toString(),
        position_id: positionId,
        status: 'pending',
      } as any,
    ]);

    vi.mocked(db.fetchPositionsFromDB).mockResolvedValue([
      {
        id: positionId,
        game_id: gameId,
        player_id: playerId,
        symbol,
        side: 'BUY',
        quantity: quantity.toString(),
        entry_price: entryPrice.toString(),
        status: 'open',
      } as any,
    ]);

    vi.mocked(db.fetchPriceDataFromDB).mockResolvedValue([
      { symbol, price: currentPrice.toString(), game_state: tick } as any,
    ]);

    vi.mocked(db.updateOrderInDB).mockResolvedValue();
    vi.mocked(db.insertOrderExecutionInDB).mockResolvedValue();
    vi.mocked(db.updatePositionInDB).mockResolvedValue();

    await processConditionalOrders(mockSupabase, gameId, tick);

    // Verify SL order was filled
    expect(db.updateOrderInDB).toHaveBeenCalledWith(
      mockSupabase,
      'sl-order-1',
      'filled',
      currentPrice
    );

    // Verify position was closed
    const expectedPnl = (currentPrice - entryPrice) * quantity;
    expect(db.updatePositionInDB).toHaveBeenCalledWith(
      mockSupabase,
      positionId,
      {
        status: 'closed',
        currentPrice: currentPrice,
        unrealizedPnl: expectedPnl,
      }
    );
  });

  it('should not trigger TP order when price is below trigger', async () => {
    const entryPrice = 51000;
    const triggerPrice = 55000;
    const currentPrice = 54000; // Below trigger
    const quantity = 0.2;
    const positionId = 'pos-1';

    vi.mocked(db.fetchOrdersFromDB).mockResolvedValue([
      {
        id: 'tp-order-2',
        game_id: gameId,
        player_id: playerId,
        symbol,
        order_type: 'TAKE_PROFIT',
        side: 'SELL',
        quantity: quantity.toString(),
        trigger_price: triggerPrice.toString(),
        position_id: positionId,
        status: 'pending',
      } as any,
    ]);

    vi.mocked(db.fetchPositionsFromDB).mockResolvedValue([
      {
        id: positionId,
        game_id: gameId,
        player_id: playerId,
        symbol,
        side: 'BUY',
        quantity: quantity.toString(),
        entry_price: entryPrice.toString(),
        status: 'open',
      } as any,
    ]);

    vi.mocked(db.fetchPriceDataFromDB).mockResolvedValue([
      { symbol, price: currentPrice.toString(), game_state: tick } as any,
    ]);

    vi.mocked(db.updateOrderInDB).mockResolvedValue();

    await processConditionalOrders(mockSupabase, gameId, tick);

    // Verify order was NOT filled (remains pending)
    expect(db.updateOrderInDB).not.toHaveBeenCalledWith(
      mockSupabase,
      'tp-order-2',
      'filled',
      expect.any(Number)
    );
  });

  it('should reject TP/SL orders without valid position', async () => {
    const triggerPrice = 55000;
    const quantity = 0.2;

    vi.mocked(db.fetchOrdersFromDB).mockResolvedValue([
      {
        id: 'tp-order-3',
        game_id: gameId,
        player_id: playerId,
        symbol,
        order_type: 'TAKE_PROFIT',
        side: 'SELL',
        quantity: quantity.toString(),
        trigger_price: triggerPrice.toString(),
        position_id: null, // No position
        status: 'pending',
      } as any,
    ]);

    vi.mocked(db.fetchPositionsFromDB).mockResolvedValue([]);
    vi.mocked(db.updateOrderInDB).mockResolvedValue();

    await processConditionalOrders(mockSupabase, gameId, tick);

    // Verify order was rejected
    expect(db.updateOrderInDB).toHaveBeenCalledWith(
      mockSupabase,
      'tp-order-3',
      'rejected'
    );
  });
});

describe('updatePositions', () => {
  let mockSupabase: SupabaseClient;
  const gameId = 'test-game-id';

  beforeEach(() => {
    mockSupabase = {} as SupabaseClient;
    vi.clearAllMocks();
  });

  it('should update position P&L correctly for long position', async () => {
    const playerId = 'player-1';
    const symbol = 'BTC';
    const entryPrice = 50000;
    const currentPrice = 51000;
    const quantity = 0.1;
    const leverage = 1;

    vi.mocked(db.fetchPositionsFromDB).mockResolvedValue([
      {
        id: 'pos-1',
        game_id: gameId,
        player_id: playerId,
        symbol,
        side: 'BUY',
        quantity: quantity.toString(),
        entry_price: entryPrice.toString(),
        leverage: leverage.toString(),
        status: 'open',
      } as any,
    ]);

    vi.mocked(db.fetchPriceDataFromDB).mockResolvedValue([
      { symbol, price: currentPrice.toString(), game_state: 1 } as any,
    ]);

    vi.mocked(db.updatePositionInDB).mockResolvedValue();

    await updatePositions(mockSupabase, gameId);

    // Verify P&L calculation: (51000 - 50000) * 0.1 * 1 = 100
    const expectedPnl = (currentPrice - entryPrice) * quantity * leverage;
    expect(db.updatePositionInDB).toHaveBeenCalledWith(
      mockSupabase,
      'pos-1',
      {
        currentPrice: currentPrice,
        unrealizedPnl: expectedPnl,
      }
    );
  });

  it('should handle leverage correctly in P&L calculation', async () => {
    const playerId = 'player-1';
    const symbol = 'BTC';
    const entryPrice = 50000;
    const currentPrice = 51000;
    const quantity = 0.1;
    const leverage = 2;

    vi.mocked(db.fetchPositionsFromDB).mockResolvedValue([
      {
        id: 'pos-2',
        game_id: gameId,
        player_id: playerId,
        symbol,
        side: 'BUY',
        quantity: quantity.toString(),
        entry_price: entryPrice.toString(),
        leverage: leverage.toString(),
        status: 'open',
      } as any,
    ]);

    vi.mocked(db.fetchPriceDataFromDB).mockResolvedValue([
      { symbol, price: currentPrice.toString(), game_state: 1 } as any,
    ]);

    vi.mocked(db.updatePositionInDB).mockResolvedValue();

    await updatePositions(mockSupabase, gameId);

    // Verify P&L with leverage: (51000 - 50000) * 0.1 * 2 = 200
    const expectedPnl = (currentPrice - entryPrice) * quantity * leverage;
    expect(db.updatePositionInDB).toHaveBeenCalledWith(
      mockSupabase,
      'pos-2',
      {
        currentPrice: currentPrice,
        unrealizedPnl: expectedPnl,
      }
    );
  });

  it('should skip positions without price data', async () => {
    vi.mocked(db.fetchPositionsFromDB).mockResolvedValue([
      {
        id: 'pos-3',
        game_id: gameId,
        player_id: 'player-1',
        symbol: 'BTC',
        side: 'BUY',
        quantity: '0.1',
        entry_price: '50000',
        status: 'open',
      } as any,
    ]);

    // Mock no price data
    vi.mocked(db.fetchPriceDataFromDB).mockResolvedValue([]);

    await updatePositions(mockSupabase, gameId);

    // Verify position was not updated
    expect(db.updatePositionInDB).not.toHaveBeenCalled();
  });
});

describe('updatePlayerBalances', () => {
  let mockSupabase: SupabaseClient;
  const gameId = 'test-game-id';

  beforeEach(() => {
    mockSupabase = {} as SupabaseClient;
    vi.clearAllMocks();
  });

  it('should calculate equity as balance plus unrealized P&L', async () => {
    const playerId = 'player-1';
    const balance = 5000;
    const unrealizedPnl = 100;

    vi.mocked(db.fetchPositionsFromDB).mockResolvedValue([
      {
        id: 'pos-1',
        game_id: gameId,
        player_id: playerId,
        symbol: 'BTC',
        side: 'BUY',
        unrealized_pnl: unrealizedPnl.toString(),
        status: 'open',
      } as any,
    ]);

    vi.mocked(db.fetchGamePlayersFromDB).mockResolvedValue([
      {
        id: 'gp-1',
        game_id: gameId,
        user_id: playerId,
        balance: balance.toString(),
        equity: balance.toString(),
      } as any,
    ]);

    vi.mocked(db.updateGamePlayerBalanceInDB).mockResolvedValue();

    await updatePlayerBalances(mockSupabase, gameId);

    // Verify equity = balance + unrealized P&L = 5000 + 100 = 5100
    expect(db.updateGamePlayerBalanceInDB).toHaveBeenCalledWith(
      mockSupabase,
      gameId,
      playerId,
      balance,
      balance + unrealizedPnl
    );
  });

  it('should handle multiple positions for same player', async () => {
    const playerId = 'player-1';
    const balance = 10000;
    const pnl1 = 100;
    const pnl2 = 50;

    vi.mocked(db.fetchPositionsFromDB).mockResolvedValue([
      {
        id: 'pos-1',
        game_id: gameId,
        player_id: playerId,
        symbol: 'BTC',
        unrealized_pnl: pnl1.toString(),
        status: 'open',
      } as any,
      {
        id: 'pos-2',
        game_id: gameId,
        player_id: playerId,
        symbol: 'ETH',
        unrealized_pnl: pnl2.toString(),
        status: 'open',
      } as any,
    ]);

    vi.mocked(db.fetchGamePlayersFromDB).mockResolvedValue([
      {
        id: 'gp-1',
        game_id: gameId,
        user_id: playerId,
        balance: balance.toString(),
        equity: balance.toString(),
      } as any,
    ]);

    vi.mocked(db.updateGamePlayerBalanceInDB).mockResolvedValue();

    await updatePlayerBalances(mockSupabase, gameId);

    // Verify equity = balance + (pnl1 + pnl2) = 10000 + 150 = 10150
    expect(db.updateGamePlayerBalanceInDB).toHaveBeenCalledWith(
      mockSupabase,
      gameId,
      playerId,
      balance,
      balance + pnl1 + pnl2
    );
  });

  it('should handle players with no open positions', async () => {
    const playerId = 'player-1';
    const balance = 10000;

    vi.mocked(db.fetchPositionsFromDB).mockResolvedValue([]);

    vi.mocked(db.fetchGamePlayersFromDB).mockResolvedValue([
      {
        id: 'gp-1',
        game_id: gameId,
        user_id: playerId,
        balance: balance.toString(),
        equity: balance.toString(),
      } as any,
    ]);

    vi.mocked(db.updateGamePlayerBalanceInDB).mockResolvedValue();

    await updatePlayerBalances(mockSupabase, gameId);

    // Verify equity = balance (no unrealized P&L)
    expect(db.updateGamePlayerBalanceInDB).toHaveBeenCalledWith(
      mockSupabase,
      gameId,
      playerId,
      balance,
      balance
    );
  });
});

describe('updateEquityHistory', () => {
  let mockSupabase: SupabaseClient;
  const gameId = 'test-game-id';
  const tick = 5;

  beforeEach(() => {
    mockSupabase = {} as SupabaseClient;
    vi.clearAllMocks();
  });

  it('should record equity history for all players', async () => {
    const player1Id = 'player-1';
    const player2Id = 'player-2';
    const balance1 = 10000;
    const equity1 = 10500;
    const balance2 = 8000;
    const equity2 = 8200;

    vi.mocked(db.fetchGamePlayersFromDB).mockResolvedValue([
      {
        id: 'gp-1',
        game_id: gameId,
        user_id: player1Id,
        balance: balance1.toString(),
        equity: equity1.toString(),
      } as any,
      {
        id: 'gp-2',
        game_id: gameId,
        user_id: player2Id,
        balance: balance2.toString(),
        equity: equity2.toString(),
      } as any,
    ]);

    vi.mocked(db.insertEquityHistoryInDB).mockResolvedValue();

    await updateEquityHistory(mockSupabase, gameId, tick);

    // Verify equity history was recorded for both players
    expect(db.insertEquityHistoryInDB).toHaveBeenCalledWith(
      mockSupabase,
      gameId,
      player1Id,
      tick,
      balance1,
      equity1
    );

    expect(db.insertEquityHistoryInDB).toHaveBeenCalledWith(
      mockSupabase,
      gameId,
      player2Id,
      tick,
      balance2,
      equity2
    );
  });

  it('should handle empty player list gracefully', async () => {
    vi.mocked(db.fetchGamePlayersFromDB).mockResolvedValue([]);

    await updateEquityHistory(mockSupabase, gameId, tick);

    // Verify no equity history was inserted
    expect(db.insertEquityHistoryInDB).not.toHaveBeenCalled();
  });
});
