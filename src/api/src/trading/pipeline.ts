import { randomUUID } from 'crypto';
import { decisionLog, demoPortfolio, executedTrades, tradePlans } from './demoData';
import { getMarketSnapshot } from './marketData';
import { calculateSignals } from './signals';
import { buildMarketContext } from './marketContext';
import { MODEL_NAME, PROMPT_VERSION, requestAiDecisions } from './aiDecisionEngine';
import { validateDecision } from './riskValidator';
import { createTradeOutcome } from './tradePlanner';
import { persistPipelineRun } from './tradingRepository';
import type { ExecutedTrade, PipelineResult, TradePlan } from './types';
import { getAlpacaPortfolioState } from './alpacaClient';
import { getDefaultStrategySymbols } from './strategy';

export type RunTradingPipelineInput = {
  symbols?: string[];
};

export async function runTradingPipeline(input: RunTradingPipelineInput = {}): Promise<PipelineResult> {
  console.log('[pipeline] runTradingPipeline input', input);
  const portfolio = (await getAlpacaPortfolioState()) ?? demoPortfolio;

  console.log('[pipeline] portfolio selected for AI input', {
    source: portfolio === demoPortfolio ? 'demo' : 'alpaca',
    accountId: portfolio.accountId,
    cash: portfolio.cash,
    buyingPower: portfolio.buyingPower,
    totalValue: portfolio.totalValue,
    positions: portfolio.positions,
  });

  const symbols = input.symbols?.length
    ? input.symbols.map((symbol) => symbol.toUpperCase())
    : getDefaultStrategySymbols(portfolio);

  console.log('[pipeline] resolved symbols', {
    symbols,
    symbolCount: symbols.length,
  });

  const snapshot = await getMarketSnapshot(symbols);
  console.log('[pipeline] market snapshot loaded', {
    snapshotId: snapshot.snapshotId,
    capturedAt: snapshot.capturedAt,
    candles: snapshot.candles.length,
  });

  const signals = calculateSignals(portfolio, snapshot);
  console.log('[pipeline] signals calculated', {
    signals,
  });

  const marketContext = await buildMarketContext({ portfolio, snapshot, signals });
  console.log('[pipeline] market context generated', {
    provider: marketContext.provider,
    model: marketContext.model,
    summary: marketContext.summary,
    themes: marketContext.themes,
    perSymbol: marketContext.perSymbol,
  });

  const aiDecisions = await requestAiDecisions({ portfolio, signals, marketContext });
  console.log('[pipeline] AI decisions generated', {
    decisions: aiDecisions,
  });

  const runTradePlans: TradePlan[] = [];
  const runExecutedTrades: ExecutedTrade[] = [];

  const runDecisionLog = aiDecisions.map((aiDecision) => {
    const riskReview = validateDecision(aiDecision, portfolio);
    const outcome = createTradeOutcome(aiDecision, riskReview);

    console.log('[pipeline] decision reviewed', {
      aiDecision,
      riskReview,
      plan: outcome.plan,
      executedTrade: outcome.executedTrade,
    });

    if (outcome.plan) {
      runTradePlans.unshift(outcome.plan);
      tradePlans.unshift(outcome.plan);
    }
    if (outcome.executedTrade) {
      runExecutedTrades.unshift(outcome.executedTrade);
      executedTrades.unshift(outcome.executedTrade);
    }

    const entry = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      snapshotId: snapshot.snapshotId,
      promptVersion: PROMPT_VERSION,
      model: MODEL_NAME,
      input: {
        portfolio,
        signals,
        marketContext,
      },
      aiDecision,
      riskReview,
    };

    decisionLog.unshift(entry);
    return entry;
  });

  await persistPipelineRun({
    portfolio,
    snapshot,
    decisions: runDecisionLog,
    tradePlans: runTradePlans,
    executedTrades: runExecutedTrades,
  });

  console.log('[pipeline] run complete', {
    decisions: runDecisionLog.length,
    newTradePlans: runTradePlans.length,
    newExecutedTrades: runExecutedTrades.length,
    totalTradePlansInMemory: tradePlans.length,
    totalExecutedTradesInMemory: executedTrades.length,
  });

  return {
    portfolio,
    snapshot,
    signals,
    marketContext,
    decisions: runDecisionLog,
    tradePlans,
    executedTrades,
  };
}

export async function getTradingState(): Promise<Omit<PipelineResult, 'snapshot' | 'signals' | 'marketContext'>> {
  const portfolio = (await getAlpacaPortfolioState()) ?? demoPortfolio;

  console.log('[pipeline] getTradingState portfolio selected', {
    source: portfolio === demoPortfolio ? 'demo' : 'alpaca',
    accountId: portfolio.accountId,
    cash: portfolio.cash,
    buyingPower: portfolio.buyingPower,
    totalValue: portfolio.totalValue,
    positions: portfolio.positions,
  });

  return {
    portfolio,
    decisions: decisionLog,
    tradePlans,
    executedTrades,
  };
}
