import { randomUUID } from 'crypto';
import type { AiDecision, ExecutedTrade, RiskReview, TradePlan } from './types';

export function createTradeOutcome(decision: AiDecision, review: RiskReview, now = new Date()) {
  const createdAt = now.toISOString();

  if (!review.approved) {
    return {
      plan: decision.triggerPrice
        ? ({
            id: randomUUID(),
            symbol: decision.symbol,
            side: decision.action === 'plan_sell' ? 'sell' : 'buy',
            quantity: decision.quantity,
            triggerPrice: decision.triggerPrice,
            stopLossPrice: decision.stopLossPrice,
            takeProfitPrice: decision.takeProfitPrice,
            confidence: decision.confidence,
            status: 'blocked',
            reason: decision.reason,
            riskNotes: review.reasons.join(' '),
            createdAt,
          } satisfies TradePlan)
        : undefined,
      executedTrade: undefined,
    };
  }

  if (decision.action === 'plan_buy' || decision.action === 'plan_sell') {
    return {
      plan: {
        id: randomUUID(),
        symbol: decision.symbol,
        side: decision.action === 'plan_buy' ? 'buy' : 'sell',
        quantity: decision.quantity,
        triggerPrice: decision.triggerPrice ?? 0,
        stopLossPrice: decision.stopLossPrice,
        takeProfitPrice: decision.takeProfitPrice,
        confidence: decision.confidence,
        status: 'planned',
        reason: decision.reason,
        riskNotes: decision.riskNotes,
        createdAt,
      } satisfies TradePlan,
      executedTrade: undefined,
    };
  }

  if (decision.action === 'buy' || decision.action === 'sell' || decision.action === 'trim') {
    return {
      plan: undefined,
      executedTrade: {
        id: randomUUID(),
        symbol: decision.symbol,
        action: decision.action,
        quantity: decision.quantity,
        price: decision.triggerPrice ?? 0,
        stopLossPrice: decision.stopLossPrice,
        takeProfitPrice: decision.takeProfitPrice,
        executedAt: createdAt,
        reason: decision.reason,
      } satisfies ExecutedTrade,
    };
  }

  return { plan: undefined, executedTrade: undefined };
}
