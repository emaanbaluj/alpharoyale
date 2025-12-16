'use client';

export default function GamePage() {
  // TODO: Tejas - add OpenGame/JoinGame logic
  // TODO: Ojas, Dawid, Emaan - add market graph here
  
  return (
    <div className="h-screen bg-black text-white p-4">
      <div className="grid grid-cols-3 gap-4 h-full">
        
        {/* Left - Market Chart */}
        <div className="col-span-2 border border-zinc-800 rounded p-4">
          <h2 className="text-xl mb-4">Live Market Data</h2>
          {/* Ojas: Chart component goes here */}
          <div className="h-96 bg-zinc-900 rounded flex items-center justify-center">
            <p className="text-gray-500">Market graph placeholder</p>
          </div>
          
          {/* Opponent equity curve */}
          <div className="mt-4 h-32 bg-zinc-900 rounded flex items-center justify-center">
            <p className="text-gray-500">Equity curves (you vs opponent)</p>
          </div>
        </div>

        {/* Right - Trading Panel */}
        <div className="border border-zinc-800 rounded p-4">
          <h2 className="text-lg mb-4">Current Prices</h2>
          {/* Dawid: Price data from cron job */}
          <div className="space-y-2 mb-6">
            <div className="p-2 bg-zinc-900 rounded">BTC: $--</div>
            <div className="p-2 bg-zinc-900 rounded">ETH: $--</div>
          </div>

          <h2 className="text-lg mb-2">Make Order</h2>
          {/* Tejas: MakeOrder form */}
          <input placeholder="Amount" className="w-full p-2 mb-2 bg-zinc-900 rounded" />
          <select className="w-full p-2 mb-2 bg-zinc-900 rounded">
            <option>Buy</option>
            <option>Sell</option>
          </select>
          <button className="w-full p-2 bg-green-600 rounded">Execute</button>

          {/* Open positions - connected to Supabase */}
          <h2 className="text-lg mt-6 mb-2">Open Positions</h2>
          <div className="text-sm text-gray-400">No positions yet</div>
        </div>
      </div>
    </div>
  );
}
