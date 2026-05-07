import type { PortfolioState, TradingSignal } from './types';
import { STRATEGY_UNIVERSE } from './STRATEGY_UNIVERSE';

export type StrategyBucket = 'etf' | 'safe_stock' | 'aggressive_stock' | 'unclassified';
export type TradingAgentId = 'conservative' | 'neutral' | 'aggressive';

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

export type StrategyTargets = {
  etfMinPercent: number;
  etfTargetPercent: number;
  etfMaxPercent: number;
  safeStockTargetPercent: number;
  aggressiveStockTargetPercent: number;
  maxEtfPicks: number;
  maxSafeStockPicks: number;
  maxAggressiveStockPicks: number;
};

export type TradingAgentProfile = {
  id: TradingAgentId;
  label: string;
  description: string;
  targets: StrategyTargets;
  buyConfidenceOffset: number;
  maxBuyVolatility: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  entryPullbackPercent: number;
  maxTradeValueMultiplier: number;
};

export const TRADING_AGENT_PROFILES: Record<TradingAgentId, TradingAgentProfile> = {
  conservative: {
    id: 'conservative',
    label: 'Conservative Agent',
    description: 'Prioritizes ETFs, dividend ETFs, and defensive high-dividend stocks.',
    targets: {
      etfMinPercent: 45,
      etfTargetPercent: 55,
      etfMaxPercent: 65,
      safeStockTargetPercent: 35,
      aggressiveStockTargetPercent: 10,
      maxEtfPicks: 4,
      maxSafeStockPicks: 4,
      maxAggressiveStockPicks: 1,
    },
    buyConfidenceOffset: 4,
    maxBuyVolatility: 5,
    stopLossPercent: 0.03,
    takeProfitPercent: 0.05,
    entryPullbackPercent: 0.01,
    maxTradeValueMultiplier: 0.65,
  },
  neutral: {
    id: 'neutral',
    label: 'Neutral Agent',
    description: 'Uses the current balanced ETF, safer-stock, and aggressive-stock sleeve mix.',
    targets: STRATEGY_TARGETS,
    buyConfidenceOffset: 0,
    maxBuyVolatility: 7.5,
    stopLossPercent: 0.04,
    takeProfitPercent: 0.08,
    entryPullbackPercent: 0.015,
    maxTradeValueMultiplier: 1,
  },
  aggressive: {
    id: 'aggressive',
    label: 'Aggressive Agent',
    description: 'Targets short-term 1-7 day stock purchases with tighter exits and more aggressive-stock capacity.',
    targets: {
      etfMinPercent: 15,
      etfTargetPercent: 20,
      etfMaxPercent: 30,
      safeStockTargetPercent: 25,
      aggressiveStockTargetPercent: 55,
      maxEtfPicks: 1,
      maxSafeStockPicks: 2,
      maxAggressiveStockPicks: 5,
    },
    buyConfidenceOffset: -5,
    maxBuyVolatility: 11,
    stopLossPercent: 0.035,
    takeProfitPercent: 0.055,
    entryPullbackPercent: 0.005,
    maxTradeValueMultiplier: 1.2,
  },
};

export const DEFAULT_TRADING_AGENT_ID: TradingAgentId = 'neutral';

export { STRATEGY_UNIVERSE };

const symbolsByBucket = new Map(STRATEGY_UNIVERSE.map((item) => [item.symbol, item.bucket]));

export function getTradingAgentProfile(agentId: TradingAgentId = DEFAULT_TRADING_AGENT_ID): TradingAgentProfile {
  return TRADING_AGENT_PROFILES[agentId] ?? TRADING_AGENT_PROFILES[DEFAULT_TRADING_AGENT_ID];
}

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

export function getBucketTargetPercent(bucket: StrategyBucket, agentId: TradingAgentId = DEFAULT_TRADING_AGENT_ID): number | undefined {
  const targets = getTradingAgentProfile(agentId).targets;
  if (bucket === 'etf') return targets.etfTargetPercent;
  if (bucket === 'safe_stock') return targets.safeStockTargetPercent;
  if (bucket === 'aggressive_stock') return targets.aggressiveStockTargetPercent;
  return undefined;
}

export function getBucketPickLimit(bucket: StrategyBucket, agentId: TradingAgentId = DEFAULT_TRADING_AGENT_ID): number {
  const targets = getTradingAgentProfile(agentId).targets;
  if (bucket === 'etf') return targets.maxEtfPicks;
  if (bucket === 'safe_stock') return targets.maxSafeStockPicks;
  if (bucket === 'aggressive_stock') return targets.maxAggressiveStockPicks;
  return Number.MAX_SAFE_INTEGER;
}

export function rankSignalsForStrategy(signals: TradingSignal[]): TradingSignal[] {
  return [...signals].sort((a, b) => strategyScore(b) - strategyScore(a));
}

export function getSelectedBuySymbols(signals: TradingSignal[], agentId: TradingAgentId = DEFAULT_TRADING_AGENT_ID): Set<string> {
  const selected = new Set<string>();
  const buckets: StrategyBucket[] = ['etf', 'safe_stock', 'aggressive_stock', 'unclassified'];

  for (const bucket of buckets) {
    const picks = rankSignalsForStrategy(
      signals.filter((signal) => signal.signal === 'bullish' && getStrategyBucket(signal.symbol) === bucket),
    ).slice(0, getBucketPickLimit(bucket, agentId));

    for (const pick of picks) selected.add(pick.symbol);
  }

  return selected;
}

function strategyScore(signal: TradingSignal): number {
  return signal.momentumPercent * 2 + signal.volumeRatio * 3 - signal.volatilityPercent;
}
