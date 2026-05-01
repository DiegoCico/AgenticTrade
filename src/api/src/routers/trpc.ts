import { initTRPC } from '@trpc/server';
import * as trpcExpress from '@trpc/server/adapters/express';
import type { Request, Response } from 'express';
import type { APIGatewayProxyEventV2, Context as LambdaCtx } from 'aws-lambda';
import { COOKIE_ACCESS, parseCookiesFromCtx } from '../cognito/cookies';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { TRPCError } from '@trpc/server';

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

import { config } from '../process';

/**
 *  Cognito Token Verification 
 * Used by protectedProcedure to validate user access tokens from cookies.
 */
let verifier: any = null;

// Only create verifier if Cognito credentials are provided
if (config.COGNITO_USER_POOL_ID && config.COGNITO_CLIENT_ID) {
  try {
    verifier = CognitoJwtVerifier.create({
      userPoolId: config.COGNITO_USER_POOL_ID,
      clientId: config.COGNITO_CLIENT_ID,
      tokenUse: 'access',
    });
  } catch (error) {
    console.warn('[tRPC] ⚠️  Cognito credentials not configured properly. Authentication will not work.');
  }
}

/**
 *  Auth Middleware 
 * Extracts cookies, validates JWT, attaches user info to context.
 */
const isAuthed = t.middleware(async ({ ctx, next }) => {
  const cookies = parseCookiesFromCtx(ctx);
  let accessToken = cookies[COOKIE_ACCESS];

  // Also check Authorization header for Bearer token
  if (!accessToken) {
    const authHeader = ctx.req?.headers.authorization || ctx.event?.headers?.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      accessToken = authHeader.substring(7);
    }
  }

  if (!accessToken) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'No access token',
    });
  }

  try {
    // Check if this is a demo token (base64 encoded JSON)
    const isDemoMode = config.DEMO_MODE;
    
    if (isDemoMode && !accessToken.includes('.')) {
      // This looks like a demo token (base64 encoded, not JWT)
      try {
        const decoded = JSON.parse(Buffer.from(accessToken, 'base64').toString());
        
        // Check if token is expired
        if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Token expired',
          });
        }

        return next({
          ctx: {
            ...ctx,
            user: {
              teamId: decoded.sub,
              userId: decoded.sub,
              email: decoded.email,
              username: decoded.email,
              decode: { ...decoded, access_token: accessToken },
            },
          },
        });
      } catch (demoErr) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid demo token',
        });
      }
    }

    // Production Cognito JWT verification
    if (!verifier) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Authentication not configured',
      });
    }
    
    const decoded = await verifier.verify(accessToken);

    // Normalize email to a string at runtime to keep things predictable
    const emailValue =
      decoded.email !== undefined && decoded.email !== null ? String(decoded.email) : undefined;

    return next({
      ctx: {
        ...ctx,
        user: {
          teamId: decoded.sub,
          userId: decoded.sub,
          email: emailValue,
          username:
            decoded['cognito:username'] !== null ? String(decoded['cognito:username']) : undefined,
          decode: { ...decoded, access_token: accessToken },
        },
      },
    });
  } catch (err: any) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: `Invalid or expired token: ${err?.message ?? String(err)}`,
    });
  }
});

export const protectedProcedure = t.procedure.use(isAuthed);