import { awsLambdaRequestHandler } from '@trpc/server/adapters/aws-lambda';
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
  Context as LambdaCtx,
} from 'aws-lambda';
import { appRouter } from './routers';
import { createLambdaContext } from './routers/trpc';
import { config } from './process';

// CORS helpers 
function resolveAllowedOrigin(originHeader?: string): string {
  const allow = config.ALLOWED_ORIGINS;
  if (!originHeader) return allow[0] ?? '';
  if (allow.length === 0) return originHeader;
  if (allow.includes(originHeader)) return originHeader;
  return allow[0] ?? originHeader;
}

function buildCorsHeaders(
  originHeader: string | undefined,
  includeCreds = true,
  includeMethodsHeaders = true,
): Record<string, string> {
  const allowOrigin = resolveAllowedOrigin(originHeader);
  const h: Record<string, string> = {
    'Access-Control-Allow-Origin': allowOrigin,
    Vary: 'Origin',
  };
  if (includeCreds) h['Access-Control-Allow-Credentials'] = 'true';
  if (includeMethodsHeaders) {
    h['Access-Control-Allow-Methods'] = 'GET,POST,PUT,PATCH,DELETE,OPTIONS';
    h['Access-Control-Allow-Headers'] = 'content-type,authorization,x-requested-with';
  }
  return h;
}

function handleOptions(event: APIGatewayProxyEventV2): APIGatewayProxyStructuredResultV2 {
  const origin = (event.headers?.origin ?? (event.headers as any)?.Origin) as string | undefined;
  return { statusCode: 204, headers: buildCorsHeaders(origin, true, true) };
}

//  Main Lambda Handler
export const handler = async (
  event: APIGatewayProxyEventV2,
  ctx: LambdaCtx,
): Promise<APIGatewayProxyStructuredResultV2> => {
  if ((event.requestContext?.http?.method ?? '').toUpperCase() === 'OPTIONS') {
    return handleOptions(event);
  }

  if (event?.body && typeof event.body === 'string') {
    try {
      const parsed = JSON.parse(event.body);
      // if still a string (double encoded), parse again
      event.body = typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
    } catch {
      // ignore if it's not valid JSON
    }
  }

  console.log('[handler] raw query', event.queryStringParameters);

  return awsLambdaRequestHandler({
    router: appRouter,
    createContext: createLambdaContext,
    responseMeta({ ctx: trpcCtx, errors }) {
      const origin = (event.headers?.origin ?? (event.headers as any)?.Origin) as
        | string
        | undefined;
      const baseHeaders = buildCorsHeaders(origin, true, false);
      const cookieList = trpcCtx?.responseCookies ?? [];
      const headersWithCookies: Record<string, string | string[]> = {
        ...baseHeaders,
      };
      if (cookieList.length > 0) headersWithCookies['Set-Cookie'] = cookieList;
      if (errors?.length) {
        const status = (errors[0] as any)?.data?.httpStatus ?? 500;
        return { status, headers: headersWithCookies };
      }
      return { headers: headersWithCookies };
    },
  })(event, ctx);
};
