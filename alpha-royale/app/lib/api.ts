export const gameAPI = {
  async createGame(userId: string, durationMinutes: number = 60) {
    const res = await fetch('/api/games/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, durationMinutes })
    });
    return res.json();
  },

  async startGame(gameId: string, userId: string) {
    const res = await fetch('/api/games/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId, userId })
    });
    return res.json();
  },

  async joinGame(gameId: string, userId: string) {
    const res = await fetch('/api/games/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId, userId })
    });
    return res.json();
  },

  async getGame(gameId: string) {
    const res = await fetch(`/api/games/get?gameId=${gameId}`);
    return res.json();
  }
};

export const orderAPI = {
  async placeOrder(orderData: {
    gameId: string;
    playerId: string;
    symbol: string;
    orderType: string;
    side: string;
    quantity: number;
    price?: number;
    triggerPrice?: number;
    positionId?: string;
  }) {
    const res = await fetch('/api/orders/place', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData)
    });
    return res.json();
  },

  async getOrders(gameId: string, playerId: string, status: string = 'pending') {
    const res = await fetch(`/api/orders/get?gameId=${gameId}&playerId=${playerId}&status=${status}`);
    return res.json();
  },

  async cancelOrder(orderId: string, playerId: string) {
    const res = await fetch('/api/orders/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, playerId })
    });
    return res.json();
  },

  async getOrdersByPosition(positionId: string, playerId: string) {
    const res = await fetch(`/api/orders/by-position?positionId=${positionId}&playerId=${playerId}`);
    return res.json();
  },

  async updateOrder(orderId: string, playerId: string, updates: { triggerPrice?: number; quantity?: number }) {
    const res = await fetch('/api/orders/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, playerId, ...updates })
    });
    return res.json();
  }
};

export const positionAPI = {
  async getPositions(gameId: string, playerId: string) {
    const res = await fetch(`/api/positions/get?gameId=${gameId}&playerId=${playerId}`);
    return res.json();
  }
};

export const statsAPI = {
  async getUserStats(userId: string) {
    const res = await fetch(`/api/stats?userId=${userId}`);
    return res.json();
  },

  async getLeaderboard() {
    const res = await fetch('/api/leaderboard');
    return res.json();
  }
};

export const priceAPI = {
  async getPriceHistory(symbol: string, limit?: number) {
    const res = await fetch(`/api/prices/history?symbol=${symbol}${limit ? `&limit=${limit}` : ''}`);
    return res.json();
  },

  async getLatestPrices() {
    const res = await fetch('/api/prices/latest');
    return res.json();
  }
};

export const equityAPI = {
  async getEquityHistory(gameId: string, playerId: string) {
    const res = await fetch(`/api/equity/history?gameId=${gameId}&playerId=${playerId}`);
    return res.json();
  }
};
