import type { PortfolioState, TradingSignal } from './types';
import { STRATEGY_UNIVERSE } from './STRATEGY_UNIVERSE';

export type StrategyBucket = 'etf' | 'safe_stock' | 'aggressive_stock' | 'unclassified';

export type StrategySymbol = {
  symbol: string;
  bucket: Exclude<StrategyBucket, 'unclassified'>;
};

export const STRATEGY_TARGETS = {
  etfMinPercent: 30,
  etfTargetPercent: 35,
  etfMaxPercent: 40,
  safeStockTargetPercent: 32.5,
  aggressiveStockTargetPercent: 32.5,
  maxEtfPicks: 2,
  maxSafeStockPicks: 3,
  maxAggressiveStockPicks: 3,
} as const;

export { STRATEGY_UNIVERSE };

const symbolsByBucket = new Map(STRATEGY_UNIVERSE.map((item) => [item.symbol, item.bucket]));

export function getStrategyBucket(symbol: string): StrategyBucket {
  return symbolsByBucket.get(symbol.toUpperCase()) ?? 'unclassified';
}

export function getDefaultStrategySymbols(portfolio: PortfolioState): string[] {
  return [
    ...new Set([
      ...STRATEGY_UNIVERSE.map((item) => item.symbol),
      ...portfolio.positions.map((position) => position.symbol.toUpperCase()),
    ]),
  ];
}

export function getBucketAllocationPercent(portfolio: PortfolioState, bucket: StrategyBucket): number {
  if (bucket === 'unclassified') return 0;

  return portfolio.positions
    .filter((position) => getStrategyBucket(position.symbol) === bucket)
    .reduce((total, position) => total + position.allocationPercent, 0);
}

export function getBucketTargetPercent(bucket: StrategyBucket): number | undefined {
  if (bucket === 'etf') return STRATEGY_TARGETS.etfTargetPercent;
  if (bucket === 'safe_stock') return STRATEGY_TARGETS.safeStockTargetPercent;
  if (bucket === 'aggressive_stock') return STRATEGY_TARGETS.aggressiveStockTargetPercent;
  return undefined;
}

export function getBucketPickLimit(bucket: StrategyBucket): number {
  if (bucket === 'etf') return STRATEGY_TARGETS.maxEtfPicks;
  if (bucket === 'safe_stock') return STRATEGY_TARGETS.maxSafeStockPicks;
  if (bucket === 'aggressive_stock') return STRATEGY_TARGETS.maxAggressiveStockPicks;
  return Number.MAX_SAFE_INTEGER;
}

export function rankSignalsForStrategy(signals: TradingSignal[]): TradingSignal[] {
  return [...signals].sort((a, b) => strategyScore(b) - strategyScore(a));
}

export function getSelectedBuySymbols(signals: TradingSignal[]): Set<string> {
  const selected = new Set<string>();
  const buckets: StrategyBucket[] = ['etf', 'safe_stock', 'aggressive_stock', 'unclassified'];

  for (const bucket of buckets) {
    const picks = rankSignalsForStrategy(
      signals.filter((signal) => signal.signal === 'bullish' && getStrategyBucket(signal.symbol) === bucket),
    ).slice(0, getBucketPickLimit(bucket));

    for (const pick of picks) selected.add(pick.symbol);
  }

  return selected;
}

function strategyScore(signal: TradingSignal): number {
  return signal.momentumPercent * 2 + signal.volumeRatio * 3 - signal.volatilityPercent;
}
