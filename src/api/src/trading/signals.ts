import type { MarketSnapshot, PortfolioState, TradingSignal } from './types';

const BULLISH_MOMENTUM_PERCENT = 1;
const BULLISH_VOLUME_RATIO = 0.2;
const BEARISH_MOMENTUM_PERCENT = -1.2;
const BEARISH_VOLATILITY_PERCENT = 7.5;

export function calculateSignals(portfolio: PortfolioState, snapshot: MarketSnapshot): TradingSignal[] {
  const candlesBySymbol = new Map<string, typeof snapshot.candles>();

  for (const candle of snapshot.candles) {
    candlesBySymbol.set(candle.symbol, [...(candlesBySymbol.get(candle.symbol) ?? []), candle]);
  }

  return [...candlesBySymbol.entries()].map(([symbol, candles]) => {
    const sorted = [...candles].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const previous = sorted[sorted.length - 2] ?? first;
    const currentPrice = last.close;
    const momentumPercent = ((last.close - first.open) / first.open) * 100;
    const volatilityPercent = ((Math.max(...sorted.map((c) => c.high)) - Math.min(...sorted.map((c) => c.low))) / currentPrice) * 100;
    const volumeRatio = last.volume / Math.max(previous.volume, 1);
    const position = portfolio.positions.find((item) => item.symbol === symbol);
    const positionAllocationPercent = position?.allocationPercent ?? 0;

    let signal: TradingSignal['signal'] = 'neutral';
    if (momentumPercent > BULLISH_MOMENTUM_PERCENT && volumeRatio >= BULLISH_VOLUME_RATIO) signal = 'bullish';
    if (momentumPercent < BEARISH_MOMENTUM_PERCENT || (volatilityPercent > BEARISH_VOLATILITY_PERCENT && momentumPercent <= BULLISH_MOMENTUM_PERCENT)) {
      signal = 'bearish';
    }

    return {
      symbol,
      currentPrice,
      momentumPercent: Number(momentumPercent.toFixed(2)),
      volatilityPercent: Number(volatilityPercent.toFixed(2)),
      volumeRatio: Number(volumeRatio.toFixed(2)),
      positionAllocationPercent,
      signal,
    };
  });
}
