import { demoMarketSnapshot, demoPortfolio } from '../trading/demoData';
import { buildMarketContext } from '../trading/marketContext';
import { calculateSignals } from '../trading/signals';

describe('buildMarketContext', () => {
  it('returns deterministic market context when LLM market context is disabled', async () => {
    process.env.LLM_MARKET_CONTEXT_ENABLED = 'false';

    const signals = calculateSignals(demoPortfolio, demoMarketSnapshot);
    const context = await buildMarketContext({
      portfolio: demoPortfolio,
      snapshot: demoMarketSnapshot,
      signals,
    });

    expect(context.provider).toBe('deterministic-fallback');
    expect(context.model).toBe('local-rules');
    expect(context.summary).toContain('Market snapshot contains');
    expect(context.themes).toContain('Risk controls should account for elevated intraday volatility.');
    expect(context.perSymbol).toHaveLength(5);
    expect(context.perSymbol.find((item) => item.symbol === 'NVDA')).toMatchObject({
      view: 'constructive',
    });
  });
});
