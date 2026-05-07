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
  agentId?: string;
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

export type MarketContext = {
  generatedAt: string;
  provider: string;
  model: string;
  summary: string;
  themes: string[];
  perSymbol: Array<{
    symbol: string;
    view: 'constructive' | 'cautious' | 'neutral';
    rationale: string;
    scores: {
      opportunity: number;
      risk: number;
      confidence: number;
    };
  }>;
};

export type LlmInfluence = {
  view: 'constructive' | 'cautious' | 'neutral' | 'missing';
  opportunityScore: number;
  riskScore: number;
  confidenceScore: number;
  confidenceAdjustment: number;
  noTradeBiasApplied: boolean;
};

export type DecisionJournal = {
  strategyBucket: string;
  signal: TradingSignal['signal'];
  preLlmConfidence: number;
  finalConfidence: number;
  signalStrength: 'strong' | 'moderate' | 'weak';
  noTradeBias: string;
  executionPlan: string;
  llmInfluence: LlmInfluence;
  checkpoints: string[];
};

export type AiDecision = {
  symbol: string;
  action: TradeAction;
  quantity: number;
  triggerPrice?: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  confidence: number;
  reason: string;
  riskNotes: string;
  journal: DecisionJournal;
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
  stopLossPrice?: number;
  takeProfitPrice?: number;
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
  stopLossPrice?: number;
  takeProfitPrice?: number;
  executedAt: string;
  reason: string;
  brokerOrderId?: string;
  brokerOrderStatus?: string;
  brokerOrderType?: string;
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
    marketContext: MarketContext;
  };
  aiDecision: AiDecision;
  riskReview: RiskReview;
};

export type PipelineResult = {
  portfolio: PortfolioState;
  snapshot: MarketSnapshot;
  signals: TradingSignal[];
  marketContext: MarketContext;
  decisions: DecisionLogEntry[];
  tradePlans: TradePlan[];
  executedTrades: ExecutedTrade[];
};

export type TradeHistoryStatus = 'planned' | 'blocked' | 'executed' | 'canceled' | 'failed' | 'held' | 'watched';

export type TradeHistoryItem = {
  id: string;
  accountId: string;
  symbol: string;
  action: TradeAction;
  side?: 'buy' | 'sell';
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
    finalAction: TradeAction;
    reasons: string[];
  };
  marketContext?: {
    snapshotId: string;
    summary: string;
    themes: string[];
  };
};

export type TradeHistoryResult = {
  items: TradeHistoryItem[];
  nextCursor?: string;
};
