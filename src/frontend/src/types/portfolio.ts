export type Theme = "light" | "dark";

export type PerformancePoint = {
  label: string;
  value: number;
};

export type PerformanceRange = "1D" | "1W" | "1M" | "3M" | "1Y" | "ALL";

export type Position = {
  symbol: string;
  name: string;
  shares: number;
  price: number;
  marketValue: number;
  dayChangePercent: number;
  allocation: number;
  aiSignal: string;
  lastAction: "Bought" | "Sold" | "Trimmed" | "Held";
  actionTime: string;
  actionPrice: number;
  aiThought: string;
};

export type TradeDecision = {
  time: string;
  action: string;
  symbol: string;
  quantity: number;
  price: number;
  reason: string;
};

export type WatchlistItem = {
  symbol: string;
  price: number;
  changePercent: number;
};

export type TradePlan = {
  id: string;
  symbol: string;
  name: string;
  side: "Buy" | "Sell";
  triggerPrice: number;
  currentPrice: number;
  quantity: number;
  confidence: number;
  status: string;
  reason: string;
};

export type PortfolioData = {
  account: {
    name: string;
    mode: string;
    lastUpdated: string;
    cash: number;
    buyingPower: number;
  };
  portfolio: {
    totalValue: number;
    dayChange: number;
    dayChangePercent: number;
    totalReturn: number;
    totalReturnPercent: number;
    riskScore: number;
    winRate: number;
  };
  performance: Record<PerformanceRange, PerformancePoint[]>;
  positions: Position[];
  trades: TradeDecision[];
  watchlist: WatchlistItem[];
  plans: TradePlan[];
};
