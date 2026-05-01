import { initTRPC } from '@trpc/server';
import * as trpcExpress from '@trpc/server/adapters/express';
import type { Request, Response } from 'express';
import type { APIGatewayProxyEventV2, Context as LambdaCtx } from 'aws-lambda';

export type Context = {
  req?: Request;
  res?: Response;
  event?: APIGatewayProxyEventV2;
  lambdaContext?: LambdaCtx;
  responseHeaders?: Record<string, string | string[]>;
  responseCookies?: string[];
  user?: {
    teamId: string;
    userId: string;
    email?: string | undefined;
    username?: string;
    decode?: Record<string, any>;
  };
};

/**
 *  Express Context 
 * Used for local dev / testing.
 */
export const createExpressContext = ({
  req,
  res,
}: trpcExpress.CreateExpressContextOptions): Context => ({
  req,
  res,
  responseHeaders: {},
  responseCookies: [],
});

export const createLambdaContext = async ({
  event,
  context,
}: {
  event: APIGatewayProxyEventV2;
  context: LambdaCtx;
}): Promise<Context> => {
  return {
    event,
    lambdaContext: context,
    responseHeaders: {},
    responseCookies: [],
  };
};

/**
 *  TRPC Initialization 
 */
const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const mergeRouters = t.mergeRouters;
export const protectedProcedure = t.procedure;
