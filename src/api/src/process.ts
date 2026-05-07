import 'dotenv/config';
import { z } from 'zod';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

type TradingAgentId = 'conservative' | 'neutral' | 'aggressive';

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  STAGE: z.string().default('dev'),
  AWS_REGION: z.string().default('us-east-1'),
  SERVICE_NAME: z.string().default('agentictrade-api'),

  // Database
  DDB_TABLE_NAME: z.string().optional(),
  DYNAMODB_TABLE_NAME: z.string().optional(),
  
  // Storage
  S3_BUCKET_NAME: z.string().optional(),
  S3_KMS_KEY_ARN: z.string().optional(),

  // Alpaca Trading (shared fallback)
  ALPACA_API_KEY: z.string().optional(),
  ALPACA_SECRET_KEY: z.string().optional(),
  ALPACA_BASE_URL: z.string().default('https://paper-api.alpaca.markets/v2'),
  ALPACA_DATA_URL: z.string().default('https://data.alpaca.markets'),
  ALPACA_DATA_FEED: z.string().default('iex'),
  ALPACA_PAPER: z.string().default('true'),

  // Per-agent Alpaca credentials (local/non-Lambda override)
  ALPACA_CONSERVATIVE_API_KEY: z.string().optional(),
  ALPACA_CONSERVATIVE_SECRET_KEY: z.string().optional(),
  ALPACA_NEUTRAL_API_KEY: z.string().optional(),
  ALPACA_NEUTRAL_SECRET_KEY: z.string().optional(),
  ALPACA_AGGRESSIVE_API_KEY: z.string().optional(),
  ALPACA_AGGRESSIVE_SECRET_KEY: z.string().optional(),

  // LLM Market Context
  LLM_PROVIDER: z.string().default('openai-compatible'),
  LLM_API_KEY: z.string().optional(),
  LLM_BASE_URL: z.string().default('https://api.openai.com/v1/chat/completions'),
  LLM_MODEL: z.string().optional(),
  LLM_MARKET_CONTEXT_ENABLED: z.string().optional(),

  // CORS and URLs
  ALLOWED_ORIGINS: z.string().optional(),
  LOCAL_WEB_ORIGIN: z.string().optional(),
  APP_SIGNIN_URL: z.string().optional(),
  WEB_URL: z.string().optional(),

  // Demo Mode
  DEMO_MODE: z.string().optional(),
  
  // Server
  PORT: z.string().optional(),

  // AWS Secrets Manager
  ALPACA_SECRET_ARN: z.string().optional(),
  ALPACA_CONSERVATIVE_SECRET_ARN: z.string().optional(),
  ALPACA_NEUTRAL_SECRET_ARN: z.string().optional(),
  ALPACA_AGGRESSIVE_SECRET_ARN: z.string().optional(),
  LLM_SECRET_ARN: z.string().optional(),
});

// Cache for secrets to avoid repeated AWS calls
let secretsCache: Record<string, any> = {};

function parseBoolean(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;

  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'on', 'enabled'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off', 'disabled'].includes(normalized)) return false;

  return undefined;
}

type AlpacaSecrets = {
  ALPACA_API_KEY: string;
  ALPACA_SECRET_KEY: string;
  ALPACA_BASE_URL?: string;
  ALPACA_DATA_URL?: string;
  ALPACA_DATA_FEED?: string;
  ALPACA_PAPER?: string;
};

async function loadAlpacaSecretsFromAWS(secretArn: string): Promise<AlpacaSecrets> {
  if (secretsCache[secretArn]) {
    return secretsCache[secretArn];
  }

  try {
    const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-1' });
    const command = new GetSecretValueCommand({ SecretId: secretArn });
    const response = await client.send(command);

    if (!response.SecretString) {
      throw new Error('Secret value is empty');
    }

    const secrets = JSON.parse(response.SecretString);
    secretsCache[secretArn] = secrets;

    console.log(`[process.ts] ✅ Loaded Alpaca secrets from AWS Secrets Manager`);
    return secrets;
  } catch (error) {
    console.error(`[process.ts] ❌ Failed to load Alpaca secrets from AWS:`, error);
    throw error;
  }
}

function getAlpacaSecretArnForAgent(env: z.infer<typeof envSchema>, agentId: TradingAgentId) {
  if (agentId === 'conservative') return env.ALPACA_CONSERVATIVE_SECRET_ARN;
  if (agentId === 'aggressive') return env.ALPACA_AGGRESSIVE_SECRET_ARN;
  return env.ALPACA_NEUTRAL_SECRET_ARN ?? env.ALPACA_SECRET_ARN;
}

function requireAlpacaSecretValue(secrets: AlpacaSecrets, key: keyof Pick<AlpacaSecrets, 'ALPACA_API_KEY' | 'ALPACA_SECRET_KEY'>) {
  const value = secrets[key]?.trim();
  if (!value) {
    throw new Error(`Alpaca secret is missing required field ${key}`);
  }

  return value;
}

async function loadLlmSecretsFromAWS(secretArn: string): Promise<{
  LLM_PROVIDER?: string;
  LLM_API_KEY: string;
  LLM_BASE_URL?: string;
  LLM_MODEL?: string;
  LLM_MARKET_CONTEXT_ENABLED?: string | boolean;
}> {
  if (secretsCache[secretArn]) {
    return secretsCache[secretArn];
  }

  try {
    const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-1' });
    const command = new GetSecretValueCommand({ SecretId: secretArn });
    const response = await client.send(command);

    if (!response.SecretString) {
      throw new Error('Secret value is empty');
    }

    const secrets = JSON.parse(response.SecretString);
    secretsCache[secretArn] = secrets;

    console.log(`[process.ts] ✅ Loaded LLM secrets from AWS Secrets Manager`);
    return secrets;
  } catch (error) {
    console.error(`[process.ts] ❌ Failed to load LLM secrets from AWS:`, error);
    throw error;
  }
}

export async function loadConfig(agentId: TradingAgentId = 'neutral') {
  const env = envSchema.parse(process.env);

  const stage = env.STAGE.toLowerCase();
  const REGION = env.AWS_REGION;
  const SERVICE = env.SERVICE_NAME.toLowerCase();

  const TABLE_NAME = env.DDB_TABLE_NAME || env.DYNAMODB_TABLE_NAME || `${SERVICE}-${stage}-data`;
  const BUCKET_NAME = env.S3_BUCKET_NAME ?? `${SERVICE}-${stage}-uploads`;

  const ALLOWED_ORIGINS = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

  const APP_SIGNIN_URL = env.APP_SIGNIN_URL ?? 'https://d2cktegyq4qcfk.cloudfront.net/signin';
  const WEB_URL = env.WEB_URL ?? 'https://d2cktegyq4qcfk.cloudfront.net';
  const LOCAL_WEB_ORIGIN = env.LOCAL_WEB_ORIGIN ?? 'http://localhost:5173';

  // Resolve per-agent env var credentials (local override before AWS secrets)
  const agentApiKey =
    agentId === 'conservative' ? env.ALPACA_CONSERVATIVE_API_KEY
    : agentId === 'aggressive' ? env.ALPACA_AGGRESSIVE_API_KEY
    : env.ALPACA_NEUTRAL_API_KEY;
  const agentSecretKey =
    agentId === 'conservative' ? env.ALPACA_CONSERVATIVE_SECRET_KEY
    : agentId === 'aggressive' ? env.ALPACA_AGGRESSIVE_SECRET_KEY
    : env.ALPACA_NEUTRAL_SECRET_KEY;

  let ALPACA_API_KEY = agentApiKey ?? env.ALPACA_API_KEY ?? '';
  let ALPACA_SECRET_KEY = agentSecretKey ?? env.ALPACA_SECRET_KEY ?? '';
  let ALPACA_BASE_URL = env.ALPACA_BASE_URL;
  let ALPACA_DATA_URL = env.ALPACA_DATA_URL;
  let ALPACA_DATA_FEED = env.ALPACA_DATA_FEED;
  let ALPACA_PAPER = env.ALPACA_PAPER;

  const ALPACA_SECRET_ARN = getAlpacaSecretArnForAgent(env, agentId);

  const isLambda = Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);

  if (isLambda && !ALPACA_SECRET_ARN) {
    throw new Error(`Missing Alpaca secret ARN for ${agentId} agent`);
  }

  if (ALPACA_SECRET_ARN && isLambda) {
    try {
      const secrets = await loadAlpacaSecretsFromAWS(ALPACA_SECRET_ARN);
      ALPACA_API_KEY = requireAlpacaSecretValue(secrets, 'ALPACA_API_KEY');
      ALPACA_SECRET_KEY = requireAlpacaSecretValue(secrets, 'ALPACA_SECRET_KEY');
      ALPACA_BASE_URL = secrets.ALPACA_BASE_URL || ALPACA_BASE_URL;
      ALPACA_DATA_URL = secrets.ALPACA_DATA_URL || ALPACA_DATA_URL;
      ALPACA_DATA_FEED = secrets.ALPACA_DATA_FEED || ALPACA_DATA_FEED;
      ALPACA_PAPER = secrets.ALPACA_PAPER || ALPACA_PAPER;
    } catch (error) {
      console.error(`[process.ts] ❌ Failed to load valid ${agentId} Alpaca secrets from AWS`, error);
      throw error;
    }
  }

  let LLM_PROVIDER = env.LLM_PROVIDER;
  let LLM_API_KEY = env.LLM_API_KEY ?? '';
  let LLM_BASE_URL = env.LLM_BASE_URL;
  let LLM_MODEL = env.LLM_MODEL ?? '';
  let LLM_MARKET_CONTEXT_ENABLED: string | boolean | undefined = env.LLM_MARKET_CONTEXT_ENABLED;

  if (env.LLM_SECRET_ARN && process.env.AWS_LAMBDA_FUNCTION_NAME) {
    try {
      const secrets = await loadLlmSecretsFromAWS(env.LLM_SECRET_ARN);
      LLM_PROVIDER = secrets.LLM_PROVIDER || LLM_PROVIDER;
      LLM_API_KEY = secrets.LLM_API_KEY || LLM_API_KEY;
      LLM_BASE_URL = secrets.LLM_BASE_URL || LLM_BASE_URL;
      LLM_MODEL = secrets.LLM_MODEL || LLM_MODEL;
      LLM_MARKET_CONTEXT_ENABLED = secrets.LLM_MARKET_CONTEXT_ENABLED || LLM_MARKET_CONTEXT_ENABLED;
    } catch (error) {
      console.warn(`[process.ts] ⚠️  Failed to load LLM secrets from AWS, using environment variables`);
    }
  }

  // Demo mode is only implicit for local/dev stage. Beta and prod must use live Alpaca data unless explicitly overridden.
  const DEMO_MODE = parseBoolean(env.DEMO_MODE) ?? (stage === 'dev' && env.NODE_ENV === 'development');

  const llmEnabledOverride = parseBoolean(LLM_MARKET_CONTEXT_ENABLED);
  const llmHasRuntimeConfig = Boolean(LLM_API_KEY && LLM_MODEL);
  const llmMarketContextEnabled = llmEnabledOverride ?? llmHasRuntimeConfig;

  const config = {
    env,
    stage,
    REGION,
    TABLE_NAME,
    BUCKET_NAME,
    KMS_KEY_ARN: env.S3_KMS_KEY_ARN,

    // Alpaca
    ALPACA_API_KEY,
    ALPACA_SECRET_KEY,
    ALPACA_BASE_URL,
    ALPACA_DATA_URL,
    ALPACA_DATA_FEED,
    ALPACA_PAPER: ALPACA_PAPER === 'true',

    // LLM
    LLM_PROVIDER,
    LLM_API_KEY,
    LLM_BASE_URL,
    LLM_MODEL,
    LLM_MARKET_CONTEXT_ENABLED: llmMarketContextEnabled,

    // URLs and CORS
    ALLOWED_ORIGINS,
    LOCAL_WEB_ORIGIN,
    APP_SIGNIN_URL,
    WEB_URL,

    // Server
    PORT: Number(env.PORT) || 3001,
    DEMO_MODE,
  };

  // Validation warnings
  const warnings: string[] = [];
  
  if (!config.ALPACA_API_KEY || !config.ALPACA_SECRET_KEY) {
    warnings.push('⚠️  Alpaca credentials not configured. Trading execution will not work.');
  }

  if (config.LLM_MARKET_CONTEXT_ENABLED && (!config.LLM_API_KEY || !config.LLM_MODEL)) {
    warnings.push('⚠️  LLM market context is enabled but LLM credentials/model are not configured.');
  }

  if (config.LLM_API_KEY && !config.LLM_MODEL) {
    warnings.push('⚠️  LLM API key is configured but LLM_MODEL is missing. Market context will use deterministic fallback.');
  }

  console.log(
    [
      '=============================================================',
      `✅ [process.ts] Loaded stage=${stage.toUpperCase()}`,
      `🌎 Region: ${REGION}`,
      `🧩 Table: ${config.TABLE_NAME}`,
      `🪣 Bucket: ${config.BUCKET_NAME}`,
      `📈 Alpaca ${agentId}: ${config.ALPACA_API_KEY ? 'configured' : 'not configured'} (${config.ALPACA_PAPER ? 'paper' : 'live'})`,
      `🧠 LLM Market Context: ${config.LLM_MARKET_CONTEXT_ENABLED ? 'enabled' : 'disabled'} ${config.LLM_API_KEY ? '(key configured)' : '(key not configured)'} ${config.LLM_MODEL ? `(model ${config.LLM_MODEL})` : '(model missing)'}`,
      `🌐 Web URL: ${config.WEB_URL}`,
      `🚀 Port: ${config.PORT}`,
      `🧪 Demo Mode: ${config.DEMO_MODE ? 'enabled' : 'disabled'}`,
      ...warnings,
      '=============================================================',
    ].join('\n'),
  );

  return config;
}

// Export a singleton instance (async)
const configPromises = new Map<TradingAgentId, Promise<any>>();

export function getConfig(agentId: TradingAgentId = 'neutral') {
  if (!configPromises.has(agentId)) {
    configPromises.set(agentId, loadConfig(agentId));
  }
  return configPromises.get(agentId)!;
}

// For backwards compatibility, export a synchronous version for local development
export const config = (() => {
  const env = envSchema.parse(process.env);
  const stage = env.STAGE.toLowerCase();
  const REGION = env.AWS_REGION;
  const SERVICE = env.SERVICE_NAME.toLowerCase();
  const TABLE_NAME = env.DDB_TABLE_NAME || env.DYNAMODB_TABLE_NAME || `${SERVICE}-${stage}-data`;
  const BUCKET_NAME = env.S3_BUCKET_NAME ?? `${SERVICE}-${stage}-uploads`;
  const ALLOWED_ORIGINS = (env.ALLOWED_ORIGINS ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const APP_SIGNIN_URL = env.APP_SIGNIN_URL ?? 'https://d2cktegyq4qcfk.cloudfront.net/signin';
  const WEB_URL = env.WEB_URL ?? 'https://d2cktegyq4qcfk.cloudfront.net';
  const LOCAL_WEB_ORIGIN = env.LOCAL_WEB_ORIGIN ?? 'http://localhost:5173';
  const DEMO_MODE = parseBoolean(env.DEMO_MODE) ?? (stage === 'dev' && env.NODE_ENV === 'development');

  return {
    env,
    stage,
    REGION,
    TABLE_NAME,
    BUCKET_NAME,
    KMS_KEY_ARN: env.S3_KMS_KEY_ARN,
    ALPACA_API_KEY: env.ALPACA_API_KEY ?? '',
    ALPACA_SECRET_KEY: env.ALPACA_SECRET_KEY ?? '',
    ALPACA_BASE_URL: env.ALPACA_BASE_URL,
    ALPACA_DATA_URL: env.ALPACA_DATA_URL,
    ALPACA_DATA_FEED: env.ALPACA_DATA_FEED,
    ALPACA_PAPER: env.ALPACA_PAPER === 'true',
    ALPACA_SECRET_ARN: env.ALPACA_SECRET_ARN,
    ALPACA_CONSERVATIVE_SECRET_ARN: env.ALPACA_CONSERVATIVE_SECRET_ARN,
    ALPACA_NEUTRAL_SECRET_ARN: env.ALPACA_NEUTRAL_SECRET_ARN,
    ALPACA_AGGRESSIVE_SECRET_ARN: env.ALPACA_AGGRESSIVE_SECRET_ARN,
    LLM_PROVIDER: env.LLM_PROVIDER,
    LLM_API_KEY: env.LLM_API_KEY ?? '',
    LLM_BASE_URL: env.LLM_BASE_URL,
    LLM_MODEL: env.LLM_MODEL ?? '',
    LLM_MARKET_CONTEXT_ENABLED: parseBoolean(env.LLM_MARKET_CONTEXT_ENABLED) ?? Boolean(env.LLM_API_KEY && env.LLM_MODEL),
    LLM_SECRET_ARN: env.LLM_SECRET_ARN,
    ALLOWED_ORIGINS,
    LOCAL_WEB_ORIGIN,
    APP_SIGNIN_URL,
    WEB_URL,
    PORT: Number(env.PORT) || 3001,
    DEMO_MODE,
  };
})();
