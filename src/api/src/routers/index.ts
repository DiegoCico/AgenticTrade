import { router, publicProcedure } from './trpc';
import { aiTradingRouter } from './aiTrading';

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true })),
  aiTrading: aiTradingRouter,
});

export type AppRouter = typeof appRouter;
