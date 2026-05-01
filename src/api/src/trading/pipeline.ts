import { randomUUID } from 'crypto';
import { decisionLog, demoPortfolio, executedTrades, tradePlans } from './demoData';
import { getMarketSnapshot } from './marketData';
import { calculateSignals } from './signals';
import { MODEL_NAME, PROMPT_VERSION, requestAiDecisions } from './aiDecisionEngine';
import { validateDecision } from './riskValidator';
import { createTradeOutcome } from './tradePlanner';
import type { PipelineResult } from './types';

export type RunTradingPipelineInput = {
  symbols?: string[];
};

export async function runTradingPipeline(input: RunTradingPipelineInput = {}): Promise<PipelineResult> {
  const symbols = input.symbols?.length
    ? input.symbols.map((symbol) => symbol.toUpperCase())
    : demoPortfolio.positions.map((position) => position.symbol);
  const snapshot = await getMarketSnapshot(symbols);
  const signals = calculateSignals(demoPortfolio, snapshot);
  const aiDecisions = await requestAiDecisions({ portfolio: demoPortfolio, signals });

  const runDecisionLog = aiDecisions.map((aiDecision) => {
    const riskReview = validateDecision(aiDecision, demoPortfolio);
    const outcome = createTradeOutcome(aiDecision, riskReview);

    if (outcome.plan) tradePlans.unshift(outcome.plan);
    if (outcome.executedTrade) executedTrades.unshift(outcome.executedTrade);

    const entry = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      snapshotId: snapshot.snapshotId,
      promptVersion: PROMPT_VERSION,
      model: MODEL_NAME,
      input: {
        portfolio: demoPortfolio,
        signals,
      },
      aiDecision,
      riskReview,
    };

    decisionLog.unshift(entry);
    return entry;
  });

  return {
    portfolio: demoPortfolio,
    snapshot,
    signals,
    decisions: runDecisionLog,
    tradePlans,
    executedTrades,
  };
}

export function getTradingState(): Omit<PipelineResult, 'snapshot' | 'signals'> {
  return {
    portfolio: demoPortfolio,
    decisions: decisionLog,
    tradePlans,
    executedTrades,
  };
}
