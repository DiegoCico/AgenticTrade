import type { AiDecision, DecisionJournal, LlmInfluence, MarketContext, PortfolioState, TradingSignal } from './types';
import {
  getBucketAllocationPercent,
  getBucketTargetPercent,
  getSelectedBuySymbols,
  getStrategyBucket,
} from './strategy';

export const PROMPT_VERSION = 'trading-pipeline-v1';
export const MODEL_NAME = 'mock-policy-engine';

const MIN_BUY_CONFIDENCE = 75;
const MIN_TRIM_CONFIDENCE = 72;
const STRONG_BUY_MOMENTUM = 1.8;
const STRONG_BUY_VOLUME_RATIO = 1.1;
const MAX_BUY_VOLATILITY = 3.5;
const STRONG_SELL_MOMENTUM = -1.8;
const STRONG_RISK_VOLATILITY = 4;

export type AiDecisionInput = {
  portfolio: PortfolioState;
  signals: TradingSignal[];
  marketContext: MarketContext;
};

export async function requestAiDecisions(input: AiDecisionInput): Promise<AiDecision[]> {
  const selectedBuySymbols = getSelectedBuySymbols(input.signals);

  return input.signals.map((signal) => {
    const position = input.portfolio.positions.find((item) => item.symbol === signal.symbol);
    const symbolContext = input.marketContext.perSymbol.find((item) => item.symbol === signal.symbol);
    const ownedShares = position?.shares ?? 0;
    const nearMaxAllocation = signal.positionAllocationPercent >= input.portfolio.maxPositionPercent * 0.85;
    const contextNote = symbolContext ? ` Market context: ${symbolContext.rationale}` : '';
    const llmInfluence = getLlmInfluence(symbolContext);
    const plannedEntry = Number((signal.currentPrice * 0.985).toFixed(2));
    const stopLossPrice = Number((plannedEntry * 0.96).toFixed(2));
    const takeProfitPrice = Number((plannedEntry * 1.08).toFixed(2));
    const bucket = getStrategyBucket(signal.symbol);
    const bucketTarget = getBucketTargetPercent(bucket);
    const bucketAllocation = getBucketAllocationPercent(input.portfolio, bucket);
    const bucketRemainingPercent = bucketTarget === undefined ? undefined : bucketTarget - bucketAllocation;
    const selectedBucketBuys = input.signals.filter(
      (item) => selectedBuySymbols.has(item.symbol) && getStrategyBucket(item.symbol) === bucket,
    ).length;
    const targetTradePercent =
      bucketRemainingPercent === undefined
        ? 2.5
        : Math.min(input.portfolio.maxTradeValuePercent, bucketRemainingPercent / Math.max(selectedBucketBuys, 1));
    const plannedQuantity = Math.max(1, Math.floor((input.portfolio.totalValue * (targetTradePercent / 100)) / signal.currentPrice));
    const preLlmBuyConfidence = Math.round(68 + signal.momentumPercent * 3 + signal.volumeRatio * 2);
    const buyConfidence = Math.min(92, preLlmBuyConfidence + llmInfluence.confidenceAdjustment);
    const preLlmTrimConfidence = Math.round(66 + signal.volatilityPercent * 2);
    const trimConfidence = Math.min(88, preLlmTrimConfidence - llmInfluence.confidenceAdjustment);
    const strongBuySignal =
      signal.momentumPercent >= STRONG_BUY_MOMENTUM &&
      signal.volumeRatio >= STRONG_BUY_VOLUME_RATIO &&
      signal.volatilityPercent <= MAX_BUY_VOLATILITY;
    const strongTrimSignal = signal.momentumPercent <= STRONG_SELL_MOMENTUM || signal.volatilityPercent >= STRONG_RISK_VOLATILITY;
    const baseCheckpoints = [
      `bucket=${bucket}`,
      `signal=${signal.signal}`,
      `momentum=${signal.momentumPercent}`,
      `volatility=${signal.volatilityPercent}`,
      `volumeRatio=${signal.volumeRatio}`,
      `bucketRemainingPercent=${bucketRemainingPercent === undefined ? 'n/a' : Number(bucketRemainingPercent.toFixed(2))}`,
      `llmOpportunity=${llmInfluence.opportunityScore}`,
      `llmRisk=${llmInfluence.riskScore}`,
      `llmConfidence=${llmInfluence.confidenceScore}`,
    ];

    if (
      signal.signal === 'bullish' &&
      strongBuySignal &&
      buyConfidence >= MIN_BUY_CONFIDENCE &&
      !nearMaxAllocation &&
      selectedBuySymbols.has(signal.symbol) &&
      (bucketRemainingPercent === undefined || bucketRemainingPercent > 0)
    ) {
      const journal = createJournal({
        bucket,
        signal,
        preLlmConfidence: preLlmBuyConfidence,
        finalConfidence: buyConfidence,
        llmInfluence,
        noTradeBiasApplied: false,
        executionPlan: `Plan a pullback buy at ${plannedEntry}, stop at ${stopLossPrice}, take profit at ${takeProfitPrice}.`,
        checkpoints: [
          ...baseCheckpoints,
          `strongBuySignal=${strongBuySignal}`,
          `minBuyConfidence=${MIN_BUY_CONFIDENCE}`,
          `selectedByStrategy=true`,
        ],
      });

      return {
        symbol: signal.symbol,
        action: 'plan_buy',
        quantity: plannedQuantity,
        triggerPrice: plannedEntry,
        stopLossPrice,
        takeProfitPrice,
        confidence: buyConfidence,
        reason: `${signal.symbol} was selected for the ${bucket.replace('_', ' ')} sleeve because it passed the strong-signal and high-confidence no-trade gate. The target strategy keeps ETFs near 35% of the portfolio, safer stocks near half of the stock sleeve, and aggressive stocks near the other half. Stop loss is set near ${stopLossPrice} and take profit near ${takeProfitPrice}.${contextNote}`,
        riskNotes: 'Cancel the plan if volatility expands, bucket allocation would exceed the strategy target, position allocation would exceed the max limit, or bracket levels become invalid.',
        journal,
      };
    }

    if (signal.signal === 'bearish' && ownedShares > 0 && strongTrimSignal && trimConfidence >= MIN_TRIM_CONFIDENCE) {
      const trimQuantity = Math.max(1, Math.floor(ownedShares * 0.18));
      const protectiveStop = Number((signal.currentPrice * 0.97).toFixed(2));
      const reboundTakeProfit = Number((signal.currentPrice * 1.04).toFixed(2));
      const journal = createJournal({
        bucket,
        signal,
        preLlmConfidence: preLlmTrimConfidence,
        finalConfidence: trimConfidence,
        llmInfluence,
        noTradeBiasApplied: false,
        executionPlan: `Trim ${trimQuantity} shares at ${signal.currentPrice}; monitor protective stop ${protectiveStop} and rebound target ${reboundTakeProfit}.`,
        checkpoints: [...baseCheckpoints, `strongTrimSignal=${strongTrimSignal}`, `minTrimConfidence=${MIN_TRIM_CONFIDENCE}`],
      });

      return {
        symbol: signal.symbol,
        action: 'trim',
        quantity: trimQuantity,
        triggerPrice: signal.currentPrice,
        stopLossPrice: protectiveStop,
        takeProfitPrice: reboundTakeProfit,
        confidence: trimConfidence,
        reason: `${signal.symbol} is weakening or volatility is elevated, so the AI recommends reducing risk. Protective stop is near ${protectiveStop}; rebound profit target is near ${reboundTakeProfit}.${contextNote}`,
        riskNotes: 'Do not trim below strategic minimum exposure unless the stop is breached.',
        journal,
      };
    }

    const holdStopLoss = position ? Number((signal.currentPrice * 0.94).toFixed(2)) : undefined;
    const holdTakeProfit = position ? Number((signal.currentPrice * 1.07).toFixed(2)) : undefined;

    const holdConfidence = Math.max(60, Math.min(82, 70 + llmInfluence.confidenceAdjustment));
    const noTradeReasons = getNoTradeReasons({
      signal,
      selected: selectedBuySymbols.has(signal.symbol),
      nearMaxAllocation,
      bucketRemainingPercent,
      strongBuySignal,
      buyConfidence,
      strongTrimSignal,
      trimConfidence,
      ownedShares,
    });
    const journal = createJournal({
      bucket,
      signal,
      preLlmConfidence: signal.signal === 'bearish' ? preLlmTrimConfidence : preLlmBuyConfidence,
      finalConfidence: signal.signal === 'bearish' ? trimConfidence : buyConfidence,
      llmInfluence,
      noTradeBiasApplied: true,
      executionPlan: 'No trade. Keep monitoring until signal strength and confidence clear the trade gate.',
      checkpoints: [...baseCheckpoints, ...noTradeReasons],
    });

    return {
      symbol: signal.symbol,
      action: 'hold',
      quantity: 0,
      stopLossPrice: holdStopLoss,
      takeProfitPrice: holdTakeProfit,
      confidence: holdConfidence,
      reason: `${signal.symbol} is a no-trade decision because ${noTradeReasons.join(' ')}${position ? ` Monitoring stop loss near ${holdStopLoss} and take profit near ${holdTakeProfit}.` : ''}${contextNote}`,
      riskNotes: 'No-trade bias is active: wait for a strong signal, high confidence, valid bucket capacity, and risk validation before planning execution.',
      journal,
    };
  });
}

function getLlmInfluence(symbolContext: MarketContext['perSymbol'][number] | undefined): LlmInfluence {
  const viewAdjustment = symbolContext?.view === 'constructive' ? 3 : symbolContext?.view === 'cautious' ? -3 : 0;
  const opportunityAdjustment = Math.round(((symbolContext?.scores.opportunity ?? 50) - 50) / 10);
  const riskAdjustment = -Math.round(((symbolContext?.scores.risk ?? 50) - 50) / 12);
  const confidenceAdjustment = Math.max(-8, Math.min(8, viewAdjustment + opportunityAdjustment + riskAdjustment));

  return {
    view: symbolContext?.view ?? 'missing',
    opportunityScore: symbolContext?.scores.opportunity ?? 50,
    riskScore: symbolContext?.scores.risk ?? 50,
    confidenceScore: symbolContext?.scores.confidence ?? 50,
    confidenceAdjustment,
    noTradeBiasApplied: false,
  };
}

function signalStrength(signal: TradingSignal): DecisionJournal['signalStrength'] {
  if (signal.signal === 'bullish' && signal.momentumPercent >= STRONG_BUY_MOMENTUM && signal.volumeRatio >= STRONG_BUY_VOLUME_RATIO) {
    return 'strong';
  }
  if (signal.signal === 'bearish' && (signal.momentumPercent <= STRONG_SELL_MOMENTUM || signal.volatilityPercent >= STRONG_RISK_VOLATILITY)) {
    return 'strong';
  }
  if (signal.signal !== 'neutral') return 'moderate';
  return 'weak';
}

function createJournal(input: {
  bucket: string;
  signal: TradingSignal;
  preLlmConfidence: number;
  finalConfidence: number;
  llmInfluence: LlmInfluence;
  noTradeBiasApplied: boolean;
  executionPlan: string;
  checkpoints: string[];
}): DecisionJournal {
  return {
    strategyBucket: input.bucket,
    signal: input.signal.signal,
    preLlmConfidence: input.preLlmConfidence,
    finalConfidence: input.finalConfidence,
    signalStrength: signalStrength(input.signal),
    noTradeBias: input.noTradeBiasApplied
      ? 'Applied. The system defaults to hold unless signal strength, confidence, allocation, and risk checks all pass.'
      : 'Cleared. Signal strength, confidence, allocation, and risk checks allowed an execution plan.',
    executionPlan: input.executionPlan,
    llmInfluence: {
      ...input.llmInfluence,
      noTradeBiasApplied: input.noTradeBiasApplied,
    },
    checkpoints: input.checkpoints,
  };
}

function getNoTradeReasons(input: {
  signal: TradingSignal;
  selected: boolean;
  nearMaxAllocation: boolean;
  bucketRemainingPercent: number | undefined;
  strongBuySignal: boolean;
  buyConfidence: number;
  strongTrimSignal: boolean;
  trimConfidence: number;
  ownedShares: number;
}) {
  const reasons: string[] = [];

  if (input.signal.signal === 'bullish') {
    if (!input.strongBuySignal) reasons.push('bullish setup is not strong enough.');
    if (input.buyConfidence < MIN_BUY_CONFIDENCE) reasons.push(`confidence ${input.buyConfidence} is below buy threshold ${MIN_BUY_CONFIDENCE}.`);
    if (!input.selected) reasons.push('symbol was not a top ranked candidate in its sleeve.');
    if (input.nearMaxAllocation) reasons.push('position is near max allocation.');
    if (input.bucketRemainingPercent !== undefined && input.bucketRemainingPercent <= 0) reasons.push('strategy sleeve has no remaining allocation room.');
  } else if (input.signal.signal === 'bearish') {
    if (input.ownedShares <= 0) reasons.push('bearish symbol is not currently owned.');
    if (!input.strongTrimSignal) reasons.push('bearish setup is not strong enough to trim.');
    if (input.trimConfidence < MIN_TRIM_CONFIDENCE) reasons.push(`confidence ${input.trimConfidence} is below trim threshold ${MIN_TRIM_CONFIDENCE}.`);
  } else {
    reasons.push('signal is neutral.');
  }

  return reasons.length > 0 ? reasons : ['no-trade bias held because execution criteria were incomplete.'];
}
