export type TradeAction = 'buy' | 'sell' | 'trim' | 'hold' | 'plan_buy' | 'plan_sell' | 'watch';

export type MarketCandle = {
  symbol: string;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Position = {
  symbol: string;
  name: string;
  shares: number;
  averageCost: number;
  price: number;
  allocationPercent: number;
};

export type PortfolioState = {
  accountId: string;
  cash: number;
  buyingPower: number;
  totalValue: number;
  maxPositionPercent: number;
  maxTradeValuePercent: number;
  minConfidence: number;
  positions: Position[];
};

export type MarketSnapshot = {
  snapshotId: string;
  capturedAt: string;
  candles: MarketCandle[];
};

export type TradingSignal = {
  symbol: string;
  currentPrice: number;
  momentumPercent: number;
  volatilityPercent: number;
  volumeRatio: number;
  positionAllocationPercent: number;
  signal: 'bullish' | 'bearish' | 'neutral';
};

export type AiDecision = {
  symbol: string;
  action: TradeAction;
  quantity: number;
  triggerPrice?: number;
  confidence: number;
  reason: string;
  riskNotes: string;
};

export type RiskReview = {
  approved: boolean;
  finalAction: TradeAction;
  reasons: string[];
};

export type TradePlan = {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  triggerPrice: number;
  confidence: number;
  status: 'planned' | 'blocked';
  reason: string;
  riskNotes: string;
  createdAt: string;
};

export type ExecutedTrade = {
  id: string;
  symbol: string;
  action: TradeAction;
  quantity: number;
  price: number;
  executedAt: string;
  reason: string;
};

export type DecisionLogEntry = {
  id: string;
  createdAt: string;
  snapshotId: string;
  promptVersion: string;
  model: string;
  input: {
    portfolio: PortfolioState;
    signals: TradingSignal[];
  };
  aiDecision: AiDecision;
  riskReview: RiskReview;
};

export type PipelineResult = {
  portfolio: PortfolioState;
  snapshot: MarketSnapshot;
  signals: TradingSignal[];
  decisions: DecisionLogEntry[];
  tradePlans: TradePlan[];
  executedTrades: ExecutedTrade[];
};
