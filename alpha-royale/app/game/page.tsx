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
        }
      )
      .subscribe();

    // Add polling fallback to ensure UI stays updated (every 3 seconds)
    const pollInterval = setInterval(() => {
      loadGameData(gameId, userId);
      loadPositions(gameId, userId);
      loadOrders(gameId, userId);
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
    if (pos) setPositions(pos);
  }

  async function loadOrders(gId: string, uId: string) {
    const { orders: ords } = await orderAPI.getOrders(gId, uId, 'pending');
    if (ords) setOrders(ords);
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

  async function handleEditTpSl(positionId: string) {
    setEditingPositionId(positionId);
    await loadTpSlOrdersForPosition(positionId);
  }

  async function handleUpdateTpSl(orderId: string, updates: { triggerPrice?: number; quantity?: number }) {
    if (!userId) return;
    
    setLoading(true);
    const result = await orderAPI.updateOrder(orderId, userId, updates);
    setLoading(false);

    if (result.order) {
      if (editingPositionId) {
        await loadTpSlOrdersForPosition(editingPositionId);
      }
      alert('TP/SL order updated successfully');
    } else {
      alert('Failed to update order: ' + result.error);
    }
  }

  async function handleClosePosition(positionId: string, type: 'MARKET' | 'LIMIT') {
    const position = positions.find(p => p.id === positionId);
    if (!position || !gameId || !userId) return;

    setClosingPositionId(positionId);
    setCloseOrderType(type);
    setCloseQuantity(position.quantity.toString());
    setCloseLimitPrice('');

    // For now, we'll show a prompt. In a full implementation, use a modal
    const quantity = prompt(`Enter quantity to close (max: ${position.quantity}):`, position.quantity.toString());
    if (!quantity) return;

    let limitPrice: string | undefined;
    if (type === 'LIMIT') {
      const limitPriceInput = prompt(`Enter limit price:`);
      if (!limitPriceInput) return;
      limitPrice = limitPriceInput;
    }

    setLoading(true);

    try {
      const result = await orderAPI.placeOrder({
        gameId,
        playerId: userId,
        symbol: position.symbol,
        orderType: type,
        side: 'SELL',
        quantity: parseFloat(quantity),
        price: limitPrice ? parseFloat(limitPrice) : undefined,
      });

      if (result.order) {
        alert('Close order placed! Click "Process Orders" to execute it.');
        setClosingPositionId(null);
        setCloseQuantity('');
        setCloseLimitPrice('');
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

            <div className="border border-gray-700 bg-gray-800 p-4">
              <div className="flex justify-between">
                <h2 className="font-bold mb-2 text-white">Equity Comparison</h2>
                <button className="text-sm mb-2" onClick={() => setShowOppEquityCurve(!showOppEquityCurve)}>{showOppEquityCurve ? 'Hide Opponent' : 'Show Opponent'}</button>
              </div>
              <div className="h-32 bg-gray-900 flex items-center justify-center">
                <PriceChart data1={myEquityChartData} data2={oppEquityChartData} showData2={showOppEquityCurve}/>
              </div>
            </div>
          </div>

          <div className="col-span-2">
            {/* Open Orders Section */}
            <div className="border border-gray-700 bg-gray-800 p-4 mb-4">
              <h3 className="font-bold mb-3 text-white">Open Orders</h3>
              {orders.length === 0 ? (
                <div className="text-sm text-gray-500">No open orders</div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {orders.map((order) => (
                    <div key={order.id} className="p-2 bg-gray-900 rounded text-sm">
                      <div className="flex justify-between items-start text-white">
                        <div className="flex-1">
                          <div className="flex gap-2">
                            <span className="font-bold">{order.symbol}</span>
                            <span className="text-gray-400">{order.order_type}</span>
                            <span className={order.side === 'BUY' ? 'text-green-400' : 'text-red-400'}>
                              {order.side}
                            </span>
                          </div>
                          <div className="text-gray-400 text-xs mt-1">
                            <div>Qty: {order.quantity}</div>
                            {order.price && <div>Limit: ${order.price}</div>}
                            {order.trigger_price && <div>Trigger: ${order.trigger_price}</div>}
                          </div>
                        </div>
                        <button
                          onClick={() => handleCancelOrder(order.id)}
                          className="ml-2 px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                          disabled={loading}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Place Order Section */}
            <div className="border border-gray-700 bg-gray-800 p-4 mb-4">
              <h3 className="font-bold mb-3 text-white">Place Order</h3>
              <select
                value={orderType}
                onChange={(e) => setOrderType(e.target.value as 'MARKET' | 'LIMIT')}
                className="w-full p-2 bg-gray-900 border border-gray-700 text-white mb-2"
              >
                <option value="MARKET">Market</option>
                <option value="LIMIT">Limit</option>
              </select>
              
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

            {/* Your Positions Section */}
            <div className="border border-gray-700 bg-gray-800 p-4">
              <h3 className="font-bold mb-3 text-white">Your Positions</h3>
              {positions.length === 0 ? (
                <div className="text-sm text-gray-500">No open positions</div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {positions.map((pos) => (
                    <div key={pos.id} className="p-2 bg-gray-900 rounded text-sm">
                      <div className="flex justify-between text-white">
                        <span className="font-bold">{pos.symbol}</span>
                        <span className={pos.side === 'BUY' ? 'text-green-400' : 'text-red-400'}>
                          {pos.side}
                        </span>
                      </div>
                      <div className="text-gray-400 mb-2">
                        <div>Qty: {pos.quantity}</div>
                        <div>Entry: ${pos.entry_price}</div>
                        <div className={pos.unrealized_pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                          P&L: ${pos.unrealized_pnl?.toFixed(2) || '0.00'}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        <button
                          onClick={() => handleEditTpSl(pos.id)}
                          className="px-2 py-1 bg-yellow-600 text-white text-xs rounded hover:bg-yellow-700"
                          disabled={loading}
                        >
                          Edit TP/SL
                        </button>
                        <button
                          onClick={() => handleClosePosition(pos.id, 'MARKET')}
                          className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                          disabled={loading}
                        >
                          Market Close
                        </button>
                        <button
                          onClick={() => handleClosePosition(pos.id, 'LIMIT')}
                          className="px-2 py-1 bg-orange-600 text-white text-xs rounded hover:bg-orange-700"
                          disabled={loading}
                        >
                          Limit Close
                        </button>
                      </div>
                      {editingPositionId === pos.id && positionTpSlOrders[pos.id] && (
                        <div className="mt-2 p-2 bg-gray-800 rounded border border-gray-700">
                          <div className="text-xs text-white mb-1">TP/SL Orders:</div>
                          {positionTpSlOrders[pos.id].length === 0 ? (
                            <div className="text-xs text-gray-500">No TP/SL orders</div>
                          ) : (
                            <div className="space-y-1">
                              {positionTpSlOrders[pos.id].map((order) => (
                                <div key={order.id} className="text-xs text-gray-400">
                                  {order.order_type}: ${order.trigger_price} (Qty: {order.quantity})
                                  {order.status === 'pending' && (
                                    <button
                                      onClick={() => handleUpdateTpSl(order.id, { triggerPrice: parseFloat(prompt('New trigger price:') || '0') || undefined })}
                                      className="ml-1 text-blue-400 hover:underline"
                                    >
                                      Edit
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          <button
                            onClick={() => setEditingPositionId(null)}
                            className="mt-1 text-xs text-gray-400 hover:text-white"
                          >
                            Close
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
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
