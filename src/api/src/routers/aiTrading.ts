import { z } from 'zod';
import { publicProcedure, router } from './trpc';
import { getTradingState, runTradingPipeline } from '../trading/pipeline';

export const aiTradingRouter = router({
  getState: publicProcedure.query(() => getTradingState()),
  getPortfolio: publicProcedure.query(() => getTradingState().portfolio),
  getPositions: publicProcedure.query(() => getTradingState().portfolio.positions),
  getTradePlans: publicProcedure.query(() => getTradingState().tradePlans),
  getDecisions: publicProcedure.query(() => getTradingState().decisions),
  evaluate: publicProcedure
    .input(
      z
        .object({
          symbols: z.array(z.string().min(1)).optional(),
        })
        .optional(),
    )
    .mutation(({ input }) => runTradingPipeline({ symbols: input?.symbols })),
});
