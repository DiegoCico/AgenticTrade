import type { AiDecision, PortfolioState, TradingSignal } from './types';

export const PROMPT_VERSION = 'trading-pipeline-v1';
export const MODEL_NAME = 'mock-policy-engine';

export type AiDecisionInput = {
  portfolio: PortfolioState;
  signals: TradingSignal[];
};

export async function requestAiDecisions(input: AiDecisionInput): Promise<AiDecision[]> {
  return input.signals.map((signal) => {
    const position = input.portfolio.positions.find((item) => item.symbol === signal.symbol);
    const ownedShares = position?.shares ?? 0;
    const nearMaxAllocation = signal.positionAllocationPercent >= input.portfolio.maxPositionPercent * 0.85;

    if (signal.signal === 'bullish' && !nearMaxAllocation) {
      return {
        symbol: signal.symbol,
        action: 'plan_buy',
        quantity: Math.max(1, Math.floor((input.portfolio.totalValue * 0.025) / signal.currentPrice)),
        triggerPrice: Number((signal.currentPrice * 0.985).toFixed(2)),
        confidence: Math.min(92, Math.round(68 + signal.momentumPercent * 3 + signal.volumeRatio * 2)),
        reason: `${signal.symbol} has positive momentum with supportive volume, so the AI wants a pullback entry instead of chasing.`,
        riskNotes: 'Cancel the plan if volatility expands or position allocation would exceed the max limit.',
      };
    }

    if (signal.signal === 'bearish' && ownedShares > 0) {
      const trimQuantity = Math.max(1, Math.floor(ownedShares * 0.18));
      return {
        symbol: signal.symbol,
        action: 'trim',
        quantity: trimQuantity,
        confidence: Math.min(88, Math.round(66 + signal.volatilityPercent * 2)),
        reason: `${signal.symbol} is weakening or volatility is elevated, so the AI recommends reducing risk.`,
        riskNotes: 'Do not trim below strategic minimum exposure unless the stop is breached.',
      };
    }

    return {
      symbol: signal.symbol,
      action: 'hold',
      quantity: 0,
      confidence: 70,
      reason: `${signal.symbol} does not have enough directional edge for a new trade right now.`,
      riskNotes: 'Keep monitoring for a cleaner entry or exit trigger.',
    };
  });
}
