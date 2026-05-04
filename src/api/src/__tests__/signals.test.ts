import { demoMarketSnapshot, demoPortfolio } from '../trading/demoData';
import { calculateSignals } from '../trading/signals';

describe('calculateSignals', () => {
  it('calculates one signal per symbol in the market snapshot', () => {
    const signals = calculateSignals(demoPortfolio, demoMarketSnapshot);

    expect(signals).toHaveLength(12);
    expect(signals.map((signal) => signal.symbol).sort()).toEqual([
      'AAPL',
      'AMD',
      'COIN',
      'COST',
      'JNJ',
      'MSFT',
      'NVDA',
      'PLTR',
      'QQQ',
      'SPY',
      'TSLA',
      'VTI',
    ]);
  });

  it('marks strong positive momentum and volume as bullish', () => {
    const signals = calculateSignals(demoPortfolio, demoMarketSnapshot);
    const nvda = signals.find((signal) => signal.symbol === 'NVDA');

    expect(nvda).toMatchObject({
      symbol: 'NVDA',
      currentPrice: 928.36,
      positionAllocationPercent: 21.2,
      signal: 'bullish',
    });
    expect(nvda?.momentumPercent).toBeGreaterThan(1.2);
    expect(nvda?.volumeRatio).toBeGreaterThan(1.05);
  });

  it('marks negative momentum as bearish', () => {
    const signals = calculateSignals(demoPortfolio, demoMarketSnapshot);
    const tsla = signals.find((signal) => signal.symbol === 'TSLA');

    expect(tsla).toMatchObject({
      symbol: 'TSLA',
      signal: 'bearish',
      positionAllocationPercent: 9.1,
    });
    expect(tsla?.momentumPercent).toBeLessThan(-1.2);
  });
});
