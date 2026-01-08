'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import toast from 'react-hot-toast';
import { supabase } from '../auth/supabaseClient/supabaseClient';
import { orderAPI, positionAPI, gameAPI, priceAPI, equityAPI } from '../lib/api';
import { subscribeToGamePlayers, subscribeToPositions, subscribeToPrices, subscribeToEquityHistory, subscribeToGame } from '../lib/subscriptions';
import { PriceChart } from './charts/PriceChart';
import { CandlestickChart } from './charts/CandlestickChart';

interface Position {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  entry_price: number;
  current_price: number;
  unrealized_pnl: number;
}

interface Order {
  id: string;
  symbol: string;
  order_type: string;
  side: string;
  quantity: number;
  price: number | null;
  trigger_price: number | null;
  status: string;
  position_id: string | null;
  filled_price: number | null;
  filled_at: string | null;
  created_at: string;
}

interface TickerPriceData {
  ticker: CompatibleTickers;
  price: ChartUnit[];
}

interface ChartUnit {
  time: string;
  value: number;
}

const COMPATIBLETICKERS = ["ETH", "BTC", "AAPL", "TSLA", "MSFT", "SPY"] as const;
type CompatibleTickers = (typeof COMPATIBLETICKERS)[number];

function GamePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const gameId = searchParams.get('id');

  const [symbol, setSymbol] = useState('BTC');
  const [amount, setAmount] = useState('');
  const [orderSide, setOrderSide] = useState('buy');
  const [userId, setUserId] = useState<string | null>(null);
  const [myBalance, setMyBalance] = useState(10000);
  const [myEquity, setMyEquity] = useState(10000);
  const [opponentEquity, setOpponentEquity] = useState(10000);
  const [positions, setPositions] = useState<Position[]>([]);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [closingPosition, setClosingPosition] = useState(false);
  const [updatingTpSl, setUpdatingTpSl] = useState(false);
  const [startingGame, setStartingGame] = useState(false);
  const [selectedChartTicker, setSelectedChartTicker] = useState<CompatibleTickers>("BTC");
  const [marketData, setMarketData] = useState<Partial<Record<CompatibleTickers, TickerPriceData>>>({});
  const [myEquityChartData, setMyEquityChartData] = useState<ChartUnit[]>([]);
  const [oppEquityChartData, setOppEquityChartData] = useState<ChartUnit[]>([]);  // opponent equity curve
  const [showOppEquityCurve, setShowOppEquityCurve] = useState<boolean>(false); 
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null);
  const [triggerPrice, setTriggerPrice] = useState('');
  const [latestPrices, setLatestPrices] = useState<Record<string, number>>({});
  const [opponentId, setOpponentId] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [limitPrice, setLimitPrice] = useState('');
  const [tpTriggerPrice, setTpTriggerPrice] = useState('');
  const [slTriggerPrice, setSlTriggerPrice] = useState('');
  const [tpQuantity, setTpQuantity] = useState('');
  const [slQuantity, setSlQuantity] = useState('');
  const [addTp, setAddTp] = useState(false);
  const [addSl, setAddSl] = useState(false);
  const [editingPositionId, setEditingPositionId] = useState<string | null>(null);
  const [positionTpSlOrders, setPositionTpSlOrders] = useState<Record<string, Order[]>>({});
  const [closeOrderType, setCloseOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [closeQuantity, setCloseQuantity] = useState('');
  const [closeLimitPrice, setCloseLimitPrice] = useState('');
  const [closingPositionId, setClosingPositionId] = useState<string | null>(null);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [selectedPositionForClose, setSelectedPositionForClose] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'orders' | 'positions' | 'history'>('orders');
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [showTpSlModal, setShowTpSlModal] = useState(false);
  const [selectedPositionForTpSl, setSelectedPositionForTpSl] = useState<string | null>(null);
  const [newTpTriggerPrice, setNewTpTriggerPrice] = useState('');
  const [newTpQuantity, setNewTpQuantity] = useState('');
  const [newSlTriggerPrice, setNewSlTriggerPrice] = useState('');
  const [newSlQuantity, setNewSlQuantity] = useState('');
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editTriggerPrice, setEditTriggerPrice] = useState('');
  const [editQuantity, setEditQuantity] = useState('');
  const selectedPosition = positions.find(p => p.id === selectedPositionId);

  // Game status and waiting room state
  const [gameStatus, setGameStatus] = useState<string | null>(null);
  const [gamePlayers, setGamePlayers] = useState<any[]>([]);
  const [currentGame, setCurrentGame] = useState<any>(null);
  const [winnerId, setWinnerId] = useState<string | null>(null);

  // Timer state
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [gameEndTime, setGameEndTime] = useState<Date | null>(null);

  // Price change tracking
  const [previousPrices, setPreviousPrices] = useState<Record<string, number>>({});
  const [priceChanges, setPriceChanges] = useState<Record<string, number>>({});

  // Chart type
  const [chartType, setChartType] = useState<'line' | 'candle'>('line');

  // Previous PNL for animation
  const [previousPnl, setPreviousPnl] = useState<Record<string, number>>({});

  // Load price history for selected ticker
  useEffect(() => {
    loadPriceHistory(selectedChartTicker);
  }, [selectedChartTicker]);

  // Load latest prices on mount and set up subscription
  useEffect(() => {
    const initializePrices = async () => {
      const { prices } = await priceAPI.getLatestPrices();
      
      // If no prices loaded, trigger worker to fetch initial prices
      if (!prices || Object.keys(prices).length === 0) {
        console.log('No prices found, triggering worker to fetch initial prices...');
        try {
          await fetch('http://localhost:8787/trigger');
          // Wait a bit then reload prices
          setTimeout(async () => {
            const { prices: newPrices } = await priceAPI.getLatestPrices();
            if (newPrices) setLatestPrices(newPrices);
          }, 2000);
        } catch (error) {
          console.error('Failed to trigger worker:', error);
        }
      } else {
        setLatestPrices(prices);
      }
    };
    
    initializePrices();
    
    const unsubPrices = subscribeToPrices((payload) => {
      loadLatestPrices();
      loadPriceHistory(selectedChartTicker);
    });

    return () => {
      unsubPrices();
    };
  }, [selectedChartTicker]);

  async function loadPriceHistory(ticker: string) {
    const { prices } = await priceAPI.getPriceHistory(ticker, 360);
    if (prices) {
      setMarketData(prev => ({
        ...prev,
        [ticker]: { ticker, price: prices }
      }));
    }
  }

  async function loadLatestPrices() {
    const { prices } = await priceAPI.getLatestPrices();
    if (prices) {
      // Track price changes
      const changes: Record<string, number> = {};
      Object.keys(prices).forEach(ticker => {
        if (previousPrices[ticker]) {
          changes[ticker] = prices[ticker] - previousPrices[ticker];
        }
      });
      setPriceChanges(changes);
      setPreviousPrices(prices);
      setLatestPrices(prices);
    }
  }
  
  // Timer effect
  useEffect(() => {
    if (!gameEndTime) return;

    const updateTimer = () => {
      const now = new Date().getTime();
      const end = gameEndTime.getTime();
      const remaining = Math.max(0, Math.floor((end - now) / 1000));
      setTimeRemaining(remaining);
    };

    updateTimer();
    const timerInterval = setInterval(updateTimer, 1000);

    return () => clearInterval(timerInterval);
  }, [gameEndTime]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id);
        if (gameId) {
          loadGameData(gameId, user.id);
        }
      }
    });
  }, [gameId]);

  // Subscribe to game status changes for waiting room
  useEffect(() => {
    if (!gameId) return;

    const unsubGame = subscribeToGame(gameId, (payload) => {
      console.log('Game updated:', payload);
      if (payload.new) {
        const newStatus = payload.new.status;
        const newWinnerId = payload.new.winner_id;
        const oldStatus = payload.old?.status;
        const oldWinnerId = payload.old?.winner_id;
        
        setGameStatus(newStatus);
        
        // Reload game data when status changes
        if (newStatus !== oldStatus && userId) {
          if (newStatus === 'active') {
            setTimeout(() => {
              loadGameData(gameId, userId);
            }, 500);
          } else if (newStatus === 'completed') {
            // Game just completed - reload to get initial data
            loadGameData(gameId, userId);
          } else if (newStatus === 'waiting') {
            loadGameData(gameId, userId);
          }
        }
        
        // If winner_id was just set (UPDATE event), reload immediately
        if (newWinnerId && newWinnerId !== oldWinnerId && userId) {
          console.log('Winner determined! Reloading game data...');
          loadGameData(gameId, userId);
        }
      }
    });

    // Subscribe to game players changes while waiting
    const unsubPlayers = subscribeToGamePlayers(gameId, (payload) => {
      console.log('Game players updated in waiting room:', payload);
      if (userId) {
        loadGameData(gameId, userId);
      }
    });

    // Poll for game status updates while waiting (fallback)
    const pollInterval = setInterval(() => {
      if (gameStatus === 'waiting' && userId) {
        loadGameData(gameId, userId);
      }
    }, 2000);

    return () => {
      unsubGame();
      unsubPlayers();
      clearInterval(pollInterval);
    };
  }, [gameId, userId, gameStatus]);

  useEffect(() => {
    if (!gameId || !userId) return;

    // Subscribe to game player updates for both active and completed games
    // (completed games need updates when positions close and equity is updated)
    const unsubPlayers = subscribeToGamePlayers(gameId, (payload) => {
      console.log('Game players updated:', payload);
      loadGameData(gameId, userId);
    });

    // Only subscribe to positions/orders/equity for active games
    let unsubPositions: (() => void) | null = null;
    let unsubEquity: (() => void) | null = null;
    let ordersChannel: any = null;
    let pollInterval: NodeJS.Timeout | null = null;

    if (gameStatus === 'active') {
      unsubPositions = subscribeToPositions(gameId, userId, (payload) => {
        console.log('Positions updated:', payload);
        loadPositions(gameId, userId);
      });

      unsubEquity = subscribeToEquityHistory(gameId, (payload) => {
        console.log('Equity history updated:', payload);
        loadEquityHistory(gameId, userId);
        if (opponentId) {
          loadEquityHistory(gameId, opponentId, true);
        }
      });

      // Subscribe to orders changes
      ordersChannel = supabase
        .channel(`orders:${gameId}:${userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'orders',
            filter: `game_id=eq.${gameId} AND player_id=eq.${userId}`,
          },
          () => {
            loadOrders(gameId, userId);
            loadAllOrders(gameId, userId);
          }
        )
        .subscribe();

      // Add polling fallback to ensure UI stays updated (every 3 seconds)
      pollInterval = setInterval(() => {
        loadGameData(gameId, userId);
        loadPositions(gameId, userId);
        loadOrders(gameId, userId);
        loadAllOrders(gameId, userId);
        loadLatestPrices();
      }, 3000);
    }

    return () => {
      unsubPlayers();
      if (unsubPositions) unsubPositions();
      if (unsubEquity) unsubEquity();
      if (ordersChannel) supabase.removeChannel(ordersChannel);
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [gameId, userId, opponentId, gameStatus]);

  async function loadGameData(gId: string, uId: string) {
    const { game, players } = await gameAPI.getGame(gId);
    
    // Update game status and store game/players
    if (game) {
      setGameStatus(game.status);
      setCurrentGame(game);
      setGamePlayers(players || []);
      setWinnerId(game.winner_id || null);
      
      // Update balance/equity from players (for both active and completed games)
      if (players) {
        const me = players.find((p: any) => p.user_id === uId);
        const opponent = players.find((p: any) => p.user_id !== uId);
        if (me) {
          setMyBalance(Number(me.balance || 0));
          setMyEquity(Number(me.equity || me.balance || 0));
        }
        if (opponent) {
          setOpponentEquity(Number(opponent.equity || opponent.balance || 0));
          setOpponentId(opponent.user_id);
        }
      }
    }
    
    // Only load additional game data if game is active
    if (game?.status !== 'active') {
      return;
    }
    
    // Set game end time for timer
    if (game && game.started_at && game.duration_minutes) {
      const startTime = new Date(game.started_at);
      const endTime = new Date(startTime.getTime() + game.duration_minutes * 60000);
      console.log('Game timer debug:', {
        started_at: game.started_at,
        duration_minutes: game.duration_minutes,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        now: new Date().toISOString()
      });
      setGameEndTime(endTime);
    } else {
      console.log('Missing game timer data:', { game, started_at: game?.started_at, duration_minutes: game?.duration_minutes });
    }
    loadPositions(gId, uId);
    loadOrders(gId, uId);
    loadAllOrders(gId, uId);
    loadEquityHistory(gId, uId);
    if (players) {
      const opponent = players.find((p: any) => p.user_id !== uId);
      if (opponent) {
        loadEquityHistory(gId, opponent.user_id, true);
      }
    }
  }

  async function loadPositions(gId: string, uId: string) {
    const { positions: pos } = await positionAPI.getPositions(gId, uId);
    if (pos) {
      // Track PnL changes for animation
      const newPnlMap: Record<string, number> = {};
      pos.forEach((p: { id: string | number; unrealized_pnl: number; }) => {
        newPnlMap[p.id] = p.unrealized_pnl;
      });
      setPreviousPnl(newPnlMap);
      
      setPositions(pos);
      // Load TP/SL orders for all positions to display status
      for (const position of pos) {
        await loadTpSlOrdersForPosition(position.id);
      }
    }
  }

  async function loadOrders(gId: string, uId: string) {
    const { orders: ords } = await orderAPI.getOrders(gId, uId, 'pending');
    if (ords) setOrders(ords);
  }

  async function loadAllOrders(gId: string, uId: string) {
    const { orders: ords } = await orderAPI.getOrders(gId, uId, 'all');
    if (ords) setAllOrders(ords);
  }

  async function loadTpSlOrdersForPosition(positionId: string) {
    if (!userId) return;
    const { orders: tpSlOrders } = await orderAPI.getOrdersByPosition(positionId, userId);
    if (tpSlOrders) {
      setPositionTpSlOrders(prev => ({
        ...prev,
        [positionId]: tpSlOrders
      }));
    }
  }

  async function loadEquityHistory(gId: string, playerId: string, isOpponent: boolean = false) {
    const { history } = await equityAPI.getEquityHistory(gId, playerId);
    if (history) {
      if (isOpponent) {
        setOppEquityChartData(history);
      } else {
        setMyEquityChartData(history);
      }
    }
  }

  async function handlePlaceOrder() {
    if (!gameId || !userId) return;

    if (!amount) {
      toast.error('Please enter a quantity');
      return;
    }

    if (orderType === 'LIMIT' && !limitPrice) {
      toast.error('Please enter a limit price');
      return;
    }

    setPlacingOrder(true);

    try {
      // Place main order (MARKET or LIMIT)
      const result = await orderAPI.placeOrder({
        gameId,
        playerId: userId,
        symbol: symbol,
        orderType: orderType,
        side: orderSide.toUpperCase(),
        quantity: parseFloat(amount),
        price: orderType === 'LIMIT' ? parseFloat(limitPrice) : undefined,
      });

      if (!result.order) {
        toast.error('Failed to place order: ' + result.error);
        setPlacingOrder(false);
        return;
      }

      // Reset form
      setAmount('');
      setLimitPrice('');
      toast.success('Order placed!');
    } catch (error: any) {
      toast.error('Error placing order: ' + error.message);
    }

    setPlacingOrder(false);
  }

  async function handleCancelOrder(orderId: string) {
    if (!userId) return;

    setUpdatingTpSl(true);
    const result = await orderAPI.cancelOrder(orderId, userId);
    setUpdatingTpSl(false);

    if (result.order) {
      loadOrders(gameId!, userId);
      toast.success('Order cancelled');
    } else {
      toast.error('Failed to cancel order: ' + result.error);
    }
  }

  async function handleOpenTpSlModal(positionId: string) {
    setSelectedPositionForTpSl(positionId);
    setShowTpSlModal(true);
    await loadTpSlOrdersForPosition(positionId);
    // Reset form fields
    setNewTpTriggerPrice('');
    setNewTpQuantity('');
    setNewSlTriggerPrice('');
    setNewSlQuantity('');
    setEditingOrderId(null);
  }

  async function handleCloseTpSlModal() {
    setShowTpSlModal(false);
    setSelectedPositionForTpSl(null);
    setEditingOrderId(null);
    setEditingPositionId(null);
    setNewTpTriggerPrice('');
    setNewTpQuantity('');
    setNewSlTriggerPrice('');
    setNewSlQuantity('');
    setEditTriggerPrice('');
    setEditQuantity('');
  }

  async function handleCreateTpSl(type: 'TAKE_PROFIT' | 'STOP_LOSS') {
    if (!selectedPositionForTpSl || !gameId || !userId) return;
    
    const position = positions.find(p => p.id === selectedPositionForTpSl);
    if (!position) return;

    const triggerPrice = type === 'TAKE_PROFIT' ? newTpTriggerPrice : newSlTriggerPrice;
    const quantity = type === 'TAKE_PROFIT' ? newTpQuantity : newSlQuantity;

    if (!triggerPrice) {
      toast.error('Please enter a trigger price');
      return;
    }

    setUpdatingTpSl(true);
    try {
      const result = await orderAPI.placeOrder({
        gameId,
        playerId: userId,
        symbol: position.symbol,
        orderType: type,
        side: 'SELL',
        quantity: quantity ? parseFloat(quantity) : position.quantity,
        triggerPrice: parseFloat(triggerPrice),
        positionId: selectedPositionForTpSl,
      });

      if (result.order) {
        await loadTpSlOrdersForPosition(selectedPositionForTpSl);
        // Reset form
        if (type === 'TAKE_PROFIT') {
          setNewTpTriggerPrice('');
          setNewTpQuantity('');
        } else {
          setNewSlTriggerPrice('');
          setNewSlQuantity('');
        }
        toast.success(`${type === 'TAKE_PROFIT' ? 'Take Profit' : 'Stop Loss'} order created successfully`);
      } else {
        toast.error('Failed to create order: ' + result.error);
      }
    } catch (error: any) {
      toast.error('Error creating order: ' + error.message);
    }
    setUpdatingTpSl(false);
  }

  async function handleDeleteTpSl(orderId: string) {
    if (!userId) return;

    setUpdatingTpSl(true);
    const result = await orderAPI.cancelOrder(orderId, userId);
    setUpdatingTpSl(false);

    if (result.order && selectedPositionForTpSl) {
      await loadTpSlOrdersForPosition(selectedPositionForTpSl);
      toast.success('TP/SL order cancelled');
    } else {
      toast.error('Failed to cancel order: ' + result.error);
    }
  }

  async function handleEditTpSlOrder(orderId: string) {
    const orders = selectedPositionForTpSl ? positionTpSlOrders[selectedPositionForTpSl] || [] : [];
    const order = orders.find(o => o.id === orderId);
    if (order) {
      setEditingOrderId(orderId);
      setEditTriggerPrice(order.trigger_price?.toString() || '');
      setEditQuantity(order.quantity.toString());
    }
  }

  async function handleSaveTpSlEdit() {
    if (!editingOrderId || !userId) return;

    if (!editTriggerPrice) {
      toast.error('Please enter a trigger price');
      return;
    }

    setUpdatingTpSl(true);
    const updates = {
      triggerPrice: parseFloat(editTriggerPrice),
      quantity: editQuantity ? parseFloat(editQuantity) : undefined,
    };

    const result = await orderAPI.updateOrder(editingOrderId, userId, updates);
    setUpdatingTpSl(false);

    if (result.order) {
      if (selectedPositionForTpSl) {
        await loadTpSlOrdersForPosition(selectedPositionForTpSl);
      }
      setEditingOrderId(null);
      setEditTriggerPrice('');
      setEditQuantity('');
      toast.success('TP/SL order updated successfully');
    } else {
      toast.error('Failed to update order: ' + result.error);
    }
  }

  async function handleOpenCloseModal(positionId: string, type: 'MARKET' | 'LIMIT') {
    const position = positions.find(p => p.id === positionId);
    if (!position) return;

    setSelectedPositionForClose(positionId);
    setCloseOrderType(type);
    setCloseQuantity(position.quantity.toString());
    setCloseLimitPrice('');
    setShowCloseModal(true);
  }

  async function handleCloseModal() {
    setShowCloseModal(false);
    setSelectedPositionForClose(null);
    setCloseQuantity('');
    setCloseLimitPrice('');
  }

  async function handleClosePositionSubmit() {
    if (!selectedPositionForClose || !gameId || !userId) return;

    const position = positions.find(p => p.id === selectedPositionForClose);
    if (!position) return;

    if (!closeQuantity) {
      toast.error('Please enter a quantity');
      return;
    }

    if (closeOrderType === 'LIMIT' && !closeLimitPrice) {
      toast.error('Please enter a limit price');
      return;
    }

    if (parseFloat(closeQuantity) > parseFloat(position.quantity.toString())) {
      toast.error(`Quantity cannot exceed position size: ${position.quantity}`);
      return;
    }

    setClosingPosition(true);

    try {
      const result = await orderAPI.placeOrder({
        gameId,
        playerId: userId,
        symbol: position.symbol,
        orderType: closeOrderType,
        side: 'SELL',
        quantity: parseFloat(closeQuantity),
        price: closeOrderType === 'LIMIT' && closeLimitPrice ? parseFloat(closeLimitPrice) : undefined,
      });

      if (result.order) {
        toast.success('Close order placed!');
        handleCloseModal();
      } else {
        toast.error('Failed to place close order: ' + result.error);
      }
    } catch (error: any) {
      toast.error('Error placing close order: ' + error.message);
    }

    setClosingPosition(false);
  }

  // Show loading screen while waiting for winner to be determined
  if (gameStatus === 'completed' && currentGame && gamePlayers.length === 2 && !currentGame.winner_id && !winnerId) {
    return (
      <div className="h-screen bg-[#0a0b0d] flex items-center justify-center">
        <div className="bg-[#13141a] border border-[#1e1f25] rounded-lg p-8 max-w-md w-full text-center">
          <div className="mb-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-600/20 mb-4">
              <svg className="w-8 h-8 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Game Completed</h2>
          <p className="text-gray-400">Determining winner and finalizing results...</p>
        </div>
      </div>
    );
  }

  // Show end game screen only when winner_id is set
  if (gameStatus === 'completed' && currentGame && gamePlayers.length === 2) {
    const actualWinnerId = winnerId || currentGame.winner_id;
    
    // Don't show results until winner_id is confirmed
    if (!actualWinnerId) {
      return (
        <div className="h-screen bg-[#0a0b0d] flex items-center justify-center">
          <div className="bg-[#13141a] border border-[#1e1f25] rounded-lg p-8 max-w-md w-full text-center">
            <div className="mb-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-600/20 mb-4">
                <svg className="w-8 h-8 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Game Completed</h2>
            <p className="text-gray-400">Determining winner and finalizing results...</p>
          </div>
        </div>
      );
    }
    
    const winner = gamePlayers.find((p: any) => p.user_id === actualWinnerId);
    const loser = gamePlayers.find((p: any) => p.user_id !== actualWinnerId);
    const isWinner = userId === actualWinnerId;
    
    if (!winner || !loser) {
      return (
        <div className="h-screen bg-[#0a0b0d] flex items-center justify-center">
          <div className="bg-[#13141a] border border-[#1e1f25] rounded-lg p-8 max-w-md w-full text-center">
            <p className="text-red-400">Error loading game results. Please refresh the page.</p>
          </div>
        </div>
      );
    }
    
    return (
      <div className="h-screen bg-[#0a0b0d] flex items-center justify-center">
        <div className="bg-[#13141a] border border-[#1e1f25] rounded-lg p-8 max-w-3xl w-full">
          {/* Winner Announcement */}
          <div className="text-center mb-8">
            <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full mb-4 ${
              isWinner ? 'bg-green-600/20' : 'bg-red-600/20'
            }`}>
              {isWinner ? (
                <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </div>
            <h1 className="text-4xl font-bold text-white mb-2">
              {isWinner ? 'Victory!' : 'Defeat'}
            </h1>
            <p className="text-xl text-gray-400">
              {isWinner ? 'You won the trading battle!' : `${winner?.user_id === gamePlayers[0]?.user_id ? 'Player 1' : 'Player 2'} won the trading battle!`}
            </p>
          </div>

          {/* Final Results */}
          <div className="bg-[#0a0b0d] border border-[#1e1f25] rounded-lg p-6 mb-6">
            <h2 className="text-sm font-bold text-white uppercase tracking-widest mb-4">Final Results</h2>
            <div className="space-y-4">
              {/* Winner */}
              <div className="flex items-center justify-between p-4 bg-[#13141a] rounded-lg border border-green-600/30">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-yellow-400 rounded-full flex items-center justify-center">
                    <span className="text-xl">👑</span>
                  </div>
                  <div>
                    <div className="text-sm text-gray-400">Winner</div>
                    <div className="text-white font-semibold">
                      {winner?.user_id === userId ? 'You' : 'Opponent'}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-400">Final Equity</div>
                  <div className="text-2xl font-mono font-bold text-green-400">
                    ${winner?.equity?.toFixed(2) || '0.00'}
                  </div>
                </div>
              </div>

              {/* Loser */}
              <div className="flex items-center justify-between p-4 bg-[#13141a] rounded-lg border border-[#1e1f25]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#1e1f25] rounded-full flex items-center justify-center">
                    <span className="text-gray-500">#2</span>
                  </div>
                  <div>
                    <div className="text-sm text-gray-400">Runner-up</div>
                    <div className="text-white font-semibold">
                      {loser?.user_id === userId ? 'You' : 'Opponent'}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-400">Final Equity</div>
                  <div className="text-2xl font-mono font-bold text-gray-300">
                    ${loser?.equity?.toFixed(2) || '0.00'}
                  </div>
                </div>
              </div>
            </div>

            {/* Profit/Loss Summary */}
            <div className="mt-6 pt-6 border-t border-[#1e1f25]">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="text-sm text-gray-400 mb-1">Your P&L</div>
                  <div className={`text-xl font-mono font-bold ${
                    (userId === winner?.user_id ? winner?.equity : loser?.equity) >= 10000 
                      ? 'text-green-400' 
                      : 'text-red-400'
                  }`}>
                    {((userId === winner?.user_id ? winner?.equity : loser?.equity) >= 10000 ? '+' : '')}
                    ${(((userId === winner?.user_id ? winner?.equity : loser?.equity) || 10000) - 10000).toFixed(2)}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-gray-400 mb-1">Difference</div>
                  <div className="text-xl font-mono font-bold text-blue-400">
                    ${Math.abs((winner?.equity || 0) - (loser?.equity || 0)).toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={() => router.push('/home')}
              className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show waiting room if game status is 'waiting' or null (still loading)
  if (gameStatus === 'waiting' || (gameStatus === null && gameId)) {
    const isPlayer1 = currentGame && userId === currentGame.player1_id;
    const isPlayer2 = currentGame && userId === currentGame.player2_id;
    
    return (
      <div className="h-screen bg-[#0a0b0d] flex items-center justify-center">
        <div className="bg-[#13141a] border border-[#1e1f25] rounded-lg p-8 max-w-2xl w-full">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600/20 rounded-full mb-4">
              <svg className="w-8 h-8 text-blue-400 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Waiting Room</h2>
            <p className="text-gray-400">
              {gameStatus === null 
                ? 'Loading game...' 
                : gamePlayers.length === 2 
                  ? isPlayer1
                    ? 'Both players ready! Click "Start Game" to begin.'
                    : 'Both players ready! Waiting for game creator to start...'
                  : isPlayer1
                    ? 'Waiting for opponent to join...'
                    : 'Waiting for opponent to join...'}
            </p>
          </div>

            <div className="space-y-4 mb-6">
            <div className="bg-[#0a0b0d] border border-[#1e1f25] rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-400">Game ID</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono text-white bg-[#1e1f25] px-3 py-1 rounded">{gameId}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(gameId || '');
                      toast.success('Game ID copied to clipboard!');
                    }}
                    className="px-2 py-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded text-xs transition-colors"
                    title="Copy Game ID"
                  >
                    Copy
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-400">Status</span>
                <span className="text-sm font-medium text-yellow-400 bg-yellow-900/20 px-3 py-1 rounded">Waiting</span>
              </div>
              {currentGame && currentGame.duration_minutes && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-400">Duration</span>
                  <span className="text-sm font-medium text-white bg-[#1e1f25] px-3 py-1 rounded">
                    {currentGame.duration_minutes} {currentGame.duration_minutes === 1 ? 'minute' : 'minutes'}
                  </span>
                </div>
              )}
            </div>

            <div className="bg-[#0a0b0d] border border-[#1e1f25] rounded-lg p-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3">Players</h3>
              <div className="space-y-2">
                        {gamePlayers.map((player: any, index: number) => {
                  const isCurrentUser = player.user_id === userId;
                  const isP1 = currentGame && player.user_id === currentGame.player1_id;
                  return (
                    <div 
                      key={player.id || index}
                      className={`flex items-center justify-between p-3 rounded ${
                        isCurrentUser ? 'bg-blue-600/10 border border-blue-600/30' : 'bg-[#1e1f25]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                          isCurrentUser ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'
                        }`}>
                          {isP1 ? '1' : '2'}
                        </div>
                        <div>
                          <div className="text-white font-medium">
                            {isCurrentUser ? 'You' : (isP1 ? 'Player 1' : 'Player 2')}
                          </div>
                          <div className="text-xs text-gray-400 font-mono">
                            {player.user_id.slice(0, 8)}...
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isP1 && (
                          <span className="text-xs px-2 py-1 bg-purple-600/20 text-purple-400 rounded" title="Game Creator">Creator</span>
                        )}
                        {isCurrentUser && (
                          <span className="text-xs px-2 py-1 bg-blue-600/20 text-blue-400 rounded">You</span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {gamePlayers.length < 2 && (
                  <div className="flex items-center justify-between p-3 rounded bg-[#1e1f25] opacity-50">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm bg-gray-700 text-gray-500">
                        2
                      </div>
                      <div>
                        <div className="text-gray-500 font-medium">Waiting for opponent...</div>
                        <div className="text-xs text-gray-600">Share Game ID to invite</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => router.push('/home')}
              className="flex-1 px-4 py-2 bg-[#1e1f25] hover:bg-[#25262d] text-white rounded font-medium transition-colors"
            >
              Back to Home
            </button>
            {gamePlayers.length === 2 && currentGame && isPlayer1 ? (
              <button
                onClick={async () => {
                  if (!gameId || !userId) return;
                  setStartingGame(true);
                  try {
                    const result = await gameAPI.startGame(gameId, userId);
                    if (result.game) {
                      toast.success('Game starting!');
                      // Reload game data to transition to active game
                      setTimeout(() => {
                        loadGameData(gameId, userId);
                      }, 500);
                    } else {
                      toast.error('Failed to start game: ' + result.error);
                      setStartingGame(false);
                    }
                  } catch (error: any) {
                    toast.error('Error starting game: ' + error.message);
                    setStartingGame(false);
                  }
                }}
                disabled={startingGame}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {startingGame ? 'Starting...' : 'Start Game'}
              </button>
            ) : (
              <button
                onClick={() => {
                  if (gameId && userId) {
                    loadGameData(gameId, userId);
                  }
                }}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition-colors"
              >
                Refresh
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }


  if (!marketData) return <div className="h-screen bg-[#0a0b0d] flex items-center justify-center">
    <div className="text-gray-400">Loading game...</div>
  </div>;

  return (
    <div className="h-screen bg-[#0a0b0d] flex flex-col overflow-hidden">
      {/* Top Navigation Bar */}
      <div className="bg-[#13141a] border-b border-[#1e1f25] px-6 py-3 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-6">
          <button onClick={() => router.push('/home')} className="hover:opacity-80 transition-opacity">
            <Image src="/alpha_royal_logo.png" alt="Alpha Royale" width={60} height={60} className="rounded" />
          </button>
          <div className="h-6 w-px bg-[#1e1f25]"></div>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Balance:</span>
              <span className="text-white font-mono font-semibold">${myBalance.toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Equity:</span>
              <span className="text-white font-mono font-semibold">${myEquity.toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Opponent Equity:</span>
              <span className="text-gray-300 font-mono">${opponentEquity.toFixed(2)}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Game Timer */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#1e1f25] rounded">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {timeRemaining !== null ? (
              <span className={`text-sm font-mono font-semibold ${
                timeRemaining < 300 ? 'text-red-400' : timeRemaining < 600 ? 'text-yellow-400' : 'text-gray-300'
              }`}>
                {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}
              </span>
            ) : (
              <span className="text-sm font-mono font-semibold text-gray-500">--:--</span>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Ticker List */}
        <div className="w-48 bg-[#13141a] border-r border-[#1e1f25] flex flex-col shrink-0">
          <div className="px-4 py-3 border-b border-[#1e1f25]">
            <h3 className="text-sm font-bold text-white uppercase tracking-widest">Markets</h3>
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="py-2">
              {COMPATIBLETICKERS.map((t) => (
                <button 
                  key={t} 
                  onClick={() => setSelectedChartTicker(t)} 
                  className={`w-full px-4 py-2.5 flex justify-between items-center hover:bg-[#1e1f25] transition-colors ${
                    selectedChartTicker === t ? 'bg-[#1e1f25]' : ''
                  }`}
                >
                  <span className="text-white font-medium text-sm">{t}-USD</span>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-300 font-mono text-sm">${latestPrices[t]?.toFixed(2) || '-.--'}</span>
                    {priceChanges[t] !== undefined && priceChanges[t] !== 0 && (
                      <span className={`text-xs font-mono ${priceChanges[t] > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {priceChanges[t] > 0 ? '↑' : '↓'} {Math.abs(priceChanges[t]).toFixed(2)}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Center - Chart Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="bg-[#13141a] border-b border-[#1e1f25] px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <select
                value={selectedChartTicker}
                onChange={(e) => setSelectedChartTicker(e.target.value as CompatibleTickers)}
                className="bg-[#1e1f25] text-white px-3 py-1.5 rounded border border-[#25262d] hover:bg-[#25262d] focus:border-blue-500 focus:outline-none font-semibold text-sm transition-colors cursor-pointer"
              >
                {COMPATIBLETICKERS.map((ticker) => (
                  <option key={ticker} value={ticker}>{ticker}-USD</option>
                ))}
              </select>
              <span className="text-gray-500 text-sm">${latestPrices[selectedChartTicker]?.toFixed(2) || '-.--'}</span>
            </div>
            <div className="flex items-center gap-1 bg-[#1e1f25] p-1 rounded">
              <button
                onClick={() => setChartType('line')}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  chartType === 'line' ? 'bg-blue-500 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                Line
              </button>
              <button
                onClick={() => setChartType('candle')}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  chartType === 'candle' ? 'bg-blue-500 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                Candle
              </button>
            </div>
          </div>
          <div className="flex-1 bg-[#0a0b0d] p-4">
            {chartType === 'line' ? (
              <PriceChart data1={marketData[selectedChartTicker]?.price ?? []}/>
            ) : (
              <CandlestickChart data={marketData[selectedChartTicker]?.price ?? []}/>
            )}
          </div>

          {/* Equity Comparison Chart */}
          <div className="bg-[#13141a] border-t border-[#1e1f25]">
            <div className="px-4 py-2 border-b border-[#1e1f25] flex justify-between items-center">
              <h3 className="text-sm font-bold text-white uppercase tracking-widest">Equity Comparison</h3>
              <button 
                onClick={() => setShowOppEquityCurve(!showOppEquityCurve)}
                className="text-xs px-2 py-1 bg-[#1e1f25] hover:bg-[#25262d] text-gray-300 rounded transition-colors"
              >
                {showOppEquityCurve ? 'Hide Opponent' : 'Show Opponent'}
              </button>
            </div>
            <div className="h-32 p-4 bg-[#0a0b0d]">
              <PriceChart data1={myEquityChartData} data2={oppEquityChartData} showData2={showOppEquityCurve}/>
            </div>
          </div>



          {/* Tabs Section: Orders, Positions, History */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Tab Bar */}
            <div className="flex border-b border-[#1e1f25] bg-[#13141a]">
              <button
                onClick={() => setActiveTab('orders')}
                className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                  activeTab === 'orders'
                    ? 'text-white border-b-2 border-blue-500'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                Orders
              </button>
              <button
                onClick={() => setActiveTab('positions')}
                className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                  activeTab === 'positions'
                    ? 'text-white border-b-2 border-blue-500'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                Positions
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                  activeTab === 'history'
                    ? 'text-white border-b-2 border-blue-500'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                History
              </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto bg-[#0a0b0d]">{/* Orders Tab */}
                {activeTab === 'orders' && (
                  <div className="p-4">
                    {orders.length === 0 ? (
                      <div className="text-sm text-gray-500 text-center py-12">No open orders</div>
                    ) : (
                      <div className="space-y-2">
                        {orders.map((order) => (
                          <div key={order.id} className="bg-[#13141a] border border-[#1e1f25] rounded p-3 hover:border-[#25262d] transition-colors">
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-white font-medium">{order.symbol}</span>
                                <span className={`text-xs px-1.5 py-0.5 rounded ${
                                  order.side === 'BUY' ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
                                }`}>
                                  {order.side}
                                </span>
                                <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-900/30 text-yellow-400">
                                  {order.order_type}
                                </span>
                              </div>
                              <button
                                onClick={() => handleCancelOrder(order.id)}
                                className="px-2 py-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-xs rounded transition-colors"
                                disabled={updatingTpSl}
                              >
                                Cancel
                              </button>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <span className="text-gray-500">Qty:</span>
                                <span className="text-gray-300 ml-1 font-mono">{order.quantity}</span>
                              </div>
                              <div>
                                <span className="text-gray-500">Price:</span>
                                <span className="text-gray-300 ml-1 font-mono">
                                  {order.price ? `$${order.price}` : order.trigger_price ? `$${order.trigger_price}` : 'Market'}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Positions Tab */}
                {activeTab === 'positions' && (
                  <div className="p-4">
                    {positions.length === 0 ? (
                      <div className="text-sm text-gray-500 text-center py-12">No open positions</div>
                    ) : (
                      <div className="space-y-2">
                        {positions.map((pos) => {
                          const positionValue = Number(pos.quantity) * Number(pos.current_price || pos.entry_price);
                          const roePercent = pos.entry_price ? ((Number(pos.unrealized_pnl) / (Number(pos.quantity) * Number(pos.entry_price))) * 100).toFixed(2) : '0.00';
                          const isProfitable = pos.unrealized_pnl >= 0;
                          return (
                            <div key={pos.id} className="bg-[#13141a] border border-[#1e1f25] rounded p-3 hover:border-[#25262d] transition-colors">
                              <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-white font-medium">{pos.symbol}</span>
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-blue-900/30 text-blue-400">
                                    {pos.side}
                                  </span>
                                </div>
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => handleOpenTpSlModal(pos.id)}
                                    className="px-2 py-1 bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-400 text-xs rounded transition-colors"
                                  >
                                    TP/SL
                                  </button>
                                  <button
                                    onClick={() => handleOpenCloseModal(pos.id, 'MARKET')}
                                    className="px-2 py-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-xs rounded transition-colors"
                                  >
                                    Close
                                  </button>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                                <div>
                                  <span className="text-gray-500">Qty:</span>
                                  <span className="text-gray-300 ml-1 font-mono">{pos.quantity}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Entry:</span>
                                  <span className="text-gray-300 ml-1 font-mono">${pos.entry_price}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Mark:</span>
                                  <span className="text-gray-300 ml-1 font-mono">${pos.current_price || pos.entry_price}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Value:</span>
                                  <span className="text-gray-300 ml-1 font-mono">${positionValue.toFixed(2)}</span>
                                </div>
                              </div>
                              <div className={`text-sm font-mono transition-all duration-300 ${
                                isProfitable ? 'text-green-400' : 'text-red-400'
                              } ${
                                previousPnl[pos.id] !== undefined && previousPnl[pos.id] !== pos.unrealized_pnl
                                  ? pos.unrealized_pnl > previousPnl[pos.id] 
                                    ? 'animate-pulse-green' 
                                    : 'animate-pulse-red'
                                  : ''
                              }`}>
                                {isProfitable ? '+' : ''}${pos.unrealized_pnl?.toFixed(2) || '0.00'} ({isProfitable ? '+' : ''}{roePercent}%)
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* History Tab */}
                {activeTab === 'history' && (
                  <div className="p-4">
                    {allOrders.length === 0 ? (
                      <div className="text-sm text-gray-500 text-center py-12">No order history</div>
                    ) : (
                      <div className="space-y-2">
                        {allOrders.slice().reverse().map((order) => (
                          <div key={order.id} className="bg-[#13141a] border border-[#1e1f25] rounded p-3">
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-white font-medium">{order.symbol}</span>
                                <span className={`text-xs px-1.5 py-0.5 rounded ${
                                  order.side === 'BUY' ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
                                }`}>
                                  {order.side}
                                </span>
                                <span className={`text-xs px-1.5 py-0.5 rounded ${
                                  order.status === 'filled' ? 'bg-green-900/30 text-green-400' :
                                  order.status === 'cancelled' ? 'bg-gray-700/30 text-gray-400' :
                                  order.status === 'rejected' ? 'bg-red-900/30 text-red-400' :
                                  'bg-yellow-900/30 text-yellow-400'
                                }`}>
                                  {order.status.toUpperCase()}
                                </span>
                              </div>
                              <span className="text-xs text-gray-500">
                                {order.created_at ? new Date(order.created_at).toLocaleTimeString() : ''}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <span className="text-gray-500">Qty:</span>
                                <span className="text-gray-300 ml-1 font-mono">{order.quantity}</span>
                              </div>
                              <div>
                                <span className="text-gray-500">Price:</span>
                                <span className="text-gray-300 ml-1 font-mono">
                                  {order.filled_price ? `$${order.filled_price}` : order.price ? `$${order.price}` : 'Market'}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

        {/* Right Sidebar - Order Entry & Bottom Tabs */}
        <div className="w-96 bg-[#13141a] border-l border-[#1e1f25] flex flex-col shrink-0">
          {/* Order Entry Section */}
          <div className="border-b border-[#1e1f25] p-4">
            <h3 className="text-base font-bold text-white uppercase tracking-widest mb-4">Place Order</h3>
            
            {/* Market/Limit Tabs */}
            <div className="flex border-b border-[#1e1f25] mb-4">
              <button
                onClick={() => setOrderType('MARKET')}
                className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                  orderType === 'MARKET'
                    ? 'text-white border-b-2 border-blue-500'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                Market
              </button>
              <button
                onClick={() => setOrderType('LIMIT')}
                className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                  orderType === 'LIMIT'
                    ? 'text-white border-b-2 border-blue-500'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                Limit
              </button>
            </div>
            
            {/* Symbol Selection */}
            <div className="mb-3">
              <label className="block text-xs text-gray-500 mb-1.5">Symbol</label>
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="w-full px-3 py-2 bg-[#0a0b0d] border border-[#1e1f25] text-white rounded text-sm focus:border-blue-500 focus:outline-none"
              >
                {COMPATIBLETICKERS.map((ticker) => (
                  <option key={ticker} value={ticker}>{ticker}</option>
                ))}
              </select>
            </div>

            {/* Limit Price (only for LIMIT orders) */}
            {orderType === 'LIMIT' && (
              <div className="mb-3">
                <label className="block text-xs text-gray-500 mb-1.5">Limit Price</label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0a0b0d] border border-[#1e1f25] text-white rounded text-sm focus:border-blue-500 focus:outline-none font-mono"
                />
              </div>
            )}

            {/* Quantity */}
            <div className="mb-4">
              <label className="block text-xs text-gray-500 mb-1.5">Quantity</label>
              <input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2 bg-[#0a0b0d] border border-[#1e1f25] text-white rounded text-sm focus:border-blue-500 focus:outline-none font-mono"
              />
            </div>

            {/* Buy/Sell Buttons */}
            <div className="flex gap-2 mb-3">
              <button 
                onClick={() => setOrderSide('buy')}
                className={`flex-1 py-2.5 rounded text-sm font-medium transition-colors ${
                  orderSide === 'buy' 
                    ? 'bg-green-600 hover:bg-green-700 text-white' 
                    : 'bg-[#1e1f25] hover:bg-[#25262d] text-gray-400'
                }`}
              >
                Buy
              </button>
              <button 
                onClick={() => setOrderSide('sell')}
                className={`flex-1 py-2.5 rounded text-sm font-medium transition-colors ${
                  orderSide === 'sell' 
                    ? 'bg-red-600 hover:bg-red-700 text-white' 
                    : 'bg-[#1e1f25] hover:bg-[#25262d] text-gray-400'
                }`}
              >
                Sell
              </button>
            </div>

            {/* Submit Order Button */}
            <button 
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handlePlaceOrder}
              disabled={placingOrder || !amount}
            >
              {placingOrder ? 'Placing...' : 'Place Order'}
            </button>
          </div>
        </div>
      </div>

      {/* TP/SL Modal */}
      {showTpSlModal && selectedPositionForTpSl && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={handleCloseTpSlModal}
        >
          <div 
            className="bg-gray-800 border border-gray-700 rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              {(() => {
                const position = positions.find(p => p.id === selectedPositionForTpSl);
                return <h2 className="text-xl font-bold text-white">Manage TP/SL for {position?.symbol}</h2>;
              })()}
              <button
                onClick={handleCloseTpSlModal}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>

            {/* Existing TP/SL Orders */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white mb-3">Existing TP/SL Orders</h3>
              {selectedPositionForTpSl && positionTpSlOrders[selectedPositionForTpSl] && positionTpSlOrders[selectedPositionForTpSl].length > 0 ? (
                <div className="space-y-2">
                  {positionTpSlOrders[selectedPositionForTpSl].map((order: Order) => (
                    <div key={order.id} className="p-3 bg-gray-900 rounded border border-gray-700">
                      {editingOrderId === order.id ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-white font-medium">{order.order_type}</span>
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              order.status === 'pending' ? 'bg-yellow-900 text-yellow-300' : 'bg-green-900 text-green-300'
                            }`}>
                              {order.status.toUpperCase()}
                            </span>
                          </div>
                          <input
                            type="number"
                            placeholder="Trigger Price"
                            value={editTriggerPrice}
                            onChange={(e) => setEditTriggerPrice(e.target.value)}
                            className="w-full p-2 bg-gray-800 border border-gray-700 text-white rounded"
                          />
                          <input
                            type="number"
                            placeholder="Quantity (optional)"
                            value={editQuantity}
                            onChange={(e) => setEditQuantity(e.target.value)}
                            className="w-full p-2 bg-gray-800 border border-gray-700 text-white rounded"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={handleSaveTpSlEdit}
                              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
                              disabled={updatingTpSl}
                            >
                              Save
                            </button>
                            <button
                              onClick={() => {
                                setEditingOrderId(null);
                                setEditTriggerPrice('');
                                setEditQuantity('');
                              }}
                              className="px-3 py-1 bg-[#1e1f25] hover:bg-[#25262d] text-white text-sm rounded transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-between items-center">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-white font-medium">{order.order_type}</span>
                              <span className={`px-2 py-0.5 rounded text-xs ${
                                order.status === 'pending' ? 'bg-yellow-900 text-yellow-300' : 'bg-green-900 text-green-300'
                              }`}>
                                {order.status.toUpperCase()}
                              </span>
                            </div>
                            <div className="text-gray-400 text-sm mt-1">
                              Trigger: ${order.trigger_price}, Qty: {order.quantity}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {order.status === 'pending' && (
                              <>
                                <button
                                  onClick={() => handleEditTpSlOrder(order.id)}
                                  className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteTpSl(order.id)}
                                  className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors"
                                  disabled={updatingTpSl}
                                >
                                  Cancel
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500">No TP/SL orders</div>
              )}
            </div>

            {/* Create New TP */}
            <div className="mb-6 p-4 bg-gray-900 rounded border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-3">Create Take Profit</h3>
              <div className="space-y-2">
                <input
                  type="number"
                  placeholder="Trigger Price"
                  value={newTpTriggerPrice}
                  onChange={(e) => setNewTpTriggerPrice(e.target.value)}
                  className="w-full p-2 bg-gray-800 border border-gray-700 text-white rounded"
                />
                <input
                  type="number"
                  placeholder="Quantity (optional, defaults to full position)"
                  value={newTpQuantity}
                  onChange={(e) => setNewTpQuantity(e.target.value)}
                  className="w-full p-2 bg-gray-800 border border-gray-700 text-white rounded"
                />
                <button
                  onClick={() => handleCreateTpSl('TAKE_PROFIT')}
                  className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded transition-colors disabled:opacity-50"
                  disabled={updatingTpSl || !newTpTriggerPrice}
                >
                  Create Take Profit
                </button>
              </div>
            </div>

            {/* Create New SL */}
            <div className="mb-4 p-4 bg-gray-900 rounded border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-3">Create Stop Loss</h3>
              <div className="space-y-2">
                <input
                  type="number"
                  placeholder="Trigger Price"
                  value={newSlTriggerPrice}
                  onChange={(e) => setNewSlTriggerPrice(e.target.value)}
                  className="w-full p-2 bg-gray-800 border border-gray-700 text-white rounded"
                />
                <input
                  type="number"
                  placeholder="Quantity (optional, defaults to full position)"
                  value={newSlQuantity}
                  onChange={(e) => setNewSlQuantity(e.target.value)}
                  className="w-full p-2 bg-gray-800 border border-gray-700 text-white rounded"
                />
                <button
                  onClick={() => handleCreateTpSl('STOP_LOSS')}
                  className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors disabled:opacity-50"
                  disabled={updatingTpSl || !newSlTriggerPrice}
                >
                  Create Stop Loss
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleCloseTpSlModal}
                className="px-4 py-2 bg-[#1e1f25] hover:bg-[#25262d] text-white rounded transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close Position Modal */}
      {showCloseModal && selectedPositionForClose && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={handleCloseModal}
        >
          <div 
            className="bg-gray-800 border border-gray-700 rounded-lg p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              {(() => {
                const position = positions.find(p => p.id === selectedPositionForClose);
                return <h2 className="text-xl font-bold text-white">{closeOrderType} Close - {position?.symbol}</h2>;
              })()}
              <button
                onClick={handleCloseModal}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              {(() => {
                const position = positions.find(p => p.id === selectedPositionForClose);
                if (!position) return null;
                
                if (!position) return null;
                
                return (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Quantity (Max: {position.quantity})
                      </label>
                      <input
                        type="number"
                        placeholder="Enter quantity"
                        value={closeQuantity}
                        onChange={(e) => setCloseQuantity(e.target.value)}
                        max={position.quantity}
                        min="0"
                        step="0.01"
                        className="w-full p-2 bg-gray-900 border border-gray-700 text-white rounded"
                      />
                    </div>

                    {closeOrderType === 'LIMIT' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Limit Price
                        </label>
                        <input
                          type="number"
                          placeholder="Enter limit price"
                          value={closeLimitPrice}
                          onChange={(e) => setCloseLimitPrice(e.target.value)}
                          min="0"
                          step="0.01"
                          className="w-full p-2 bg-gray-900 border border-gray-700 text-white rounded"
                        />
                      </div>
                    )}

                    <div className="flex gap-2 pt-4">
                      <button
                        onClick={handleClosePositionSubmit}
                        className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors disabled:opacity-50"
                        disabled={closingPosition || !closeQuantity || (closeOrderType === 'LIMIT' && !closeLimitPrice)}
                      >
                        {closingPosition ? 'Placing...' : 'Place Close Order'}
                      </button>
                      <button
                        onClick={handleCloseModal}
                        className="px-4 py-2 bg-[#1e1f25] hover:bg-[#25262d] text-white rounded transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function GamePage() {
  return (
    <Suspense fallback={<div className="h-screen bg-gray-900 p-6 text-white">Loading...</div>}>
      <GamePageContent />
    </Suspense>
  );
}
