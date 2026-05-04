import { z } from 'zod';
import { publicProcedure, router } from './trpc';
import { getTradingState, runTradingPipeline } from '../trading/pipeline';
import { getTradeHistory } from '../trading/tradingRepository';
import type { TradeHistoryItem, TradeHistoryResult } from '../trading/types';

async function getInMemoryTradeHistory(): Promise<TradeHistoryResult> {
  const state = await getTradingState();
  const accountId = state.portfolio.accountId;
  const items: TradeHistoryItem[] = [
    ...state.executedTrades.map((trade) => {
      const decision = state.decisions.find((entry) => entry.aiDecision.symbol === trade.symbol);
      const grossValue = Number((trade.quantity * trade.price).toFixed(2));

      return {
        id: trade.id,
        accountId,
        symbol: trade.symbol,
        action: trade.action,
        side: trade.action === 'buy' ? 'buy' : 'sell',
        status: 'executed',
        quantity: trade.quantity,
        price: trade.price,
        grossValue,
        netValue: grossValue,
        stopLossPrice: trade.stopLossPrice,
        takeProfitPrice: trade.takeProfitPrice,
        occurredAt: trade.executedAt,
        aiThought: {
          summary: decision?.input.marketContext.summary ?? trade.reason,
          reason: trade.reason,
          riskNotes: decision?.aiDecision.riskNotes ?? '',
          confidence: decision?.aiDecision.confidence ?? 0,
          model: decision?.model ?? 'unknown',
          promptVersion: decision?.promptVersion ?? 'unknown',
        },
        journal: decision?.aiDecision.journal,
        riskReview: decision?.riskReview ?? {
          approved: true,
          finalAction: trade.action,
          reasons: [],
        },
        marketContext: decision
          ? {
              snapshotId: decision.snapshotId,
              summary: decision.input.marketContext.summary,
              themes: decision.input.marketContext.themes,
            }
          : undefined,
      } satisfies TradeHistoryItem;
    }),
    ...state.tradePlans.map((plan) => {
      const decision = state.decisions.find((entry) => entry.aiDecision.symbol === plan.symbol);

      return {
        id: plan.id,
        accountId,
        symbol: plan.symbol,
        action: plan.side === 'buy' ? 'plan_buy' : 'plan_sell',
        side: plan.side,
        status: plan.status,
        quantity: plan.quantity,
        triggerPrice: plan.triggerPrice,
        stopLossPrice: plan.stopLossPrice,
        takeProfitPrice: plan.takeProfitPrice,
        occurredAt: plan.createdAt,
        aiThought: {
          summary: decision?.input.marketContext.summary ?? plan.reason,
          reason: plan.reason,
          riskNotes: plan.riskNotes,
          confidence: plan.confidence,
          model: decision?.model ?? 'unknown',
          promptVersion: decision?.promptVersion ?? 'unknown',
        },
        journal: decision?.aiDecision.journal,
        riskReview: decision?.riskReview ?? {
          approved: plan.status === 'planned',
          finalAction: plan.side === 'buy' ? 'plan_buy' : 'plan_sell',
          reasons: plan.status === 'blocked' ? [plan.riskNotes] : [],
        },
        marketContext: decision
          ? {
              snapshotId: decision.snapshotId,
              summary: decision.input.marketContext.summary,
              themes: decision.input.marketContext.themes,
            }
          : undefined,
      } satisfies TradeHistoryItem;
    }),
    ...state.decisions
      .filter((entry) => entry.aiDecision.action === 'hold' || entry.aiDecision.action === 'watch')
      .map((entry) => ({
        id: entry.id,
        accountId,
        symbol: entry.aiDecision.symbol,
        action: entry.aiDecision.action,
        status: entry.aiDecision.action === 'watch' ? 'watched' : 'held',
        quantity: entry.aiDecision.quantity,
        triggerPrice: entry.aiDecision.triggerPrice,
        stopLossPrice: entry.aiDecision.stopLossPrice,
        takeProfitPrice: entry.aiDecision.takeProfitPrice,
        occurredAt: entry.createdAt,
        aiThought: {
          summary: entry.input.marketContext.summary,
          reason: entry.aiDecision.reason,
          riskNotes: entry.aiDecision.riskNotes,
          confidence: entry.aiDecision.confidence,
          model: entry.model,
          promptVersion: entry.promptVersion,
        },
        journal: entry.aiDecision.journal,
        riskReview: entry.riskReview,
        marketContext: {
          snapshotId: entry.snapshotId,
          summary: entry.input.marketContext.summary,
          themes: entry.input.marketContext.themes,
        },
      }) satisfies TradeHistoryItem),
  ];

  return {
    items: items.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
  };
}

export const aiTradingRouter = router({
  getState: publicProcedure.query(() => getTradingState()),
  getPortfolio: publicProcedure.query(async () => (await getTradingState()).portfolio),
  getPositions: publicProcedure.query(async () => (await getTradingState()).portfolio.positions),
  getTradePlans: publicProcedure.query(async () => (await getTradingState()).tradePlans),
  getDecisions: publicProcedure.query(async () => (await getTradingState()).decisions),
  getTradeHistory: publicProcedure
    .input(
      z
        .object({
          accountId: z.string().min(1).optional(),
          symbol: z.string().min(1).optional(),
          from: z.string().min(1).optional(),
          to: z.string().min(1).optional(),
          limit: z.number().int().positive().max(100).optional(),
          cursor: z.string().min(1).optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      console.log('[aiTrading.getTradeHistory] input', input ?? {});

      try {
        const result = await getTradeHistory(input);
        console.log('[aiTrading.getTradeHistory] DynamoDB result', {
          input: input ?? {},
          items: result.items.length,
          nextCursor: result.nextCursor,
        });

        return result;
      } catch (error) {
        console.warn('[aiTrading.getTradeHistory] Falling back to in-memory history', error);
        const fallback = await getInMemoryTradeHistory();
        const symbol = input?.symbol?.toUpperCase();
        const items = symbol ? fallback.items.filter((item) => item.symbol === symbol) : fallback.items;

        console.log('[aiTrading.getTradeHistory] fallback result', {
          input: input ?? {},
          items: items.length,
        });

        return {
          items,
        };
      }
    }),
  evaluate: publicProcedure
    .input(
      z
        .object({
          symbols: z.array(z.string().min(1)).optional(),
        })
        .optional(),
    )
    .mutation(({ input }) => {
      console.log('[aiTrading.evaluate] input', input ?? {});
      return runTradingPipeline({ symbols: input?.symbols });
    }),
});
