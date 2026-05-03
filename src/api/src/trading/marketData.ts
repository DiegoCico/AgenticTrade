import { getAlpacaMarketSnapshot, getDemoMarketSnapshot } from './alpacaClient';
import type { MarketSnapshot } from './types';

export async function getMarketSnapshot(symbols: string[]): Promise<MarketSnapshot> {
  console.log('[marketData] getMarketSnapshot input', {
    symbols,
  });

  const alpacaSnapshot = await getAlpacaMarketSnapshot(symbols);
  if (alpacaSnapshot) return alpacaSnapshot;

  const demoSnapshot = getDemoMarketSnapshot(symbols);
  console.log('[marketData] using demo market snapshot', {
    snapshotId: demoSnapshot.snapshotId,
    symbols,
    candles: demoSnapshot.candles.length,
  });

  return demoSnapshot;
}
