import { randomUUID } from 'crypto';
import { decisionLog, demoPortfolio, executedTrades, tradePlans } from './demoData';
import { getMarketSnapshot } from './marketData';
import { calculateSignals } from './signals';
import { buildMarketContext } from './marketContext';
import { MODEL_NAME, PROMPT_VERSION, requestAiDecisions } from './aiDecisionEngine';
import { validateDecision } from './riskValidator';
import { createTradeOutcome } from './tradePlanner';
import { persistPipelineRun } from './tradingRepository';
import type { DecisionLogEntry, ExecutedTrade, PipelineResult, TradePlan } from './types';
import { getAlpacaPortfolioState, submitAlpacaBuyOrder } from './alpacaClient';
import { getDefaultStrategySymbols } from './strategy';
import { getConfig } from '../process';

export type RunTradingPipelineInput = {
  symbols?: string[];
};

async function getPortfolioForPipeline() {
  const [config, alpacaPortfolio] = await Promise.all([getConfig(), getAlpacaPortfolioState()]);

  if (alpacaPortfolio) {
    return {
      portfolio: alpacaPortfolio,
      source: 'alpaca',
    } as const;
  }

  if (config.DEMO_MODE) {
    return {
      portfolio: demoPortfolio,
      source: 'demo',
    } as const;
  }

  throw new Error('Alpaca portfolio is unavailable and DEMO_MODE is disabled. Refusing to use demo portfolio.');
}

export async function runTradingPipeline(input: RunTradingPipelineInput = {}): Promise<PipelineResult> {
  console.log('[pipeline] runTradingPipeline input', input);
  const { portfolio, source } = await getPortfolioForPipeline();

  console.log('[pipeline] portfolio selected for AI input', {
    source,
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

  const runDecisionLog: DecisionLogEntry[] = [];

  for (const aiDecision of aiDecisions) {
    const riskReview = validateDecision(aiDecision, portfolio);
    const outcome = createTradeOutcome(aiDecision, riskReview);
    const executedPlannedBuy =
      outcome.plan?.side === 'buy' && outcome.plan.status === 'planned'
        ? await submitAlpacaBuyOrder(outcome.plan)
        : undefined;

    console.log('[pipeline] decision reviewed', {
      aiDecision,
      riskReview,
      plan: outcome.plan,
      executedTrade: executedPlannedBuy ?? outcome.executedTrade,
    });

    if (outcome.plan && !executedPlannedBuy) {
      runTradePlans.unshift(outcome.plan);
      tradePlans.unshift(outcome.plan);
    }
    const executedTrade = executedPlannedBuy ?? outcome.executedTrade;
    if (executedTrade) {
      runExecutedTrades.unshift(executedTrade);
      executedTrades.unshift(executedTrade);
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
    runDecisionLog.push(entry);
  }

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
  const { portfolio, source } = await getPortfolioForPipeline();

  console.log('[pipeline] getTradingState portfolio selected', {
    source,
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
