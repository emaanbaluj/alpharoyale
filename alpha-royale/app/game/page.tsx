'use client';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '../auth/supabaseClient/supabaseClient';
import { orderAPI, positionAPI, gameAPI } from '../lib/api';
import { subscribeToGamePlayers, subscribeToPositions } from '../lib/subscriptions';
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

export default function GamePage() {
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
  const [orderType, setOrderType] = useState<'MARKET' | 'STOP_LOSS' | 'TAKE_PROFIT'>('MARKET');
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null);
  const [triggerPrice, setTriggerPrice] = useState('');
  const selectedPosition = positions.find(p => p.id === selectedPositionId);



  const addDataPoints = (dataPoints: { myValue: number; oppValue: number; time: string }[]) => {
    const myNewEntries: ChartUnit[] = dataPoints.map(dp => ({
      time: dp.time,
      value: dp.myValue,
    }));
    const oppNewEntries: ChartUnit[] = dataPoints.map(dp => ({
      time: dp.time,
      value: dp.oppValue,
    }));
    
    setMyEquityChartData(prev => [...prev, ...myNewEntries]);
    setOppEquityChartData(prev => [...prev, ...oppNewEntries]);
  };

  // tejas: i chatgpt generated this to fabricate data so we can test
  // it generates a data point every 20 seconds -----------------------
  const generateTickerData = (ticker: CompatibleTickers): TickerPriceData => {
    const points: ChartUnit[] = [];
    const startTime = new Date();
    const basePrices = { ETH: 2500, BTC: 65000, AAPL: 190 };
    let currentPrice = basePrices[ticker];
    for (let i = 0; i < 360; i++) {
      const time = new Date(startTime.getTime() - i * 20000);
      const variance = currentPrice * (Math.random() * 0.001 - 0.0005);
      currentPrice += variance;

      points.push({
        time: time.toISOString(),
        value: parseFloat(currentPrice.toFixed(2))
      });
    }

    return {
      ticker,
      price: points.reverse()
    };
  };
  useEffect(() => {
    const initialData: Record<string, TickerPriceData> = {};
    COMPATIBLETICKERS.forEach(ticker => {
      initialData[ticker] = generateTickerData(ticker);
    });
    setMarketData(initialData);
  }, []);
  // ------------------------------------------------------------------

  // tejas: fake data for equity chart for testing --------------------
  useEffect(() => {
    addDataPoints([
      { myValue: 10000, oppValue: 10000, time: "2026-01-05T12:00:00Z" },
      { myValue: 10500, oppValue: 9900, time: "2026-01-05T12:00:20Z" },
      { myValue: 10700, oppValue: 9990, time: "2026-01-05T12:00:40Z" },
      { myValue: 10800, oppValue: 11000, time: "2026-01-05T12:01:00Z" },
      { myValue: 10600, oppValue: 12000, time: "2026-01-05T12:01:20Z" },
      { myValue: 10750, oppValue: 12500, time: "2026-01-05T12:01:40Z" },
      { myValue: 10900, oppValue: 12800, time: "2026-01-05T12:02:00Z" },
      { myValue: 11000, oppValue: 12900, time: "2026-01-05T12:02:20Z" },
    ]);
  }, []);
  // ------------------------------------------------------------------
  
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
      loadGameData(gameId, userId);
    });

    const unsubPositions = subscribeToPositions(gameId, userId, (payload) => {
      loadPositions(gameId, userId);
    });

    return () => {
      unsubPlayers();
      unsubPositions();
    };
  }, [gameId, userId]);

  async function loadGameData(gId: string, uId: string) {
    const { game, players } = await gameAPI.getGame(gId);
    if (players) {
      const me = players.find((p: any) => p.user_id === uId);
      const opponent = players.find((p: any) => p.user_id !== uId);
      if (me) setMyBalance(me.equity);
      if (opponent) setOpponentBalance(opponent.equity);
    }
    loadPositions(gId, uId);
  }

  async function loadPositions(gId: string, uId: string) {
    const { positions: pos } = await positionAPI.getPositions(gId, uId);
    if (pos) setPositions(pos);
  }

  async function handlePlaceOrder() {
    if (!gameId || !userId) return;

    if (orderType !== 'MARKET') {
      if (!selectedPositionId) {
        alert('Please select a position');
        return;
      }
      if (!triggerPrice) {
        alert('Please enter a trigger price');
        return;
      }
    }

    const position = positions.find(p => p.id === selectedPositionId);

    const finalSymbol =
      orderType === 'MARKET' ? symbol : position?.symbol;

    const finalSide =
      orderType === 'MARKET'
        ? orderSide.toUpperCase()
        : position?.side === 'BUY'
          ? 'SELL'
          : 'BUY';

    const finalQuantity =
      amount
        ? parseFloat(amount)
        : position?.quantity;

    setLoading(true);

    const result = await orderAPI.placeOrder({
      gameId,
      playerId: userId,
      symbol: finalSymbol!,
      orderType: orderType,
      side: finalSide!,
      quantity: finalQuantity!,
      triggerPrice:
        orderType !== 'MARKET'
          ? parseFloat(triggerPrice)
          : undefined,
      positionId:
        orderType !== 'MARKET'
          ? selectedPositionId ?? undefined // if selectedPositionId is null, send undefined
          : undefined
    });

    setLoading(false);

    if (result.order) {
      setAmount('');
      setTriggerPrice('');
      setSelectedPositionId(null);
      alert('Order placed!');
    } else {
      alert('Failed to place order: ' + result.error);
    }
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
                    <span>$150.00</span>
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
            <div className="border border-gray-700 bg-gray-800 p-4 mb-4">
              <h3 className="font-bold mb-3 text-white">Place Order</h3>
              {orderType === 'MARKET' && (
                <select
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  className="w-full p-2 bg-gray-900 border border-gray-700 text-white mb-2"
                >
                  <option>BTC</option>
                  <option>ETH</option>
                  <option>AAPL</option>
                </select>
              )}
              <select
                value={orderType}
                onChange={(e) => setOrderType(e.target.value as any)}
                className="w-full p-2 bg-gray-900 border border-gray-700 text-white mb-2"
              >
                <option value="MARKET">Market</option>
                <option value="STOP_LOSS">Stop Loss</option>
                <option value="TAKE_PROFIT">Take Profit</option>
              </select>
              {orderType !== 'MARKET' && (
                <select
                  value={selectedPositionId ?? ''}
                  onChange={(e) => setSelectedPositionId(e.target.value)}
                  className="w-full p-2 bg-gray-900 border border-gray-700 text-white mb-2"
                >
                  <option value="">Select Position</option>
                  {positions.map((pos) => (
                    <option key={pos.id} value={pos.id}>
                      {pos.symbol} • {pos.side} • Qty {pos.quantity}
                    </option>
                  ))}
                </select>
              )}
              {orderType !== 'MARKET' && (
                <input
                  type="number"
                  placeholder={
                    orderType === 'TAKE_PROFIT'
                      ? 'Take Profit Price'
                      : 'Stop Loss Price'
                  }
                  value={triggerPrice}
                  onChange={(e) => setTriggerPrice(e.target.value)}
                  className="w-full p-2 bg-gray-900 border border-gray-700 text-white mb-2"
                />
              )}

              <input
                type="number"
                placeholder={
                  orderType === 'MARKET'
                    ? 'Quantity'
                    : `Quantity (max ${selectedPosition?.quantity ?? '-'})`
                }
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full p-2 bg-gray-900 border border-gray-700 text-white mb-2"
              />

              {orderType === 'MARKET' && (
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
              )}
              <button 
                className="w-full p-2 bg-blue-600 text-white disabled:opacity-50"
                onClick={handlePlaceOrder}
                disabled={loading || !amount}
              >
                {loading ? 'Placing...' : 'Submit Order'}
              </button>
            </div>

            <div className="border border-gray-700 bg-gray-800 p-4">
              <h3 className="font-bold mb-3 text-white">Your Positions</h3>
              {positions.length === 0 ? (
                <div className="text-sm text-gray-500">No open positions</div>
              ) : (
                <div className="space-y-2">
                  {positions.map((pos) => (
                    <div key={pos.id} className="p-2 bg-gray-900 rounded text-sm">
                      <div className="flex justify-between text-white">
                        <span className="font-bold">{pos.symbol}</span>
                        <span className={pos.side === 'BUY' ? 'text-green-400' : 'text-red-400'}>
                          {pos.side}
                        </span>
                      </div>
                      <div className="text-gray-400">
                        <div>Qty: {pos.quantity}</div>
                        <div>Entry: ${pos.entry_price}</div>
                        <div className={pos.unrealized_pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                          P&L: ${pos.unrealized_pnl?.toFixed(2) || '0.00'}
                        </div>
                      </div>
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
