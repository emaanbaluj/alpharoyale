export const gameAPI = {
  async createGame(userId: string) {
    const res = await fetch('/api/games/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
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
