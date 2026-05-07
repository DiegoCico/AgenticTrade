export type Theme = "light" | "dark";
export type TradingAgentId = "conservative" | "neutral" | "aggressive";

export type TradingAgentOption = {
  id: TradingAgentId;
  label: string;
  description: string;
};

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
  status: TradeHistoryStatus;
  confidence: number;
  riskNotes: string;
  riskApproved: boolean;
  riskReasons: string[];
  journal?: DecisionJournal;
};

export type TradeHistoryAction = "buy" | "sell" | "trim" | "hold" | "plan_buy" | "plan_sell" | "watch";

export type TradeHistoryStatus = "planned" | "blocked" | "executed" | "canceled" | "failed" | "held" | "watched";

export type DecisionJournal = {
  strategyBucket: string;
  signal: "bullish" | "bearish" | "neutral";
  preLlmConfidence: number;
  finalConfidence: number;
  signalStrength: "strong" | "moderate" | "weak";
  noTradeBias: string;
  executionPlan: string;
  llmInfluence: {
    view: "constructive" | "cautious" | "neutral" | "missing";
    opportunityScore: number;
    riskScore: number;
    confidenceScore: number;
    confidenceAdjustment: number;
    noTradeBiasApplied: boolean;
  };
  checkpoints: string[];
};

export type TradeHistoryItem = {
  id: string;
  accountId: string;
  symbol: string;
  action: TradeHistoryAction;
  side?: "buy" | "sell";
  status: TradeHistoryStatus;
  quantity: number;
  price?: number;
  triggerPrice?: number;
  grossValue?: number;
  netValue?: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  occurredAt: string;
  aiThought: {
    summary: string;
    reason: string;
    riskNotes: string;
    confidence: number;
    model: string;
    promptVersion: string;
  };
  journal?: DecisionJournal;
  riskReview: {
    approved: boolean;
    finalAction: TradeHistoryAction;
    reasons: string[];
  };
  marketContext?: {
    snapshotId: string;
    summary: string;
    themes: string[];
  };
};

export type TradeHistoryResponse = {
  items: TradeHistoryItem[];
  nextCursor?: string;
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
