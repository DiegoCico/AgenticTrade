import type { AiDecision, PortfolioState, RiskReview } from './types';

export function validateDecision(decision: AiDecision, portfolio: PortfolioState): RiskReview {
  const reasons: string[] = [];
  const position = portfolio.positions.find((item) => item.symbol === decision.symbol);
  const referencePrice = decision.triggerPrice ?? position?.price ?? 0;
  const tradeValue = referencePrice * decision.quantity;
  const maxTradeValue = portfolio.totalValue * (portfolio.maxTradeValuePercent / 100);

  if (decision.confidence < portfolio.minConfidence) {
    reasons.push(`Confidence ${decision.confidence} is below minimum ${portfolio.minConfidence}.`);
  }

  if ((decision.action === 'buy' || decision.action === 'plan_buy') && tradeValue > portfolio.buyingPower) {
    reasons.push('Trade value exceeds buying power.');
  }

  if ((decision.action === 'buy' || decision.action === 'plan_buy') && tradeValue > maxTradeValue) {
    reasons.push(`Trade value exceeds max trade size of ${portfolio.maxTradeValuePercent}% of portfolio.`);
  }

  if ((decision.action === 'sell' || decision.action === 'trim' || decision.action === 'plan_sell') && decision.quantity > (position?.shares ?? 0)) {
    reasons.push('Cannot sell or trim more shares than currently owned.');
  }

  if ((decision.action === 'buy' || decision.action === 'plan_buy') && (position?.allocationPercent ?? 0) >= portfolio.maxPositionPercent) {
    reasons.push(`Position is already at or above max allocation of ${portfolio.maxPositionPercent}%.`);
  }

  if ((decision.action === 'buy' || decision.action === 'plan_buy') && decision.stopLossPrice !== undefined && decision.stopLossPrice >= referencePrice) {
    reasons.push('Stop loss for a buy must be below the entry or trigger price.');
  }

  if ((decision.action === 'buy' || decision.action === 'plan_buy') && decision.takeProfitPrice !== undefined && decision.takeProfitPrice <= referencePrice) {
    reasons.push('Take profit for a buy must be above the entry or trigger price.');
  }

  if ((decision.action === 'sell' || decision.action === 'trim' || decision.action === 'plan_sell') && decision.stopLossPrice !== undefined && decision.stopLossPrice <= 0) {
    reasons.push('Stop loss must be a positive price.');
  }

  if ((decision.action === 'sell' || decision.action === 'trim' || decision.action === 'plan_sell') && decision.takeProfitPrice !== undefined && decision.takeProfitPrice <= 0) {
    reasons.push('Take profit must be a positive price.');
  }

  if (decision.action === 'hold' || decision.action === 'watch') {
    return {
      approved: true,
      finalAction: decision.action,
      reasons: ['No execution requested.'],
    };
  }

  return {
    approved: reasons.length === 0,
    finalAction: reasons.length === 0 ? decision.action : 'watch',
    reasons: reasons.length === 0 ? ['Approved by deterministic risk gate.'] : reasons,
  };
}
