import { requestAiDecisions } from '../trading/aiDecisionEngine';
import { demoPortfolio } from '../trading/demoData';
import type { MarketContext, TradingSignal } from '../trading/types';

const marketContext: MarketContext = {
  generatedAt: '2026-05-03T16:00:00.000Z',
  provider: 'test',
  model: 'test-model',
  summary: 'test context',
  themes: ['test theme'],
  perSymbol: [
    {
      symbol: 'MSFT',
      view: 'constructive',
      rationale: 'MSFT demand is constructive.',
    },
    {
      symbol: 'TSLA',
      view: 'cautious',
      rationale: 'TSLA momentum is weak.',
    },
  ],
};

function signal(overrides: Partial<TradingSignal>): TradingSignal {
  return {
    symbol: 'MSFT',
    currentPrice: 420,
    momentumPercent: 2,
    volatilityPercent: 1.2,
    volumeRatio: 1.2,
    positionAllocationPercent: 10,
    signal: 'bullish',
    ...overrides,
  };
}

describe('requestAiDecisions', () => {
  it('creates planned buy decisions for bullish symbols below max allocation', async () => {
    const [decision] = await requestAiDecisions({
      portfolio: demoPortfolio,
      signals: [signal({})],
      marketContext,
    });

    expect(decision).toMatchObject({
      symbol: 'MSFT',
      action: 'plan_buy',
      triggerPrice: 413.7,
      stopLossPrice: 397.15,
      takeProfitPrice: 446.8,
    });
    expect(decision.reason).toContain('Market context: MSFT demand is constructive.');
  });

  it('creates trim decisions for bearish owned symbols', async () => {
    const [decision] = await requestAiDecisions({
      portfolio: demoPortfolio,
      signals: [
        signal({
          symbol: 'TSLA',
          currentPrice: 177.92,
          momentumPercent: -2,
          volatilityPercent: 3,
          volumeRatio: 1.1,
          positionAllocationPercent: 9.1,
          signal: 'bearish',
        }),
      ],
      marketContext,
    });

    expect(decision).toMatchObject({
      symbol: 'TSLA',
      action: 'trim',
      quantity: 16,
      triggerPrice: 177.92,
    });
    expect(decision.reason).toContain('Market context: TSLA momentum is weak.');
  });

  it('creates hold decisions when there is no directional edge', async () => {
    const [decision] = await requestAiDecisions({
      portfolio: demoPortfolio,
      signals: [
        signal({
          symbol: 'SPY',
          currentPrice: 512.24,
          momentumPercent: 0.2,
          volatilityPercent: 1,
          volumeRatio: 1,
          positionAllocationPercent: 23.1,
          signal: 'neutral',
        }),
      ],
      marketContext,
    });

    expect(decision).toMatchObject({
      symbol: 'SPY',
      action: 'hold',
      quantity: 0,
    });
  });
});
