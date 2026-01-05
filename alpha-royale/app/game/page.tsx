'use client';
import { useState } from 'react';

export default function GamePage() {
  const [symbol, setSymbol] = useState('BTC');
  const [amount, setAmount] = useState('');
  const [orderType, setOrderType] = useState('buy');
  const [gameID, setGameID] = useState<string>('A1B2C3')

  return (
    <div className="h-screen bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6 text-white">
          <h1 className="text-2xl font-bold">Alpha Royale - {gameID}</h1>
          <div className="flex gap-4">
            <div>Your Balance: $10,000</div>
            <div>Opponent Balance: $10,000</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2">
            <div className="border border-gray-700 bg-gray-800 p-4 mb-4">
              <h2 className="font-bold mb-2 text-white">Market Chart</h2>
              <div className="h-64 bg-gray-900 flex items-center justify-center">
                <div className="text-gray-500">Price chart will render here</div>
              </div>
            </div>

            <div className="border border-gray-700 bg-gray-800 p-4">
              <h2 className="font-bold mb-2 text-white">Equity Comparison</h2>
              <div className="h-32 bg-gray-900 flex items-center justify-center">
                <div className="text-gray-500">Equity curves here</div>
              </div>
            </div>
          </div>

          <div>
            <div className="border border-gray-700 bg-gray-800 p-4 mb-4">
              <h3 className="font-bold mb-3 text-white">Current Prices</h3>
              <div className="space-y-2 text-sm text-gray-300">
                <div className="flex justify-between">
                  <span>BTC</span>
                  <span>$42,150.00</span>
                </div>
                <div className="flex justify-between">
                  <span>ETH</span>
                  <span>$2,245.50</span>
                </div>
                <div className="flex justify-between">
                  <span>AAPL</span>
                  <span>$178.20</span>
                </div>
              </div>
            </div>

            <div className="border border-gray-700 bg-gray-800 p-4 mb-4">
              <h3 className="font-bold mb-3 text-white">Place Order</h3>
              <select 
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="w-full p-2 bg-gray-900 border border-gray-700 text-white mb-2"
              >
                <option>BTC</option>
                <option>ETH</option>
                <option>AAPL</option>
              </select>
              <input 
                type="number"
                placeholder="Amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full p-2 bg-gray-900 border border-gray-700 text-white mb-2"
              />
              <div className="flex gap-2 mb-2">
                <button 
                  onClick={() => setOrderType('buy')}
                  className={`flex-1 p-2 ${orderType === 'buy' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300'}`}
                >
                  Buy
                </button>
                <button 
                  onClick={() => setOrderType('sell')}
                  className={`flex-1 p-2 ${orderType === 'sell' ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-300'}`}
                >
                  Sell
                </button>
              </div>
              <button className="w-full p-2 bg-blue-600 text-white">Submit Order</button>
            </div>

            <div className="border border-gray-700 bg-gray-800 p-4">
              <h3 className="font-bold mb-3 text-white">Your Positions</h3>
              <div className="text-sm text-gray-500">No open positions</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
