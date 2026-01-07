'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '../auth/supabaseClient/supabaseClient';
import { orderAPI, positionAPI, gameAPI, priceAPI, equityAPI } from '../lib/api';
import { subscribeToGamePlayers, subscribeToPositions, subscribeToPrices, subscribeToEquityHistory } from '../lib/subscriptions';
import { PriceChart } from './charts/PriceChart';

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

const COMPATIBLETICKERS = ["ETH", "BTC", "AAPL"] as const;
type CompatibleTickers = (typeof COMPATIBLETICKERS)[number];

function GamePageContent() {
  const searchParams = useSearchParams();
  const gameId = searchParams.get('id');

  const [symbol, setSymbol] = useState('BTC');
  const [amount, setAmount] = useState('');
  const [orderSide, setOrderSide] = useState('buy');
  const [userId, setUserId] = useState<string | null>(null);
  const [myBalance, setMyBalance] = useState(10000);
  const [opponentBalance, setOpponentBalance] = useState(10000);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);
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
      setLatestPrices(prices);
    }
  }
  
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

  useEffect(() => {
    if (!gameId || !userId) return;

    const unsubPlayers = subscribeToGamePlayers(gameId, (payload) => {
      console.log('Game players updated:', payload);
      loadGameData(gameId, userId);
    });

    const unsubPositions = subscribeToPositions(gameId, userId, (payload) => {
      console.log('Positions updated:', payload);
      loadPositions(gameId, userId);
    });

    const unsubEquity = subscribeToEquityHistory(gameId, (payload) => {
      console.log('Equity history updated:', payload);
      loadEquityHistory(gameId, userId);
      if (opponentId) {
        loadEquityHistory(gameId, opponentId, true);
      }
    });

    // Subscribe to orders changes
    const ordersChannel = supabase
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
    const pollInterval = setInterval(() => {
      loadGameData(gameId, userId);
      loadPositions(gameId, userId);
      loadOrders(gameId, userId);
      loadAllOrders(gameId, userId);
      loadLatestPrices();
    }, 3000);

    return () => {
      unsubPlayers();
      unsubPositions();
      unsubEquity();
      supabase.removeChannel(ordersChannel);
      clearInterval(pollInterval);
    };
  }, [gameId, userId, opponentId]);

  async function loadGameData(gId: string, uId: string) {
    const { game, players } = await gameAPI.getGame(gId);
    if (players) {
      const me = players.find((p: any) => p.user_id === uId);
      const opponent = players.find((p: any) => p.user_id !== uId);
      if (me) setMyBalance(me.equity);
      if (opponent) {
        setOpponentBalance(opponent.equity);
        setOpponentId(opponent.user_id);
      }
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
      alert('Please enter a quantity');
      return;
    }

    if (orderType === 'LIMIT' && !limitPrice) {
      alert('Please enter a limit price');
      return;
    }

    setLoading(true);

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
        alert('Failed to place order: ' + result.error);
        setLoading(false);
        return;
      }

      // Reset form
      setAmount('');
      setLimitPrice('');
      alert('Order placed! Click "Process Orders" to execute it.');
    } catch (error: any) {
      alert('Error placing order: ' + error.message);
    }

    setLoading(false);
  }

  async function handleCancelOrder(orderId: string) {
    if (!userId) return;
    
    if (!confirm('Are you sure you want to cancel this order?')) {
      return;
    }

    setLoading(true);
    const result = await orderAPI.cancelOrder(orderId, userId);
    setLoading(false);

    if (result.order) {
      loadOrders(gameId!, userId);
    } else {
      alert('Failed to cancel order: ' + result.error);
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
      alert('Please enter a trigger price');
      return;
    }

    setLoading(true);
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
        alert(`${type === 'TAKE_PROFIT' ? 'Take Profit' : 'Stop Loss'} order created successfully`);
      } else {
        alert('Failed to create order: ' + result.error);
      }
    } catch (error: any) {
      alert('Error creating order: ' + error.message);
    }
    setLoading(false);
  }

  async function handleDeleteTpSl(orderId: string) {
    if (!userId) return;
    
    if (!confirm('Are you sure you want to cancel this TP/SL order?')) {
      return;
    }

    setLoading(true);
    const result = await orderAPI.cancelOrder(orderId, userId);
    setLoading(false);

    if (result.order && selectedPositionForTpSl) {
      await loadTpSlOrdersForPosition(selectedPositionForTpSl);
      alert('TP/SL order cancelled');
    } else {
      alert('Failed to cancel order: ' + result.error);
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
      alert('Please enter a trigger price');
      return;
    }

    setLoading(true);
    const updates = {
      triggerPrice: parseFloat(editTriggerPrice),
      quantity: editQuantity ? parseFloat(editQuantity) : undefined,
    };

    const result = await orderAPI.updateOrder(editingOrderId, userId, updates);
    setLoading(false);

    if (result.order) {
      if (selectedPositionForTpSl) {
        await loadTpSlOrdersForPosition(selectedPositionForTpSl);
      }
      setEditingOrderId(null);
      setEditTriggerPrice('');
      setEditQuantity('');
      alert('TP/SL order updated successfully');
    } else {
      alert('Failed to update order: ' + result.error);
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
      alert('Please enter a quantity');
      return;
    }

    if (closeOrderType === 'LIMIT' && !closeLimitPrice) {
      alert('Please enter a limit price');
      return;
    }

    if (parseFloat(closeQuantity) > parseFloat(position.quantity.toString())) {
      alert(`Quantity cannot exceed position size: ${position.quantity}`);
      return;
    }

    setLoading(true);

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
        alert('Close order placed! Click "Process Orders" to execute it.');
        handleCloseModal();
      } else {
        alert('Failed to place close order: ' + result.error);
      }
    } catch (error: any) {
      alert('Error placing close order: ' + error.message);
    }

    setLoading(false);
  }

  async function handleProcessOrders() {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:8787/trigger');
      const result = await response.json();
      if (result.success) {
        alert('Orders processed! Check your positions.');
      } else {
        alert('Failed to process orders');
      }
    } catch (error) {
      alert('Error processing orders: ' + error);
    }
    setLoading(false);
  }


  if (!marketData) return <div>Loading...</div>;

  return (
    <div className="h-screen bg-gray-900 p-6">
      <div className="max-w-8xl mx-auto">
        <div className="flex justify-between items-center mb-6 text-white">
          <h1 className="text-2xl font-bold">Alpha Royale - {gameId || 'Loading...'}</h1>
          <div className="flex gap-4">
            <div>Your Balance: ${myBalance.toFixed(2)}</div>
            <div>Opponent Balance: ${opponentBalance.toFixed(2)}</div>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-6">
          <div className="border border-gray-700 bg-gray-800 p-4 mb-4">
            <h3 className="font-bold mb-1 text-white">Current Prices</h3>
            <h1 className="text-xs mb-3 text-white">Click on the ticker to view historical data in the chart</h1>
            <div className="space-y-2 text-sm text-gray-300">
              {COMPATIBLETICKERS.map((t) => (
                <button key={t} onClick={() => setSelectedChartTicker(t)} className="w-full">
                  <div className="flex justify-between w-full">
                    <span>{t}</span>
                    <span>${latestPrices[t]?.toFixed(2) || '-.--'}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="col-span-4">
            <div className="border border-gray-700 bg-gray-800 p-4 mb-4">
              <h2 className="font-bold mb-2 text-white">Market Chart | {selectedChartTicker}</h2>
              <div className="h-90 bg-gray-900 flex items-center justify-center">
                <PriceChart data1={marketData[selectedChartTicker]?.price ?? []}/>
              </div>
            </div>

            <div className="border border-gray-700 bg-gray-800 p-4 mb-4">
              <div className="flex justify-between">
                <h2 className="font-bold mb-2 text-white">Equity Comparison</h2>
                <button className="text-sm mb-2" onClick={() => setShowOppEquityCurve(!showOppEquityCurve)}>{showOppEquityCurve ? 'Hide Opponent' : 'Show Opponent'}</button>
              </div>
              <div className="h-32 bg-gray-900 flex items-center justify-center">
                <PriceChart data1={myEquityChartData} data2={oppEquityChartData} showData2={showOppEquityCurve}/>
              </div>
            </div>

            {/* Tabs Section: Orders, Positions, History */}
            <div className="border border-gray-700 bg-gray-800">
              {/* Tab Bar */}
              <div className="flex border-b border-gray-700">
                <button
                  onClick={() => setActiveTab('orders')}
                  className={`flex-1 px-4 py-2 text-sm font-medium ${
                    activeTab === 'orders'
                      ? 'bg-gray-700 text-white border-b-2 border-blue-500'
                      : 'text-gray-400 hover:text-white hover:bg-gray-750'
                  }`}
                >
                  Orders
                </button>
                <button
                  onClick={() => setActiveTab('positions')}
                  className={`flex-1 px-4 py-2 text-sm font-medium ${
                    activeTab === 'positions'
                      ? 'bg-gray-700 text-white border-b-2 border-blue-500'
                      : 'text-gray-400 hover:text-white hover:bg-gray-750'
                  }`}
                >
                  Positions
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  className={`flex-1 px-4 py-2 text-sm font-medium ${
                    activeTab === 'history'
                      ? 'bg-gray-700 text-white border-b-2 border-blue-500'
                      : 'text-gray-400 hover:text-white hover:bg-gray-750'
                  }`}
                >
                  History
                </button>
              </div>

              {/* Tab Content */}
              <div className="p-4 max-h-96 overflow-y-auto">
                {/* Orders Tab */}
                {activeTab === 'orders' && (
                  <div>
                    {orders.length === 0 ? (
                      <div className="text-sm text-gray-500 text-center py-8">No open orders yet</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-700">
                              <th className="text-left py-2 px-3 text-gray-400 font-medium">Time</th>
                              <th className="text-left py-2 px-3 text-gray-400 font-medium">Type</th>
                              <th className="text-left py-2 px-3 text-gray-400 font-medium">Ticker</th>
                              <th className="text-left py-2 px-3 text-gray-400 font-medium">Direction</th>
                              <th className="text-left py-2 px-3 text-gray-400 font-medium">Size</th>
                              <th className="text-left py-2 px-3 text-gray-400 font-medium">Original Size</th>
                              <th className="text-left py-2 px-3 text-gray-400 font-medium">Order Value</th>
                              <th className="text-left py-2 px-3 text-gray-400 font-medium">Price</th>
                              <th className="text-left py-2 px-3 text-gray-400 font-medium">Trigger Conditions</th>
                              <th className="text-left py-2 px-3 text-gray-400 font-medium">TP/SL</th>
                              <th className="text-left py-2 px-3 text-gray-400 font-medium">Status</th>
                              <th className="text-left py-2 px-3 text-gray-400 font-medium">Cancel</th>
                            </tr>
                          </thead>
                          <tbody>
                            {orders.map((order) => (
                              <tr key={order.id} className="border-b border-gray-800 hover:bg-gray-800">
                                <td className="py-2 px-3 text-gray-300">
                                  {order.created_at ? new Date(order.created_at).toLocaleString() : '-'}
                                </td>
                                <td className="py-2 px-3 text-gray-300">{order.order_type}</td>
                                <td className="py-2 px-3 text-white font-medium">{order.symbol}</td>
                                <td className={`py-2 px-3 ${order.side === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>
                                  {order.side}
                                </td>
                                <td className="py-2 px-3 text-gray-300">{order.quantity}</td>
                                <td className="py-2 px-3 text-gray-300">{order.quantity}</td>
                                <td className="py-2 px-3 text-gray-300">
                                  {order.price ? `${(Number(order.quantity) * Number(order.price)).toFixed(2)}` : 'Market'}
                                </td>
                                <td className="py-2 px-3 text-gray-300">
                                  {order.price ? `$${order.price}` : order.trigger_price ? `$${order.trigger_price}` : 'Market'}
                                </td>
                                <td className="py-2 px-3 text-gray-400">
                                  {order.trigger_price 
                                    ? `${order.order_type === 'TAKE_PROFIT' ? 'Price above' : 'Price below'} ${order.trigger_price}`
                                    : 'N/A'}
                                </td>
                                <td className="py-2 px-3 text-gray-400">
                                  {order.position_id ? 'View' : '--'}
                                </td>
                                <td className="py-2 px-3">
                                  <span className="px-2 py-0.5 rounded bg-yellow-900 text-yellow-300 text-xs">
                                    {order.status.toUpperCase()}
                                  </span>
                                </td>
                                <td className="py-2 px-3">
                                  <button
                                    onClick={() => handleCancelOrder(order.id)}
                                    className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                                    disabled={loading}
                                  >
                                    Cancel
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Positions Tab */}
                {activeTab === 'positions' && (
                  <div>
                    {positions.length === 0 ? (
                      <div className="text-sm text-gray-500 text-center py-8">No open positions yet</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-700">
                              <th className="text-left py-2 px-3 text-gray-400 font-medium">Ticker</th>
                              <th className="text-left py-2 px-3 text-gray-400 font-medium">Size</th>
                              <th className="text-left py-2 px-3 text-gray-400 font-medium">Position Value</th>
                              <th className="text-left py-2 px-3 text-gray-400 font-medium">Entry Price</th>
                              <th className="text-left py-2 px-3 text-gray-400 font-medium">Mark Price</th>
                              <th className="text-left py-2 px-3 text-gray-400 font-medium">PNL (ROE %)</th>
                              <th className="text-left py-2 px-3 text-gray-400 font-medium">TP/SL</th>
                              <th className="text-left py-2 px-3 text-gray-400 font-medium">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {positions.map((pos) => {
                              const positionValue = Number(pos.quantity) * Number(pos.current_price || pos.entry_price);
                              const roePercent = pos.entry_price ? ((Number(pos.unrealized_pnl) / (Number(pos.quantity) * Number(pos.entry_price))) * 100).toFixed(2) : '0.00';
                              return (
                                <tr key={pos.id} className="border-b border-gray-800 hover:bg-gray-800">
                                  <td className="py-2 px-3 text-white font-medium">{pos.symbol}</td>
                                  <td className="py-2 px-3 text-gray-300">{pos.quantity}</td>
                                  <td className="py-2 px-3 text-gray-300">${positionValue.toFixed(2)}</td>
                                  <td className="py-2 px-3 text-gray-300">${pos.entry_price}</td>
                                  <td className="py-2 px-3 text-gray-300">${pos.current_price || pos.entry_price}</td>
                                  <td className={`py-2 px-3 ${pos.unrealized_pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    ${pos.unrealized_pnl?.toFixed(2) || '0.00'} ({roePercent}%)
                                  </td>
                                  <td className="py-2 px-3">
                                    {(() => {
                                      const tpSlOrders = positionTpSlOrders[pos.id] || [];
                                      const hasTp = tpSlOrders.some(o => o.order_type === 'TAKE_PROFIT' && (o.status === 'pending' || o.status === 'filled'));
                                      const hasSl = tpSlOrders.some(o => o.order_type === 'STOP_LOSS' && (o.status === 'pending' || o.status === 'filled'));
                                      const tpStatus = hasTp ? 'TP' : '-';
                                      const slStatus = hasSl ? 'SL' : '-';
                                      return (
                                        <div className="flex items-center gap-2">
                                          <span className="text-gray-300 text-xs">{tpStatus}/{slStatus}</span>
                                          <button
                                            onClick={() => handleOpenTpSlModal(pos.id)}
                                            className="px-2 py-1 bg-yellow-600 text-white text-xs rounded hover:bg-yellow-700"
                                            disabled={loading}
                                          >
                                            Edit
                                          </button>
                                        </div>
                                      );
                                    })()}
                                  </td>
                                  <td className="py-2 px-3">
                                    <div className="flex gap-1">
                                      <button
                                        onClick={() => handleOpenCloseModal(pos.id, 'MARKET')}
                                        className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                                        disabled={loading}
                                      >
                                        Market
                                      </button>
                                      <button
                                        onClick={() => handleOpenCloseModal(pos.id, 'LIMIT')}
                                        className="px-2 py-1 bg-orange-600 text-white text-xs rounded hover:bg-orange-700"
                                        disabled={loading}
                                      >
                                        Limit
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* History Tab */}
                {activeTab === 'history' && (
                  <div>
                    {allOrders.length === 0 ? (
                      <div className="text-sm text-gray-500 text-center py-8">No order history</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-700">
                              <th className="text-left py-2 px-3 text-gray-400 font-medium">Time</th>
                              <th className="text-left py-2 px-3 text-gray-400 font-medium">Type</th>
                              <th className="text-left py-2 px-3 text-gray-400 font-medium">Ticker</th>
                              <th className="text-left py-2 px-3 text-gray-400 font-medium">Direction</th>
                              <th className="text-left py-2 px-3 text-gray-400 font-medium">Size</th>
                              <th className="text-left py-2 px-3 text-gray-400 font-medium">Filled Size</th>
                              <th className="text-left py-2 px-3 text-gray-400 font-medium">Order Value</th>
                              <th className="text-left py-2 px-3 text-gray-400 font-medium">Price</th>
                              <th className="text-left py-2 px-3 text-gray-400 font-medium">Trigger Conditions</th>
                              <th className="text-left py-2 px-3 text-gray-400 font-medium">TP/SL</th>
                              <th className="text-left py-2 px-3 text-gray-400 font-medium">Status</th>
                              <th className="text-left py-2 px-3 text-gray-400 font-medium">Order ID</th>
                            </tr>
                          </thead>
                          <tbody>
                            {allOrders.map((order) => {
                              const orderValue = order.filled_price 
                                ? (Number(order.quantity) * Number(order.filled_price)).toFixed(2)
                                : order.price 
                                ? (Number(order.quantity) * Number(order.price)).toFixed(2)
                                : '-';
                              return (
                                <tr key={order.id} className="border-b border-gray-800 hover:bg-gray-800">
                                  <td className="py-2 px-3 text-gray-300">
                                    {order.created_at ? new Date(order.created_at).toLocaleString() : '-'}
                                  </td>
                                  <td className="py-2 px-3 text-gray-300">{order.order_type}</td>
                                  <td className="py-2 px-3 text-white font-medium">{order.symbol}</td>
                                  <td className={`py-2 px-3 ${order.side === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>
                                    {order.side}
                                  </td>
                                  <td className="py-2 px-3 text-gray-300">{order.quantity}</td>
                                  <td className="py-2 px-3 text-gray-300">
                                    {order.status === 'filled' ? order.quantity : '-'}
                                  </td>
                                  <td className="py-2 px-3 text-gray-300">{orderValue}</td>
                                  <td className="py-2 px-3 text-gray-300">
                                    {order.filled_price 
                                      ? `$${order.filled_price}`
                                      : order.price 
                                      ? `$${order.price}`
                                      : order.trigger_price 
                                      ? `$${order.trigger_price}`
                                      : 'Market'}
                                  </td>
                                  <td className="py-2 px-3 text-gray-400">
                                    {order.trigger_price 
                                      ? `${order.order_type === 'TAKE_PROFIT' ? 'Price above' : 'Price below'} ${order.trigger_price}`
                                      : 'N/A'}
                                  </td>
                                  <td className="py-2 px-3 text-gray-400">
                                    {order.position_id ? 'View' : '--'}
                                  </td>
                                  <td className="py-2 px-3">
                                    <span className={`px-2 py-0.5 rounded text-xs ${
                                      order.status === 'filled' ? 'bg-green-900 text-green-300' :
                                      order.status === 'cancelled' ? 'bg-gray-700 text-gray-300' :
                                      order.status === 'rejected' ? 'bg-red-900 text-red-300' :
                                      'bg-yellow-900 text-yellow-300'
                                    }`}>
                                      {order.status.toUpperCase()}
                                    </span>
                                  </td>
                                  <td className="py-2 px-3 text-gray-400 text-xs">{order.id.substring(0, 8)}...</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="col-span-2">
            {/* Place Order Section */}
            <div className="border border-gray-700 bg-gray-800 p-4 mb-4">
              <h3 className="font-bold mb-3 text-white">Place Order</h3>
              
              {/* Market/Limit Tabs */}
              <div className="flex border-b border-gray-700 mb-4">
                <button
                  onClick={() => setOrderType('MARKET')}
                  className={`flex-1 px-4 py-2 text-sm font-medium ${
                    orderType === 'MARKET'
                      ? 'bg-gray-700 text-white border-b-2 border-blue-500'
                      : 'text-gray-400 hover:text-white hover:bg-gray-750'
                  }`}
                >
                  Market
                </button>
                <button
                  onClick={() => setOrderType('LIMIT')}
                  className={`flex-1 px-4 py-2 text-sm font-medium ${
                    orderType === 'LIMIT'
                      ? 'bg-gray-700 text-white border-b-2 border-blue-500'
                      : 'text-gray-400 hover:text-white hover:bg-gray-750'
                  }`}
                >
                  Limit
                </button>
              </div>
              
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="w-full p-2 bg-gray-900 border border-gray-700 text-white mb-2"
              >
                <option>BTC</option>
                <option>ETH</option>
                <option>AAPL</option>
              </select>

              {orderType === 'LIMIT' && (
                <input
                  type="number"
                  placeholder="Limit Price"
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                  className="w-full p-2 bg-gray-900 border border-gray-700 text-white mb-2"
                />
              )}

              <input
                type="number"
                placeholder="Quantity"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full p-2 bg-gray-900 border border-gray-700 text-white mb-2"
              />

              <div className="flex gap-2 mb-2">
                <button 
                  onClick={() => setOrderSide('buy')}
                  className={`flex-1 p-2 ${orderSide === 'buy' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300'}`}
                >
                  Buy
                </button>
                <button 
                  onClick={() => setOrderSide('sell')}
                  className={`flex-1 p-2 ${orderSide === 'sell' ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-300'}`}
                >
                  Sell
                </button>
              </div>

              <button 
                className="w-full p-2 mt-2 bg-blue-600 text-white disabled:opacity-50"
                onClick={handlePlaceOrder}
                disabled={loading || !amount}
              >
                {loading ? 'Placing...' : 'Submit Order'}
              </button>
              
              <button 
                className="w-full p-2 mt-2 bg-purple-600 text-white disabled:opacity-50"
                onClick={handleProcessOrders}
                disabled={loading}
              >
                {loading ? 'Processing...' : 'Process Orders'}
              </button>
            </div>
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
                  {positionTpSlOrders[selectedPositionForTpSl].map((order) => (
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
                              className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                              disabled={loading}
                            >
                              Save
                            </button>
                            <button
                              onClick={() => {
                                setEditingOrderId(null);
                                setEditTriggerPrice('');
                                setEditQuantity('');
                              }}
                              className="px-3 py-1 bg-gray-600 text-white text-sm rounded hover:bg-gray-700"
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
                                  className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteTpSl(order.id)}
                                  className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                                  disabled={loading}
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
                  className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                  disabled={loading || !newTpTriggerPrice}
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
                  className="w-full px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                  disabled={loading || !newSlTriggerPrice}
                >
                  Create Stop Loss
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleCloseTpSlModal}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
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
                        className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                        disabled={loading || !closeQuantity || (closeOrderType === 'LIMIT' && !closeLimitPrice)}
                      >
                        {loading ? 'Placing...' : 'Place Close Order'}
                      </button>
                      <button
                        onClick={handleCloseModal}
                        className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
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
