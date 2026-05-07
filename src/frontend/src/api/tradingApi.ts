import type {
  PerformancePoint,
  PortfolioData,
  Position,
  TradingAgentId,
  TradeHistoryItem,
  TradeHistoryResponse,
  TradePlan,
} from "../types/portfolio";

export const tradingAgentOptions = [
  {
    id: "conservative",
    label: "Conservative Agent",
    description: "ETF and high-dividend focused",
  },
  {
    id: "neutral",
    label: "Neutral Agent",
    description: "Current balanced strategy",
  },
  {
    id: "aggressive",
    label: "Aggressive Agent",
    description: "Short-term 1-7 day trades",
  },
] as const;

export const defaultTradingAgentId: TradingAgentId = "neutral";

type BackendTradeAction = "buy" | "sell" | "trim" | "hold" | "plan_buy" | "plan_sell" | "watch";

type BackendPosition = {
  symbol: string;
  name: string;
  shares: number;
  averageCost: number;
  price: number;
  allocationPercent: number;
};

type BackendPortfolioState = {
  accountId: string;
  agentId?: TradingAgentId;
  cash: number;
  buyingPower: number;
  totalValue: number;
  maxPositionPercent: number;
  maxTradeValuePercent: number;
  minConfidence: number;
  positions: BackendPosition[];
};

type BackendTradePlan = {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  triggerPrice: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  confidence: number;
  status: "planned" | "blocked";
  reason: string;
  riskNotes: string;
  createdAt: string;
};

type BackendDecision = {
  id: string;
  createdAt: string;
  model: string;
  promptVersion: string;
  aiDecision: {
    symbol: string;
    action: BackendTradeAction;
    quantity: number;
    triggerPrice?: number;
    confidence: number;
    reason: string;
    riskNotes: string;
  };
};

type BackendTradingState = {
  portfolio: BackendPortfolioState;
  decisions: BackendDecision[];
  tradePlans: BackendTradePlan[];
  executedTrades: Array<{
    id: string;
    symbol: string;
    action: BackendTradeAction;
    quantity: number;
    price: number;
    executedAt: string;
    reason: string;
  }>;
};

type TrpcResponse<T> = {
  result?: {
    data?: T | {
      json?: T;
    };
  };
  error?: unknown;
};

export const emptyPortfolioData: PortfolioData = {
  account: {
    name: "AgenticTrade",
    mode: "paper",
    lastUpdated: new Date().toISOString(),
    cash: 0,
    buyingPower: 0,
  },
  portfolio: {
    totalValue: 0,
    dayChange: 0,
    dayChangePercent: 0,
    totalReturn: 0,
    totalReturnPercent: 0,
    riskScore: 0,
    winRate: 0,
  },
  performance: {
    "1D": [],
    "1W": [],
    "1M": [],
    "3M": [],
    "1Y": [],
    ALL: [],
  },
  positions: [],
  trades: [],
  watchlist: [],
  plans: [],
};

function getApiBaseUrl() {
  const configured = import.meta.env.VITE_API_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  if (import.meta.env.DEV) return "http://localhost:3001";

  return window.location.origin;
}

async function trpcQuery<T>(procedure: string, input?: unknown): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const url = new URL(`/trpc/${procedure}`, baseUrl);

  if (input !== undefined) {
    url.searchParams.set("input", JSON.stringify(input));
  }

  console.log("[frontend:trpcQuery] request", {
    procedure,
    input,
    url: url.toString(),
  });

  const response = await fetch(url.toString(), {
    method: "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  });

  const payload = (await response.json()) as TrpcResponse<T>;

  console.log("[frontend:trpcQuery] response", {
    procedure,
    status: response.status,
    ok: response.ok,
    payload,
  });

  if (!response.ok || payload.error) {
    throw new Error(`tRPC query ${procedure} failed`);
  }

  const data = payload.result?.data;
  if (data && typeof data === "object" && "json" in data) {
    return data.json as T;
  }

  return data as T;
}

function formatAction(action: BackendTradeAction) {
  if (action === "plan_buy") return "Plan Buy";
  if (action === "plan_sell") return "Plan Sell";
  return action.charAt(0).toUpperCase() + action.slice(1);
}

function formatDecisionDateTime(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function mapPositionLastAction(action: BackendTradeAction): Position["lastAction"] {
  if (action === "buy" || action === "plan_buy") return "Bought";
  if (action === "sell" || action === "plan_sell") return "Sold";
  if (action === "trim") return "Trimmed";
  return "Held";
}

function mapPosition(position: BackendPosition, decisions: BackendDecision[]): Position {
  const latestDecision = decisions.find((decision) => decision.aiDecision.symbol === position.symbol);
  const marketValue = Number((position.shares * position.price).toFixed(2));
  const costBasis = position.shares * position.averageCost;
  const dayChangePercent = costBasis > 0 ? Number((((marketValue - costBasis) / costBasis) * 100).toFixed(2)) : 0;

  return {
    symbol: position.symbol,
    name: position.name,
    shares: position.shares,
    price: position.price,
    marketValue,
    dayChangePercent,
    allocation: position.allocationPercent,
    aiSignal: latestDecision ? formatAction(latestDecision.aiDecision.action) : "No signal",
    lastAction: latestDecision ? mapPositionLastAction(latestDecision.aiDecision.action) : "Held",
    actionTime: latestDecision ? formatDecisionDateTime(latestDecision.createdAt) : "",
    actionPrice: latestDecision?.aiDecision.triggerPrice ?? position.price,
    aiThought: latestDecision?.aiDecision.reason ?? "No AI decision has been recorded for this open holding yet.",
  };
}

function enrichPositionsFromHistory(positions: Position[], history: TradeHistoryItem[]): Position[] {
  return positions.map((position) => {
    const latestHistoryItem = history.find((item) => item.symbol === position.symbol);
    if (!latestHistoryItem) return position;

    return {
      ...position,
      aiSignal: formatAction(latestHistoryItem.action),
      lastAction: mapPositionLastAction(latestHistoryItem.action),
      actionTime: formatDecisionDateTime(latestHistoryItem.occurredAt),
      actionPrice: latestHistoryItem.price ?? latestHistoryItem.triggerPrice ?? position.price,
      aiThought:
        latestHistoryItem.aiThought.reason ||
        latestHistoryItem.aiThought.summary ||
        latestHistoryItem.aiThought.riskNotes ||
        position.aiThought,
    };
  });
}

function mapPlan(plan: BackendTradePlan, positions: BackendPosition[]): TradePlan {
  const position = positions.find((item) => item.symbol === plan.symbol);

  return {
    id: plan.id,
    symbol: plan.symbol,
    name: position?.name ?? plan.symbol,
    side: plan.side === "buy" ? "Buy" : "Sell",
    triggerPrice: plan.triggerPrice,
    currentPrice: position?.price ?? plan.triggerPrice,
    quantity: plan.quantity,
    confidence: plan.confidence,
    status: plan.status,
    reason: plan.reason,
  };
}

export function mapPortfolioData(state: BackendTradingState, agentId: TradingAgentId = defaultTradingAgentId): PortfolioData {
  const positions = state.portfolio.positions.map((position) => mapPosition(position, state.decisions));
  const plans = state.tradePlans.map((plan) => mapPlan(plan, state.portfolio.positions));
  const investedCost = state.portfolio.positions.reduce((total, position) => total + position.shares * position.averageCost, 0);
  const investedValue = positions.reduce((total, position) => total + position.marketValue, 0);
  const totalReturn = Number((investedValue - investedCost).toFixed(2));
  const totalReturnPercent = investedCost > 0 ? Number(((totalReturn / investedCost) * 100).toFixed(2)) : 0;
  const dayChange = positions.length > 0 ? totalReturn : 0;
  const dayChangePercent = state.portfolio.totalValue > 0 ? Number(((dayChange / state.portfolio.totalValue) * 100).toFixed(2)) : 0;

  const mapped: PortfolioData = {
    ...emptyPortfolioData,
    account: {
      name: state.portfolio.accountId,
      mode: tradingAgentOptions.find((agent) => agent.id === agentId)?.label ?? "Neutral Agent",
      lastUpdated: new Date().toISOString(),
      cash: state.portfolio.cash,
      buyingPower: state.portfolio.buyingPower,
    },
    portfolio: {
      ...emptyPortfolioData.portfolio,
      totalValue: state.portfolio.totalValue,
      dayChange,
      dayChangePercent,
      totalReturn,
      totalReturnPercent,
      riskScore:
        positions.length > 0
          ? Math.round(Math.min(100, positions.reduce((total, position) => total + position.allocation, 0)))
          : 0,
    },
    performance: createPerformanceSeries(state.portfolio.totalValue, dayChange, positions.length > 0),
    positions,
    plans,
    watchlist: positions.map((position) => ({
      symbol: position.symbol,
      price: position.price,
      changePercent: position.dayChangePercent,
    })),
  };

  console.log("[frontend:mapPortfolioData] mapped backend state", {
    backendPositions: state.portfolio.positions.length,
    backendDecisions: state.decisions.length,
    backendPlans: state.tradePlans.length,
    backendExecutedTrades: state.executedTrades.length,
    selectedAgentId: agentId,
    backendAgentId: state.portfolio.agentId,
    accountId: state.portfolio.accountId,
    symbols: state.portfolio.positions.map((position) => position.symbol),
    mapped,
  });

  return mapped;
}

function createPerformanceSeries(totalValue: number, change: number, hasPositions: boolean): PortfolioData["performance"] {
  if (!hasPositions || totalValue <= 0) return emptyPortfolioData.performance;

  return {
    "1D": createRangePoints(["9:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "Now"], totalValue, change, 1),
    "1W": createRangePoints(["Mon", "Tue", "Wed", "Thu", "Now"], totalValue, change, 1.7),
    "1M": createRangePoints(["Week 1", "Week 2", "Week 3", "Week 4", "Now"], totalValue, change, 2.6),
    "3M": createRangePoints(["Month 1", "Month 2", "Now"], totalValue, change, 4.2),
    "1Y": createRangePoints(["Q1", "Q2", "Q3", "Q4", "Now"], totalValue, change, 7),
    ALL: createRangePoints(["Start", "Q2", "Q3", "Q4", "Now"], totalValue, change, 10),
  };
}

function createRangePoints(labels: string[], totalValue: number, rawChange: number, rangeMultiplier: number): PerformancePoint[] {
  const fallbackChange = totalValue * 0.006 * rangeMultiplier;
  const change = Math.abs(rawChange) > 1 ? rawChange * rangeMultiplier : fallbackChange;
  const start = totalValue - change;

  return labels.map((label, index) => {
    const progress = labels.length === 1 ? 1 : index / (labels.length - 1);
    const wave = index === labels.length - 1 ? 0 : Math.sin(progress * Math.PI * 2) * Math.abs(change) * 0.18;

    return {
      label,
      value: Number((start + change * progress + wave).toFixed(2)),
    };
  });
}

export async function loadTradingDashboard(agentId: TradingAgentId = defaultTradingAgentId) {
  console.log("[frontend:loadTradingDashboard] loading dashboard data");

  const state = await trpcQuery<BackendTradingState>("aiTrading.getState", { agentId });
  const tradeHistory = await trpcQuery<TradeHistoryResponse>("aiTrading.getTradeHistory", {
    accountId: state.portfolio.accountId,
    agentId,
    limit: 25,
  });

  console.log("[frontend:loadTradingDashboard] raw backend payloads", {
    selectedAgentId: agentId,
    accountId: state.portfolio.accountId,
    backendAgentId: state.portfolio.agentId,
    state,
    tradeHistory,
  });

  const data = mapPortfolioData(state, agentId);
  data.positions = enrichPositionsFromHistory(data.positions, tradeHistory.items);
  data.trades = tradeHistory.items.map((item) => ({
    time: formatDecisionDateTime(item.occurredAt),
    action: formatAction(item.action),
    symbol: item.symbol,
    quantity: item.quantity,
    price: item.price ?? item.triggerPrice ?? 0,
    reason: item.aiThought.reason,
    status: item.status,
    confidence: item.aiThought.confidence,
    riskNotes: item.aiThought.riskNotes,
    riskApproved: item.riskReview.approved,
    riskReasons: item.riskReview.reasons,
    journal: item.journal,
  }));

  console.log("[frontend:loadTradingDashboard] final frontend data", {
    selectedAgentId: agentId,
    accountId: data.account.name,
    positions: data.positions.length,
    plans: data.plans.length,
    trades: data.trades.length,
    data,
  });

  return data;
}
