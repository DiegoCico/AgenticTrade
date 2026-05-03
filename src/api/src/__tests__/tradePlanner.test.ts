import { createTradeOutcome } from '../trading/tradePlanner';
import type { AiDecision, RiskReview } from '../trading/types';

const now = new Date('2026-05-03T16:00:00.000Z');

function decision(overrides: Partial<AiDecision>): AiDecision {
  return {
    symbol: 'MSFT',
    action: 'plan_buy',
    quantity: 3,
    triggerPrice: 410,
    stopLossPrice: 390,
    takeProfitPrice: 450,
    confidence: 78,
    reason: 'entry setup',
    riskNotes: 'risk is bounded',
    ...overrides,
  };
}

const approved: RiskReview = {
  approved: true,
  finalAction: 'plan_buy',
  reasons: ['Approved by deterministic risk gate.'],
};

describe('createTradeOutcome', () => {
  it('creates a planned trade for approved plan_buy decisions', () => {
    const outcome = createTradeOutcome(decision({}), approved, now);

    expect(outcome.executedTrade).toBeUndefined();
    expect(outcome.plan).toMatchObject({
      symbol: 'MSFT',
      side: 'buy',
      quantity: 3,
      triggerPrice: 410,
      status: 'planned',
      createdAt: '2026-05-03T16:00:00.000Z',
    });
  });

  it('creates an executed trade for approved trim decisions', () => {
    const outcome = createTradeOutcome(
      decision({
        action: 'trim',
        quantity: 2,
        triggerPrice: 420,
      }),
      {
        approved: true,
        finalAction: 'trim',
        reasons: ['Approved by deterministic risk gate.'],
      },
      now,
    );

    expect(outcome.plan).toBeUndefined();
    expect(outcome.executedTrade).toMatchObject({
      symbol: 'MSFT',
      action: 'trim',
      quantity: 2,
      price: 420,
      executedAt: '2026-05-03T16:00:00.000Z',
    });
  });

  it('creates a blocked plan when a rejected decision still has a trigger price', () => {
    const outcome = createTradeOutcome(
      decision({}),
      {
        approved: false,
        finalAction: 'watch',
        reasons: ['Trade value exceeds buying power.'],
      },
      now,
    );

    expect(outcome.executedTrade).toBeUndefined();
    expect(outcome.plan).toMatchObject({
      status: 'blocked',
      riskNotes: 'Trade value exceeds buying power.',
    });
  });
});
