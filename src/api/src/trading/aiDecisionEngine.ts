import type { AiDecision, MarketContext, PortfolioState, TradingSignal } from './types';

export const PROMPT_VERSION = 'trading-pipeline-v1';
export const MODEL_NAME = 'mock-policy-engine';

export type AiDecisionInput = {
  portfolio: PortfolioState;
  signals: TradingSignal[];
  marketContext: MarketContext;
};

export async function requestAiDecisions(input: AiDecisionInput): Promise<AiDecision[]> {
  return input.signals.map((signal) => {
    const position = input.portfolio.positions.find((item) => item.symbol === signal.symbol);
    const symbolContext = input.marketContext.perSymbol.find((item) => item.symbol === signal.symbol);
    const ownedShares = position?.shares ?? 0;
    const nearMaxAllocation = signal.positionAllocationPercent >= input.portfolio.maxPositionPercent * 0.85;
    const contextNote = symbolContext ? ` Market context: ${symbolContext.rationale}` : '';
    const contextBoost = symbolContext?.view === 'constructive' ? 3 : symbolContext?.view === 'cautious' ? -3 : 0;
    const plannedEntry = Number((signal.currentPrice * 0.985).toFixed(2));
    const stopLossPrice = Number((plannedEntry * 0.96).toFixed(2));
    const takeProfitPrice = Number((plannedEntry * 1.08).toFixed(2));

    if (signal.signal === 'bullish' && !nearMaxAllocation) {
      return {
        symbol: signal.symbol,
        action: 'plan_buy',
        quantity: Math.max(1, Math.floor((input.portfolio.totalValue * 0.025) / signal.currentPrice)),
        triggerPrice: plannedEntry,
        stopLossPrice,
        takeProfitPrice,
        confidence: Math.min(92, Math.round(68 + signal.momentumPercent * 3 + signal.volumeRatio * 2 + contextBoost)),
        reason: `${signal.symbol} has positive momentum with supportive volume, so the AI wants a pullback entry instead of chasing. Stop loss is set near ${stopLossPrice} and take profit near ${takeProfitPrice}.${contextNote}`,
        riskNotes: 'Cancel the plan if volatility expands, position allocation would exceed the max limit, or bracket levels become invalid.',
      };
    }

    if (signal.signal === 'bearish' && ownedShares > 0) {
      const trimQuantity = Math.max(1, Math.floor(ownedShares * 0.18));
      const protectiveStop = Number((signal.currentPrice * 0.97).toFixed(2));
      const reboundTakeProfit = Number((signal.currentPrice * 1.04).toFixed(2));
      return {
        symbol: signal.symbol,
        action: 'trim',
        quantity: trimQuantity,
        triggerPrice: signal.currentPrice,
        stopLossPrice: protectiveStop,
        takeProfitPrice: reboundTakeProfit,
        confidence: Math.min(88, Math.round(66 + signal.volatilityPercent * 2 - contextBoost)),
        reason: `${signal.symbol} is weakening or volatility is elevated, so the AI recommends reducing risk. Protective stop is near ${protectiveStop}; rebound profit target is near ${reboundTakeProfit}.${contextNote}`,
        riskNotes: 'Do not trim below strategic minimum exposure unless the stop is breached.',
      };
    }

    const holdStopLoss = position ? Number((signal.currentPrice * 0.94).toFixed(2)) : undefined;
    const holdTakeProfit = position ? Number((signal.currentPrice * 1.07).toFixed(2)) : undefined;

    return {
      symbol: signal.symbol,
      action: 'hold',
      quantity: 0,
      stopLossPrice: holdStopLoss,
      takeProfitPrice: holdTakeProfit,
      confidence: Math.max(60, Math.min(82, 70 + contextBoost)),
      reason: `${signal.symbol} does not have enough directional edge for a new trade right now.${position ? ` Monitoring stop loss near ${holdStopLoss} and take profit near ${holdTakeProfit}.` : ''}${contextNote}`,
      riskNotes: 'Keep monitoring for a cleaner entry or exit trigger.',
    };
  });
}
