import type {
  PortfolioData,
  Position,
  TradeHistoryResponse,
  TradePlan,
} from "../types/portfolio";

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
    url.searchParams.set("input", JSON.stringify({ json: input }));
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
    lastAction: latestDecision?.aiDecision.action === "buy" || latestDecision?.aiDecision.action === "plan_buy" ? "Bought" : latestDecision?.aiDecision.action === "sell" || latestDecision?.aiDecision.action === "plan_sell" ? "Sold" : latestDecision?.aiDecision.action === "trim" ? "Trimmed" : "Held",
    actionTime: latestDecision ? formatDecisionDateTime(latestDecision.createdAt) : "",
    actionPrice: latestDecision?.aiDecision.triggerPrice ?? position.price,
    aiThought: latestDecision?.aiDecision.reason ?? "",
  };
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

export function mapPortfolioData(state: BackendTradingState): PortfolioData {
  const positions = state.portfolio.positions.map((position) => mapPosition(position, state.decisions));
  const plans = state.tradePlans.map((plan) => mapPlan(plan, state.portfolio.positions));

  const mapped: PortfolioData = {
    ...emptyPortfolioData,
    account: {
      name: state.portfolio.accountId,
      mode: "paper",
      lastUpdated: new Date().toISOString(),
      cash: state.portfolio.cash,
      buyingPower: state.portfolio.buyingPower,
    },
    portfolio: {
      ...emptyPortfolioData.portfolio,
      totalValue: state.portfolio.totalValue,
      riskScore:
        positions.length > 0
          ? Math.round(Math.min(100, positions.reduce((total, position) => total + position.allocation, 0)))
          : 0,
    },
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
    mapped,
  });

  return mapped;
}

export async function loadTradingDashboard() {
  console.log("[frontend:loadTradingDashboard] loading dashboard data");

  const state = await trpcQuery<BackendTradingState>("aiTrading.getState");
  const tradeHistory = await trpcQuery<TradeHistoryResponse>("aiTrading.getTradeHistory", {
    accountId: state.portfolio.accountId,
    limit: 25,
  });

  console.log("[frontend:loadTradingDashboard] raw backend payloads", {
    state,
    tradeHistory,
  });

  const data = mapPortfolioData(state);
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
    positions: data.positions.length,
    plans: data.plans.length,
    trades: data.trades.length,
    data,
  });

  return data;
}
