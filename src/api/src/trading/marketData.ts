import { getAlpacaMarketSnapshot, getDemoMarketSnapshot, getLastAlpacaMarketDataFailure } from './alpacaClient';
import { getConfig } from '../process';
import type { MarketSnapshot } from './types';

export async function getMarketSnapshot(symbols: string[]): Promise<MarketSnapshot> {
  console.log('[marketData] getMarketSnapshot input', {
    symbols,
  });

  const alpacaSnapshot = await getAlpacaMarketSnapshot(symbols);
  if (alpacaSnapshot) return alpacaSnapshot;

  const config = await getConfig();
  if (!config.DEMO_MODE) {
    const reason = getLastAlpacaMarketDataFailure() ?? 'No detailed Alpaca failure reason was recorded.';
    throw new Error(
      `Alpaca market data is unavailable and DEMO_MODE is disabled. Refusing to use demo market snapshot. Reason: ${reason}`,
    );
  }

  const demoSnapshot = getDemoMarketSnapshot(symbols);
  console.log('[marketData] using demo market snapshot', {
    snapshotId: demoSnapshot.snapshotId,
    symbols,
    candles: demoSnapshot.candles.length,
  });

  return demoSnapshot;
}
