#!/usr/bin/env ts-node

/**
 * Script to set up Plaid secrets in AWS Secrets Manager
 * 
 * Usage:
 *   npm run setup-plaid-secrets -- --stage dev --client-id your_client_id --secret your_secret
 *   npm run setup-plaid-secrets -- --stage prod --client-id your_client_id --secret your_secret
 */

import { SecretsManagerClient, UpdateSecretCommand, DescribeSecretCommand } from '@aws-sdk/client-secrets-manager';
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';

interface PlaidSecrets {
  PLAID_CLIENT_ID: string;
  PLAID_SECRET: string;
  PLAID_ENV: 'sandbox' | 'development' | 'production';
  PLAID_WEBHOOK_URL?: string;
  PLAID_REDIRECT_URI?: string;
}

async function getStackOutputs(stackName: string, region: string) {
  const cfClient = new CloudFormationClient({ region });
  
  try {
    const response = await cfClient.send(new DescribeStacksCommand({
      StackName: stackName
    }));
    
    const stack = response.Stacks?.[0];
    if (!stack) {
      throw new Error(`Stack ${stackName} not found`);
    }
    
    const outputs: Record<string, string> = {};
    stack.Outputs?.forEach(output => {
      if (output.OutputKey && output.OutputValue) {
        outputs[output.OutputKey] = output.OutputValue;
      }
    });
    
    return outputs;
  } catch (error) {
    console.error(`Failed to get stack outputs for ${stackName}:`, error);
    throw error;
  }
}

async function updatePlaidSecrets(
  secretArn: string,
  secrets: PlaidSecrets,
  region: string
) {
  const client = new SecretsManagerClient({ region });
  
  try {
    // First, check if the secret exists
    await client.send(new DescribeSecretCommand({ SecretId: secretArn }));
    
    // Update the secret
    await client.send(new UpdateSecretCommand({
      SecretId: secretArn,
      SecretString: JSON.stringify(secrets)
    }));
    
    console.log(`✅ Successfully updated Plaid secrets in AWS Secrets Manager`);
    console.log(`   Secret ARN: ${secretArn}`);
    console.log(`   Environment: ${secrets.PLAID_ENV}`);
    
  } catch (error) {
    console.error(`❌ Failed to update Plaid secrets:`, error);
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  // Parse command line arguments
  const stage = args.find(arg => arg.startsWith('--stage='))?.split('=')[1] || 
                args[args.indexOf('--stage') + 1];
  const clientId = args.find(arg => arg.startsWith('--client-id='))?.split('=')[1] || 
                   args[args.indexOf('--client-id') + 1];
  const secret = args.find(arg => arg.startsWith('--secret='))?.split('=')[1] || 
                 args[args.indexOf('--secret') + 1];
  const webhookUrl = args.find(arg => arg.startsWith('--webhook-url='))?.split('=')[1] || 
                     args[args.indexOf('--webhook-url') + 1];
  const redirectUri = args.find(arg => arg.startsWith('--redirect-uri='))?.split('=')[1] || 
                      args[args.indexOf('--redirect-uri') + 1];
  
  if (!stage || !clientId || !secret) {
    console.error(`
Usage: npm run setup-plaid-secrets -- --stage <stage> --client-id <client_id> --secret <secret>

Required:
  --stage         Deployment stage (dev, beta, prod)
  --client-id     Your Plaid Client ID
  --secret        Your Plaid Secret

Optional:
  --webhook-url   Plaid webhook URL (optional)
  --redirect-uri  Plaid redirect URI (optional)

Examples:
  npm run setup-plaid-secrets -- --stage dev --client-id 123abc --secret xyz789
  npm run setup-plaid-secrets -- --stage prod --client-id 123abc --secret xyz789 --webhook-url https://api.example.com/plaid/webhook
    `);
    process.exit(1);
  }
  
  const region = process.env.AWS_REGION || process.env.CDK_DEFAULT_REGION || 'us-east-1';
  const stackName = `AgentictradeApi-${stage}`;
  
  console.log(`🔧 Setting up Plaid secrets for stage: ${stage}`);
  console.log(`📍 Region: ${region}`);
  console.log(`📦 Stack: ${stackName}`);
  
  try {
    // Get the secret ARN from CloudFormation stack outputs
    const outputs = await getStackOutputs(stackName, region);
    const secretArn = outputs.PlaidSecretArn;
    
    if (!secretArn) {
      throw new Error(`PlaidSecretArn not found in stack outputs. Make sure the stack is deployed.`);
    }
    
    // Determine Plaid environment based on stage
    const plaidEnv: PlaidSecrets['PLAID_ENV'] = 
      stage === 'prod' ? 'production' : 'sandbox';
    
    // Prepare secrets object
    const secrets: PlaidSecrets = {
      PLAID_CLIENT_ID: clientId,
      PLAID_SECRET: secret,
      PLAID_ENV: plaidEnv,
    };
    
    if (webhookUrl) {
      secrets.PLAID_WEBHOOK_URL = webhookUrl;
    }
    
    if (redirectUri) {
      secrets.PLAID_REDIRECT_URI = redirectUri;
    }
    
    // Update the secret
    await updatePlaidSecrets(secretArn, secrets, region);
    
    console.log(`
🎉 Plaid secrets setup complete!

Next steps:
1. Your Lambda functions will automatically use these secrets when deployed
2. For local development, continue using your .env file
3. Test your Plaid integration in the ${plaidEnv} environment

Secret Details:
- Environment: ${plaidEnv}
- Client ID: ${clientId.substring(0, 8)}...
- Secret: ${secret.substring(0, 8)}...
${webhookUrl ? `- Webhook URL: ${webhookUrl}` : ''}
${redirectUri ? `- Redirect URI: ${redirectUri}` : ''}
    `);
    
  } catch (error) {
    console.error(`❌ Setup failed:`, error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}