import { randomUUID } from 'crypto';
import { getConfig } from '../process';
import { demoMarketSnapshot, demoPortfolio } from './demoData';
import type { ExecutedTrade, MarketCandle, MarketSnapshot, PortfolioState, Position, TradePlan } from './types';
import type { TradingAgentId } from './strategy';
import { RateLimitError, withRateLimitRetry } from './rateLimitRetry';

type AlpacaAccount = {
  id?: string;
  cash?: string;
  buying_power?: string;
  portfolio_value?: string;
};

type AlpacaPosition = {
  symbol?: string;
  qty?: string;
  avg_entry_price?: string;
  current_price?: string;
  market_value?: string;
};

type AlpacaBar = {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

type AlpacaBarsResponse = {
  bars?: Record<string, AlpacaBar[]>;
};

type AlpacaOrder = {
  id?: string;
  client_order_id?: string;
  symbol?: string;
  qty?: string;
  side?: string;
  type?: string;
  status?: string;
  filled_avg_price?: string;
  limit_price?: string;
  submitted_at?: string;
};

type RuntimeConfig = Awaited<ReturnType<typeof getConfig>>;

let lastAlpacaMarketDataFailure: string | undefined;
const CANDLES_PER_SYMBOL = 12;
const MAX_ALPACA_BARS_LIMIT = 10000;

function hasAlpacaCredentials(config: RuntimeConfig) {
  return Boolean(config.ALPACA_API_KEY && config.ALPACA_SECRET_KEY);
}

function alpacaHeaders(config: RuntimeConfig) {
  return {
    'APCA-API-KEY-ID': config.ALPACA_API_KEY,
    'APCA-API-SECRET-KEY': config.ALPACA_SECRET_KEY,
    Accept: 'application/json',
  };
}

function numberFromString(value: string | undefined, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function alpacaFetch<T>(
  config: RuntimeConfig,
  baseUrl: string,
  path: string,
  searchParams?: Record<string, string>,
  init?: RequestInit,
) {
  const url = new URL(path, baseUrl);
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    url.searchParams.set(key, value);
  }

  console.log('[alpacaClient] request', {
    url: url.toString(),
    path,
    hasKey: Boolean(config.ALPACA_API_KEY),
    paper: config.ALPACA_PAPER,
  });

  const text = await withRateLimitRetry(`alpaca:${path}`, async (attempt) => {
    const { headers: initHeaders, ...restInit } = init ?? {};
    const response = await fetch(url, {
      method: 'GET',
      ...restInit,
      headers: {
        ...alpacaHeaders(config),
        ...initHeaders,
      },
    });

    const responseText = await response.text();
    console.log('[alpacaClient] response', {
      path,
      status: response.status,
      ok: response.ok,
      attempt,
      bodyPreview: responseText.slice(0, 500),
    });

    if (response.status === 429) {
      throw new RateLimitError(`Alpaca request rate limited for ${path}: ${response.status}`, {
        path,
        status: response.status,
        bodyPreview: responseText.slice(0, 500),
      });
    }

    if (!response.ok) {
      throw new Error(`Alpaca request failed for ${path}: ${response.status} ${responseText}`);
    }

    return responseText;
  });

  return JSON.parse(text) as T;
}

function priceString(value: number) {
  return value.toFixed(value >= 1 ? 2 : 4);
}

function getInvalidSymbolFromAlpacaError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/invalid symbol:\s*([A-Z0-9.:-]+)/i);

  return match?.[1]?.toUpperCase();
}

async function getBarsWithInvalidSymbolRetry(
  config: RuntimeConfig,
  symbols: string[],
  searchParams: Record<string, string>,
  invalidSymbols: Set<string>,
): Promise<AlpacaBarsResponse> {
  try {
    return await alpacaFetch<AlpacaBarsResponse>(config, config.ALPACA_DATA_URL, '/v2/stocks/bars', {
      ...searchParams,
      symbols: symbols.join(','),
    });
  } catch (error) {
    const invalidSymbol = getInvalidSymbolFromAlpacaError(error);
    if (!invalidSymbol || !symbols.includes(invalidSymbol)) throw error;

    invalidSymbols.add(invalidSymbol);
    const retrySymbols = symbols.filter((symbol) => symbol !== invalidSymbol);
    console.warn('[alpacaClient] removing invalid Alpaca symbol and retrying bars request', {
      invalidSymbol,
      remainingSymbols: retrySymbols.length,
    });

    if (retrySymbols.length === 0) throw error;

    return getBarsWithInvalidSymbolRetry(config, retrySymbols, searchParams, invalidSymbols);
  }
}

export function getLastAlpacaMarketDataFailure() {
  return lastAlpacaMarketDataFailure;
}

function positionName(symbol: string) {
  return demoPortfolio.positions.find((position) => position.symbol === symbol)?.name ?? symbol;
}

function mapPositions(positions: AlpacaPosition[], totalValue: number): Position[] {
  return positions
    .filter((position) => position.symbol)
    .map((position) => {
      const symbol = String(position.symbol).toUpperCase();
      const shares = numberFromString(position.qty);
      const averageCost = numberFromString(position.avg_entry_price);
      const price = numberFromString(position.current_price, averageCost);
      const marketValue = numberFromString(position.market_value, shares * price);
      const allocationPercent = totalValue > 0 ? Number(((marketValue / totalValue) * 100).toFixed(2)) : 0;

      return {
        symbol,
        name: positionName(symbol),
        shares,
        averageCost,
        price,
        allocationPercent,
      };
    });
}

export async function getAlpacaPortfolioState(agentId: TradingAgentId = 'neutral'): Promise<PortfolioState | undefined> {
  const config = await getConfig(agentId);

  if (!hasAlpacaCredentials(config)) {
    console.log('[alpacaClient] credentials missing; Alpaca portfolio unavailable');
    return undefined;
  }

  try {
    const [account, positions] = await Promise.all([
      alpacaFetch<AlpacaAccount>(config, config.ALPACA_BASE_URL, '/v2/account'),
      alpacaFetch<AlpacaPosition[]>(config, config.ALPACA_BASE_URL, '/v2/positions'),
    ]);

    const totalValue = numberFromString(account.portfolio_value, demoPortfolio.totalValue);
    const portfolio: PortfolioState = {
      accountId: account.id || demoPortfolio.accountId,
      agentId,
      cash: numberFromString(account.cash, demoPortfolio.cash),
      buyingPower: numberFromString(account.buying_power, demoPortfolio.buyingPower),
      totalValue,
      maxPositionPercent: demoPortfolio.maxPositionPercent,
      maxTradeValuePercent: demoPortfolio.maxTradeValuePercent,
      minConfidence: demoPortfolio.minConfidence,
      positions: mapPositions(positions, totalValue),
    };

    console.log('[alpacaClient] mapped portfolio for AI input', {
      accountId: portfolio.accountId,
      agent: agentId,
      cash: portfolio.cash,
      buyingPower: portfolio.buyingPower,
      totalValue: portfolio.totalValue,
      positions: portfolio.positions,
    });

    return portfolio;
  } catch (error) {
    console.warn('[alpacaClient] failed to load Alpaca portfolio', error);
    return undefined;
  }
}

function getRecentBarsWindow() {
  const end = new Date();
  const start = new Date(end.getTime() - 1000 * 60 * 60 * 24 * 7);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function mapBars(symbol: string, bars: AlpacaBar[]): MarketCandle[] {
  return bars.slice(-CANDLES_PER_SYMBOL).map((bar) => ({
    symbol,
    timestamp: bar.t,
    open: bar.o,
    high: bar.h,
    low: bar.l,
    close: bar.c,
    volume: bar.v,
  }));
}

export async function getAlpacaMarketSnapshot(
  symbols: string[],
  agentId: TradingAgentId = 'neutral',
): Promise<MarketSnapshot | undefined> {
  const config = await getConfig(agentId);

  const uniqueSymbols = [...new Set(symbols.map((symbol) => symbol.toUpperCase()))];
  lastAlpacaMarketDataFailure = undefined;

  if (!hasAlpacaCredentials(config)) {
    lastAlpacaMarketDataFailure = 'Alpaca credentials are missing.';
    console.log('[alpacaClient] skipping Alpaca bars', {
      hasCredentials: hasAlpacaCredentials(config),
      symbols: uniqueSymbols,
      agent: agentId,
    });
    return undefined;
  }

  if (uniqueSymbols.length === 0) {
    lastAlpacaMarketDataFailure = 'No symbols were requested.';
    console.log('[alpacaClient] skipping Alpaca bars', {
      hasCredentials: hasAlpacaCredentials(config),
      symbols: uniqueSymbols,
      agent: agentId,
    });
    return undefined;
  }

  try {
    const { start, end } = getRecentBarsWindow();
    const feed = config.ALPACA_DATA_FEED || 'iex';
    const invalidSymbols = new Set<string>();
    const requestedBarsLimit = Math.min(uniqueSymbols.length * CANDLES_PER_SYMBOL, MAX_ALPACA_BARS_LIMIT);
    const payload = await getBarsWithInvalidSymbolRetry(config, uniqueSymbols, {
      timeframe: '1Hour',
      start,
      end,
      limit: String(requestedBarsLimit),
      adjustment: 'raw',
      feed,
    }, invalidSymbols);

    const candles = uniqueSymbols.flatMap((symbol) => mapBars(symbol, payload.bars?.[symbol] ?? []));
    const returnedSymbols = Object.keys(payload.bars ?? {});

    if (candles.length === 0) {
      lastAlpacaMarketDataFailure = `Alpaca returned zero bars for ${uniqueSymbols.length} symbols using feed=${feed}, timeframe=1Hour, start=${start}, end=${end}, limit=${requestedBarsLimit}.`;
      console.warn('[alpacaClient] Alpaca returned no bars', {
        symbols: uniqueSymbols,
        feed,
        start,
        end,
        limit: requestedBarsLimit,
        returnedSymbols,
      });
      return undefined;
    }

    const snapshot = {
      snapshotId: `snapshot-alpaca-${randomUUID()}`,
      capturedAt: new Date().toISOString(),
      candles,
    };

    console.log('[alpacaClient] mapped market snapshot for AI input', {
      snapshotId: snapshot.snapshotId,
      symbols: uniqueSymbols,
      skippedInvalidSymbols: [...invalidSymbols],
      returnedSymbols,
      returnedSymbolCount: returnedSymbols.length,
      candleCount: snapshot.candles.length,
    });

    return snapshot;
  } catch (error) {
    lastAlpacaMarketDataFailure = error instanceof Error ? error.message : String(error);
    console.warn('[alpacaClient] failed to load Alpaca bars', error);
    return undefined;
  }
}

export async function submitAlpacaBuyOrder(plan: TradePlan, agentId: TradingAgentId = 'neutral'): Promise<ExecutedTrade | undefined> {
  const config = await getConfig(agentId);

  if (!hasAlpacaCredentials(config)) {
    console.warn('[alpacaClient] cannot submit Alpaca order; credentials missing', {
      symbol: plan.symbol,
      planId: plan.id,
      agent: agentId,
    });
    return undefined;
  }

  if (plan.side !== 'buy' || plan.status !== 'planned') {
    return undefined;
  }

  if (!plan.stopLossPrice || !plan.takeProfitPrice) {
    console.warn('[alpacaClient] cannot submit Alpaca buy order without bracket exits', {
      symbol: plan.symbol,
      planId: plan.id,
      stopLossPrice: plan.stopLossPrice,
      takeProfitPrice: plan.takeProfitPrice,
    });
    return undefined;
  }

  const body = {
    symbol: plan.symbol,
    side: 'buy',
    type: 'market',
    qty: String(plan.quantity),
    time_in_force: 'day',
    order_class: 'bracket',
    client_order_id: `agentictrade-${plan.id.replace(/-/g, '')}`,
    take_profit: {
      limit_price: priceString(plan.takeProfitPrice),
    },
    stop_loss: {
      stop_price: priceString(plan.stopLossPrice),
    },
  };

  console.log('[alpacaClient] submitting buy bracket order', {
    symbol: plan.symbol,
    quantity: plan.quantity,
    planId: plan.id,
    takeProfitPrice: plan.takeProfitPrice,
    stopLossPrice: plan.stopLossPrice,
    paper: config.ALPACA_PAPER,
    agent: agentId,
  });

  try {
    const order = await alpacaFetch<AlpacaOrder>(config, config.ALPACA_BASE_URL, '/v2/orders', undefined, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const submittedAt = order.submitted_at ?? new Date().toISOString();
    const submittedPrice =
      numberFromString(order.filled_avg_price) || numberFromString(order.limit_price) || plan.triggerPrice;

    console.log('[alpacaClient] buy bracket order submitted', {
      symbol: plan.symbol,
      planId: plan.id,
      orderId: order.id,
      status: order.status,
      type: order.type,
    });

    return {
      id: order.id || plan.id,
      symbol: plan.symbol,
      action: 'buy',
      quantity: plan.quantity,
      price: submittedPrice,
      stopLossPrice: plan.stopLossPrice,
      takeProfitPrice: plan.takeProfitPrice,
      executedAt: submittedAt,
      reason: plan.reason,
      brokerOrderId: order.id,
      brokerOrderStatus: order.status,
      brokerOrderType: order.type,
    };
  } catch (error) {
    console.warn('[alpacaClient] failed to submit Alpaca buy order', {
      symbol: plan.symbol,
      planId: plan.id,
      error,
    });
    return undefined;
  }
}

export function getDemoMarketSnapshot(symbols: string[]): MarketSnapshot {
  const requested = new Set(symbols.map((symbol) => symbol.toUpperCase()));

  return {
    ...demoMarketSnapshot,
    candles: demoMarketSnapshot.candles.filter((candle) => requested.has(candle.symbol)),
  };
}
