import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import * as trpcExpress from '@trpc/server/adapters/express';
import { appRouter } from './routers';
import { createExpressContext } from './routers/trpc';
import { config } from './process';

const CANONICAL_ALLOWED_ORIGINS = [
  config.LOCAL_WEB_ORIGIN,
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  config.WEB_URL,
  ...config.ALLOWED_ORIGINS,
];

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // same-origin / curl cases
  return CANONICAL_ALLOWED_ORIGINS.includes(origin);
}

const corsMiddleware = cors({
  origin(origin, callback) {
    if (!origin || isAllowedOrigin(origin)) {
      // reflect requesting origin
      return callback(null, origin || CANONICAL_ALLOWED_ORIGINS[0]);
    }
    return callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
  allowedHeaders: ['content-type', 'authorization', 'x-requested-with'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  maxAge: 60 * 60 * 12, // 12h like API Gateway
});

const app = express();

/**
 * We mount CORS first so preflight OPTIONS is handled.
 * Then JSON parser, then routes.
 */
app.use(corsMiddleware);
app.use(express.json());

/**
 * Health check
 */
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).send('ok');
});

/**
 * tRPC router
 */
app.use(
  '/trpc',
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext: createExpressContext,
    onError({ error, path, type }) {
      // Helpful detail in dev
      console.error(`[tRPC] ${type} ${path} failed`, {
        code: error.code,
        message: error.message,
        cause: (error.cause as any)?.message ?? error.cause,
      });
    },
  }),
);

/**
 * Global error handler
 */
app.use(
  (
    err: any,
    _req: Request,
    res: Response,
    _next: NextFunction, // eslint-disable-line @typescript-eslint/no-unused-vars
  ) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
      error: 'Internal Server Error',
      detail: String(err?.message ?? err),
    });
  },
);

/**
 * Start server unless we're under tests.
 */
if (config.env.NODE_ENV !== 'test') {
  const server = app.listen(config.PORT, () => {
    console.log(`[API] API running on http://localhost:${config.PORT}`);
    console.log('[API] Allowed CORS origins:', CANONICAL_ALLOWED_ORIGINS);
  });

  server.on('error', (err: any) => {
    if (err?.code === 'EADDRINUSE') {
      console.error(`⚠️  Port ${config.PORT} is already in use. Did you start another server?`);
      process.exit(1);
    } else {
      throw err;
    }
  });
}

export default app;
