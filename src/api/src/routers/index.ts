import { router, publicProcedure, mergeRouters } from './trpc';

import { helloRouter } from './hello';
import { authRouter } from './auth';
import { plannerRouter } from './planner';
import { plaidRouter } from './plaid';
import { investmentsRouter } from './investments';
import { categoriesRouter } from './categories';
import { dashboardRouter } from './dashboard';
import { transactionsRouter } from './transactions';
import { budgetsRouter } from './budgets';

const coreRouter = router({
  health: publicProcedure.query(() => ({ ok: true })),
});

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true })),
  hello: helloRouter,
  auth: authRouter,
  planner: plannerRouter,
  plaid: plaidRouter,
  investments: investmentsRouter,
  categories: categoriesRouter,
  dashboard: dashboardRouter,
  transactions: transactionsRouter,
  budgets: budgetsRouter,
});

export type AppRouter = typeof appRouter;
