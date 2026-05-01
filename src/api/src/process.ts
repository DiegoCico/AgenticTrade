import 'dotenv/config';
import { z } from 'zod';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { SES } from '@aws-sdk/client-ses';

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

  // Authentication
  COGNITO_USER_POOL_ID: z.string().optional(),
  COGNITO_CLIENT_ID: z.string().optional(),

  // Plaid Integration
  PLAID_CLIENT_ID: z.string().optional(),
  PLAID_SECRET: z.string().optional(),
  PLAID_ENV: z.string().default('sandbox'),
  PLAID_WEBHOOK_URL: z.string().optional(),
  PLAID_REDIRECT_URI: z.string().optional(),

  // Alpaca Trading
  ALPACA_API_KEY: z.string().optional(),
  ALPACA_SECRET_KEY: z.string().optional(),
  ALPACA_BASE_URL: z.string().default('https://paper-api.alpaca.markets/v2'),
  ALPACA_DATA_URL: z.string().default('https://data.alpaca.markets'),
  ALPACA_PAPER: z.string().default('true'),

  // Email
  SES_FROM_ADDRESS: z.string().default('cicotosted@gmail.com'),
  SES_CONFIG_SET: z.string().optional(),

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
  PLAID_SECRET_ARN: z.string().optional(),
  ALPACA_SECRET_ARN: z.string().optional(),
});

// Cache for secrets to avoid repeated AWS calls
let secretsCache: Record<string, any> = {};

async function loadPlaidSecretsFromAWS(secretArn: string): Promise<{
  PLAID_CLIENT_ID: string;
  PLAID_SECRET: string;
  PLAID_ENV: string;
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
    
    console.log(`[process.ts] ✅ Loaded Plaid secrets from AWS Secrets Manager`);
    return secrets;
  } catch (error) {
    console.error(`[process.ts] ❌ Failed to load Plaid secrets from AWS:`, error);
    throw error;
  }
}

async function loadAlpacaSecretsFromAWS(secretArn: string): Promise<{
  ALPACA_API_KEY: string;
  ALPACA_SECRET_KEY: string;
  ALPACA_BASE_URL?: string;
  ALPACA_DATA_URL?: string;
  ALPACA_PAPER?: string;
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

    console.log(`[process.ts] ✅ Loaded Alpaca secrets from AWS Secrets Manager`);
    return secrets;
  } catch (error) {
    console.error(`[process.ts] ❌ Failed to load Alpaca secrets from AWS:`, error);
    throw error;
  }
}

export async function loadConfig() {
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

  // Plaid configuration - try AWS Secrets Manager first, then env vars
  let PLAID_CLIENT_ID = env.PLAID_CLIENT_ID ?? '';
  let PLAID_SECRET = env.PLAID_SECRET ?? '';
  let PLAID_ENV = env.PLAID_ENV ?? 'sandbox';
  
  // If running in AWS Lambda and secret ARN is provided, load from Secrets Manager
  if (env.PLAID_SECRET_ARN && process.env.AWS_LAMBDA_FUNCTION_NAME) {
    try {
      const secrets = await loadPlaidSecretsFromAWS(env.PLAID_SECRET_ARN);
      PLAID_CLIENT_ID = secrets.PLAID_CLIENT_ID || PLAID_CLIENT_ID;
      PLAID_SECRET = secrets.PLAID_SECRET || PLAID_SECRET;
      PLAID_ENV = secrets.PLAID_ENV || PLAID_ENV;
    } catch (error) {
      console.warn(`[process.ts] ⚠️  Failed to load secrets from AWS, using environment variables`);
    }
  }
  
  const PLAID_WEBHOOK_URL = env.PLAID_WEBHOOK_URL;
  const PLAID_REDIRECT_URI = env.PLAID_REDIRECT_URI;

  let ALPACA_API_KEY = env.ALPACA_API_KEY ?? '';
  let ALPACA_SECRET_KEY = env.ALPACA_SECRET_KEY ?? '';
  let ALPACA_BASE_URL = env.ALPACA_BASE_URL;
  let ALPACA_DATA_URL = env.ALPACA_DATA_URL;
  let ALPACA_PAPER = env.ALPACA_PAPER;

  if (env.ALPACA_SECRET_ARN && process.env.AWS_LAMBDA_FUNCTION_NAME) {
    try {
      const secrets = await loadAlpacaSecretsFromAWS(env.ALPACA_SECRET_ARN);
      ALPACA_API_KEY = secrets.ALPACA_API_KEY || ALPACA_API_KEY;
      ALPACA_SECRET_KEY = secrets.ALPACA_SECRET_KEY || ALPACA_SECRET_KEY;
      ALPACA_BASE_URL = secrets.ALPACA_BASE_URL || ALPACA_BASE_URL;
      ALPACA_DATA_URL = secrets.ALPACA_DATA_URL || ALPACA_DATA_URL;
      ALPACA_PAPER = secrets.ALPACA_PAPER || ALPACA_PAPER;
    } catch (error) {
      console.warn(`[process.ts] ⚠️  Failed to load Alpaca secrets from AWS, using environment variables`);
    }
  }

  // Demo mode
  const DEMO_MODE = env.DEMO_MODE === 'true' || env.NODE_ENV === 'development';

  const config = {
    env,
    stage,
    REGION,
    TABLE_NAME,
    BUCKET_NAME,
    KMS_KEY_ARN: env.S3_KMS_KEY_ARN,

    // Authentication
    COGNITO_USER_POOL_ID: env.COGNITO_USER_POOL_ID ?? '',
    COGNITO_CLIENT_ID: env.COGNITO_CLIENT_ID ?? '',

    // Plaid
    PLAID_CLIENT_ID,
    PLAID_SECRET,
    PLAID_ENV,
    PLAID_WEBHOOK_URL,
    PLAID_REDIRECT_URI,

    // Alpaca
    ALPACA_API_KEY,
    ALPACA_SECRET_KEY,
    ALPACA_BASE_URL,
    ALPACA_DATA_URL,
    ALPACA_PAPER: ALPACA_PAPER === 'true',

    // Email
    SES_FROM: env.SES_FROM_ADDRESS,
    SES_CONFIG_SET: env.SES_CONFIG_SET ?? '',

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
  
  if (!config.PLAID_CLIENT_ID || !config.PLAID_SECRET) {
    warnings.push('⚠️  Plaid credentials not configured. Bank integration will not work.');
  }
  
  if (!config.COGNITO_USER_POOL_ID || !config.COGNITO_CLIENT_ID) {
    warnings.push('⚠️  Cognito credentials not configured. Authentication will not work.');
  }

  if (!config.ALPACA_API_KEY || !config.ALPACA_SECRET_KEY) {
    warnings.push('⚠️  Alpaca credentials not configured. Trading execution will not work.');
  }

  console.log(
    [
      '=============================================================',
      `✅ [process.ts] Loaded stage=${stage.toUpperCase()}`,
      `🌎 Region: ${REGION}`,
      `🧩 Table: ${config.TABLE_NAME}`,
      `🪣 Bucket: ${config.BUCKET_NAME}`,
      `🔐 Cognito Pool: ${config.COGNITO_USER_POOL_ID || 'none'}`,
      `🏦 Plaid Env: ${config.PLAID_ENV} ${config.PLAID_CLIENT_ID ? '(configured)' : '(not configured)'}`,
      `📈 Alpaca: ${config.ALPACA_API_KEY ? 'configured' : 'not configured'} (${config.ALPACA_PAPER ? 'paper' : 'live'})`,
      `📧 SES From: ${config.SES_FROM}`,
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
let configPromise: Promise<any> | null = null;

export function getConfig() {
  if (!configPromise) {
    configPromise = loadConfig();
  }
  return configPromise;
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
  const DEMO_MODE = env.DEMO_MODE === 'true' || env.NODE_ENV === 'development';
  const SES_FROM_EMAIL = env.SES_FROM_ADDRESS || 'cicotosted@gmail.com';

  return {
    env,
    stage,
    REGION,
    TABLE_NAME,
    BUCKET_NAME,
    KMS_KEY_ARN: env.S3_KMS_KEY_ARN,
    COGNITO_USER_POOL_ID: env.COGNITO_USER_POOL_ID ?? '',
    COGNITO_CLIENT_ID: env.COGNITO_CLIENT_ID ?? '',
    PLAID_CLIENT_ID: env.PLAID_CLIENT_ID ?? '',
    PLAID_SECRET: env.PLAID_SECRET ?? '',
    PLAID_ENV: env.PLAID_ENV ?? 'sandbox',
    PLAID_WEBHOOK_URL: env.PLAID_WEBHOOK_URL,
    PLAID_REDIRECT_URI: env.PLAID_REDIRECT_URI,
    ALPACA_API_KEY: env.ALPACA_API_KEY ?? '',
    ALPACA_SECRET_KEY: env.ALPACA_SECRET_KEY ?? '',
    ALPACA_BASE_URL: env.ALPACA_BASE_URL,
    ALPACA_DATA_URL: env.ALPACA_DATA_URL,
    ALPACA_PAPER: env.ALPACA_PAPER === 'true',
    ALPACA_SECRET_ARN: env.ALPACA_SECRET_ARN,
    SES_FROM: env.SES_FROM_ADDRESS,
    SES_CONFIG_SET: env.SES_CONFIG_SET ?? '',
    ALLOWED_ORIGINS,
    LOCAL_WEB_ORIGIN,
    APP_SIGNIN_URL,
    WEB_URL,
    PORT: Number(env.PORT) || 3001,
    DEMO_MODE,
    SES_FROM_EMAIL,
  };
})();
