import {
  getBucketAllocationPercent,
  getDefaultStrategySymbols,
  getSelectedBuySymbols,
  getStrategyBucket,
  STRATEGY_TARGETS,
} from '../trading/strategy';
import { demoPortfolio } from '../trading/demoData';
import type { TradingSignal } from '../trading/types';

function signal(overrides: Partial<TradingSignal>): TradingSignal {
  return {
    symbol: 'MSFT',
    currentPrice: 420,
    momentumPercent: 2,
    volatilityPercent: 1,
    volumeRatio: 1.2,
    positionAllocationPercent: 0,
    signal: 'bullish',
    ...overrides,
  };
}

describe('strategy', () => {
  it('defines the ETF and stock allocation targets', () => {
    expect(STRATEGY_TARGETS.etfMinPercent).toBe(30);
    expect(STRATEGY_TARGETS.etfTargetPercent).toBe(35);
    expect(STRATEGY_TARGETS.etfMaxPercent).toBe(40);
    expect(STRATEGY_TARGETS.safeStockTargetPercent).toBe(32.5);
    expect(STRATEGY_TARGETS.aggressiveStockTargetPercent).toBe(32.5);
  });

  it('resolves the default universe from strategy symbols plus existing holdings', () => {
    expect(getDefaultStrategySymbols(demoPortfolio)).toEqual(
      expect.arrayContaining(['SPY', 'VOO', 'QQQ', 'VGT', 'MSFT', 'GOOGL', 'NVDA', 'SNOW', 'TCEHY']),
    );
  });

  it('classifies strategy symbols into buckets', () => {
    expect(getStrategyBucket('spy')).toBe('etf');
    expect(getStrategyBucket('VOO')).toBe('etf');
    expect(getStrategyBucket('MSFT')).toBe('safe_stock');
    expect(getStrategyBucket('GOOGL')).toBe('safe_stock');
    expect(getStrategyBucket('COIN')).toBe('aggressive_stock');
    expect(getStrategyBucket('SNOW')).toBe('aggressive_stock');
    expect(getStrategyBucket('XYZ')).toBe('unclassified');
  });

  it('calculates current allocation by bucket', () => {
    expect(getBucketAllocationPercent(demoPortfolio, 'etf')).toBe(23.1);
    expect(getBucketAllocationPercent(demoPortfolio, 'safe_stock')).toBe(16.2);
    expect(getBucketAllocationPercent(demoPortfolio, 'aggressive_stock')).toBe(37.5);
  });

  it('selects only the highest ranked bullish symbols within each bucket limit', () => {
    const selected = getSelectedBuySymbols([
      signal({ symbol: 'MSFT', momentumPercent: 2 }),
      signal({ symbol: 'AAPL', momentumPercent: 4 }),
      signal({ symbol: 'COST', momentumPercent: 3 }),
      signal({ symbol: 'JNJ', momentumPercent: 1.5 }),
      signal({ symbol: 'SPY', momentumPercent: 2 }),
      signal({ symbol: 'QQQ', momentumPercent: 4 }),
      signal({ symbol: 'VTI', momentumPercent: 3 }),
      signal({ symbol: 'TSLA', momentumPercent: -2, signal: 'bearish' }),
    ]);

    expect([...selected].sort()).toEqual(['AAPL', 'COST', 'MSFT', 'QQQ', 'VTI']);
  });
});
