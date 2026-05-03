import { randomUUID } from 'crypto';
import { getConfig } from '../process';
import { demoMarketSnapshot, demoPortfolio } from './demoData';
import type { MarketCandle, MarketSnapshot, PortfolioState, Position } from './types';

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

type RuntimeConfig = Awaited<ReturnType<typeof getConfig>>;

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

async function alpacaFetch<T>(config: RuntimeConfig, baseUrl: string, path: string, searchParams?: Record<string, string>) {
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

  const response = await fetch(url, {
      method: 'GET',
    headers: alpacaHeaders(config),
  });

  const text = await response.text();
  console.log('[alpacaClient] response', {
    path,
    status: response.status,
    ok: response.ok,
    bodyPreview: text.slice(0, 500),
  });

  if (!response.ok) {
    throw new Error(`Alpaca request failed for ${path}: ${response.status} ${text}`);
  }

  return JSON.parse(text) as T;
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

export async function getAlpacaPortfolioState(): Promise<PortfolioState | undefined> {
  const config = await getConfig();

  if (!hasAlpacaCredentials(config)) {
    console.log('[alpacaClient] credentials missing; using demo portfolio');
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
      cash: portfolio.cash,
      buyingPower: portfolio.buyingPower,
      totalValue: portfolio.totalValue,
      positions: portfolio.positions,
    });

    return portfolio;
  } catch (error) {
    console.warn('[alpacaClient] failed to load Alpaca portfolio; using demo portfolio', error);
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
  return bars.map((bar) => ({
    symbol,
    timestamp: bar.t,
    open: bar.o,
    high: bar.h,
    low: bar.l,
    close: bar.c,
    volume: bar.v,
  }));
}

export async function getAlpacaMarketSnapshot(symbols: string[]): Promise<MarketSnapshot | undefined> {
  const config = await getConfig();

  const uniqueSymbols = [...new Set(symbols.map((symbol) => symbol.toUpperCase()))];

  if (!hasAlpacaCredentials(config) || uniqueSymbols.length === 0) {
    console.log('[alpacaClient] skipping Alpaca bars', {
      hasCredentials: hasAlpacaCredentials(config),
      symbols: uniqueSymbols,
    });
    return undefined;
  }

  try {
    const { start, end } = getRecentBarsWindow();
    const payload = await alpacaFetch<AlpacaBarsResponse>(config, config.ALPACA_DATA_URL, '/v2/stocks/bars', {
      symbols: uniqueSymbols.join(','),
      timeframe: '1Hour',
      start,
      end,
      limit: '12',
      adjustment: 'raw',
      feed: 'iex',
    });

    const candles = uniqueSymbols.flatMap((symbol) => mapBars(symbol, payload.bars?.[symbol] ?? []));

    if (candles.length === 0) {
      console.warn('[alpacaClient] Alpaca returned no bars; using demo market snapshot', {
        symbols: uniqueSymbols,
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
      candleCount: snapshot.candles.length,
    });

    return snapshot;
  } catch (error) {
    console.warn('[alpacaClient] failed to load Alpaca bars; using demo market snapshot', error);
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
