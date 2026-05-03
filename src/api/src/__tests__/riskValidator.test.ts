import { demoPortfolio } from '../trading/demoData';
import { validateDecision } from '../trading/riskValidator';
import type { AiDecision } from '../trading/types';

function decision(overrides: Partial<AiDecision>): AiDecision {
  return {
    symbol: 'NVDA',
    action: 'plan_buy',
    quantity: 1,
    triggerPrice: 900,
    stopLossPrice: 850,
    takeProfitPrice: 990,
    confidence: 80,
    reason: 'test decision',
    riskNotes: 'test risk',
    ...overrides,
  };
}

describe('validateDecision', () => {
  it('approves a valid planned buy inside portfolio limits', () => {
    const review = validateDecision(decision({}), demoPortfolio);

    expect(review).toEqual({
      approved: true,
      finalAction: 'plan_buy',
      reasons: ['Approved by deterministic risk gate.'],
    });
  });

  it('blocks low-confidence trades and changes final action to watch', () => {
    const review = validateDecision(decision({ confidence: 20 }), demoPortfolio);

    expect(review.approved).toBe(false);
    expect(review.finalAction).toBe('watch');
    expect(review.reasons).toContain('Confidence 20 is below minimum 65.');
  });

  it('blocks sells larger than the current position', () => {
    const review = validateDecision(
      decision({
        action: 'sell',
        quantity: 999,
        triggerPrice: 928.36,
        stopLossPrice: 900,
        takeProfitPrice: 950,
      }),
      demoPortfolio,
    );

    expect(review.approved).toBe(false);
    expect(review.reasons).toContain('Cannot sell or trim more shares than currently owned.');
  });

  it('allows hold decisions without execution', () => {
    const review = validateDecision(
      decision({
        action: 'hold',
        quantity: 0,
        triggerPrice: undefined,
      }),
      demoPortfolio,
    );

    expect(review).toEqual({
      approved: true,
      finalAction: 'hold',
      reasons: ['No execution requested.'],
    });
  });
});
