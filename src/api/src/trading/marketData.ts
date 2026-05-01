import { demoMarketSnapshot } from './demoData';
import type { MarketSnapshot } from './types';

export async function getMarketSnapshot(symbols: string[]): Promise<MarketSnapshot> {
  const requested = new Set(symbols.map((symbol) => symbol.toUpperCase()));

  return {
    ...demoMarketSnapshot,
    candles: demoMarketSnapshot.candles.filter((candle) => requested.has(candle.symbol)),
  };
}
