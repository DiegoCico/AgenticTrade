import { getDemoMarketSnapshot } from '../trading/alpacaClient';

describe('getDemoMarketSnapshot', () => {
  it('filters demo candles to requested symbols only', () => {
    const snapshot = getDemoMarketSnapshot(['msft', 'spy']);

    expect(snapshot.snapshotId).toBe('snapshot-demo-2026-04-30-1335');
    expect(snapshot.candles).toHaveLength(6);
    expect([...new Set(snapshot.candles.map((candle) => candle.symbol))].sort()).toEqual(['MSFT', 'SPY']);
  });

  it('returns no candles for symbols outside the demo dataset', () => {
    const snapshot = getDemoMarketSnapshot(['XYZ']);

    expect(snapshot.candles).toEqual([]);
  });
});
