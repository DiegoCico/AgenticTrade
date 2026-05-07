# AgenticTrade CDK

AWS CDK infrastructure for AgenticTrade.

## Current Stacks

`bin/app.ts` creates these stacks for the selected stage:

| Stack | File | Purpose |
| --- | --- | --- |
| `AgentictradeDynamo-{stage}` | `lib/dynamo-stack.ts` | DynamoDB data table |
| `AgentictradeAlpacaSecrets-{stage}` | `lib/alpaca-secrets-stack.ts` | Per-agent Alpaca API credentials in Secrets Manager |
| `AgentictradeLlmSecrets-{stage}` | `lib/llm-secrets-stack.ts` | LLM API credentials in Secrets Manager |
| `AgentictradeApi-{stage}` | `lib/api-stack.ts` | Lambda tRPC handler, scheduled trading Lambda, EventBridge Scheduler, and API Gateway HTTP API |
| `AgentictradeDns-{stage}` | `lib/dns-stack.ts` | Route53 hosted zone and certificate support |
| `AgentictradeWeb-{stage}` | `lib/web-stack.ts` | S3 + CloudFront frontend hosting |

## Directory Structure

```txt
src/cdk/
  bin/
    app.ts
  lib/
    alpaca-secrets-stack.ts
    llm-secrets-stack.ts
    api-stack.ts
    dns-stack.ts
    dynamo-stack.ts
    web-stack.ts
  cdk.json
  package.json
  stage.ts
  tsconfig.json
  DYNAMODB_TRADE_HISTORY.md
```

## DynamoDB Data Model

The table is intended for a single-table design covering portfolio snapshots, AI decisions, trade plans, executed trades, and symbol-level trade history. The stack defines `gsi1`, `gsi2`, and `gsi3`; the API currently uses `gsi1` for the account trade-history feed. Move additional read paths to `gsi2` and `gsi3` one at a time. See `DYNAMODB_TRADE_HISTORY.md` for the proposed access patterns, item shapes, indexes, and frontend DTO for displaying stock purchase history alongside AI thoughts.

## Alpaca Secrets

`AlpacaSecretsStack` creates one placeholder secret per trading agent:

```txt
agentictrade-api/{stage}/alpaca/conservative
agentictrade-api/{stage}/alpaca/neutral
agentictrade-api/{stage}/alpaca/aggressive
```

Default JSON shape:

```json
{
  "ALPACA_API_KEY": "replace-me",
  "ALPACA_SECRET_KEY": "replace-me",
  "ALPACA_BASE_URL": "https://paper-api.alpaca.markets/v2",
  "ALPACA_DATA_URL": "https://data.alpaca.markets",
  "ALPACA_DATA_FEED": "iex",
  "ALPACA_PAPER": "true"
}
```

After deploying the stack, update each secret value in AWS Secrets Manager with the matching Alpaca paper trading account key and secret. The CDK source intentionally keeps `ALPACA_API_KEY` and `ALPACA_SECRET_KEY` empty so real credentials are not committed.

The API Lambda and scheduled Lambda receive:

```txt
ALPACA_SECRET_ARN
ALPACA_CONSERVATIVE_SECRET_ARN
ALPACA_NEUTRAL_SECRET_ARN
ALPACA_AGGRESSIVE_SECRET_ARN
```

`ALPACA_SECRET_ARN` is kept as a neutral-account compatibility alias. Both Lambdas are granted read access to all three Alpaca secrets.

## LLM Secret

`LlmSecretsStack` creates:

```txt
agentictrade-api/{stage}/llm
```

Default JSON shape:

```json
{
  "LLM_PROVIDER": "openai-compatible",
  "LLM_API_KEY": "replace-me",
  "LLM_BASE_URL": "https://api.openai.com/v1/chat/completions",
  "LLM_MODEL": "gpt-4.1-mini",
  "LLM_MARKET_CONTEXT_ENABLED": "true"
}
```

The API Lambda receives `LLM_SECRET_ARN` and is granted read access to that secret. If `LLM_MARKET_CONTEXT_ENABLED` is omitted, the API auto-enables LLM market context when a key and model are configured. Set it to `"false"` only when forcing deterministic fallback context.

## API Stack

`ApiStack` creates:

- Node.js 20 Lambda using `src/api/src/handler.ts`
- Node.js 20 scheduled Lambda using `src/api/src/scheduled-trading.ts`
- EventBridge Scheduler rule for weekday trading evaluations
- API Gateway HTTP API
- `/trpc/{proxy+}` route
- `/health` route
- `/hello` route
- DynamoDB read/write permissions
- Alpaca secret read permissions for Conservative, Neutral, and Aggressive
- LLM secret read permissions

Important Lambda environment values:

```txt
NODE_ENV
STAGE
SERVICE_NAME
DYNAMODB_TABLE_NAME
ALPACA_SECRET_ARN
ALPACA_CONSERVATIVE_SECRET_ARN
ALPACA_NEUTRAL_SECRET_ARN
ALPACA_AGGRESSIVE_SECRET_ARN
LLM_SECRET_ARN
DEMO_MODE
```

`DEMO_MODE` is `true` for dev and `false` for beta/prod. Beta/prod Lambdas use 1024 MB and a 120-second timeout. Dev uses 512 MB and a 20-second timeout.

Scheduled trading evaluation:

```txt
cron(0 10,15 ? * MON-FRI *)
cron(30 12 ? * MON-FRI *)
timezone: America/New_York
```

The first and third runs share one Scheduler rule, and the 12:30 PM run uses a second Scheduler rule because a single cron expression cannot represent exactly those three times. Each scheduled Lambda invocation evaluates Conservative, Neutral, and Aggressive independently and gets the same DynamoDB and secret permissions as the API Lambda.

Manual evaluation can also be run through the Lambda console by invoking the tRPC handler with an HTTP API v2 event for `/trpc/aiTrading.evaluate`.

## Web Stack

`WebStack` serves the frontend build from S3 through CloudFront. Build the frontend before deploying the web stack:

```bash
npm -w src/frontend run build
```

## Commands

From `src/cdk`:

```bash
npm install
npm run build
npm run cdk:synth
npm run cdk:diff
npm run cdk:deploy:dev
```

Destroy dev:

```bash
npm run cdk:destroy:dev
```

## Stage Selection

Most commands accept a stage context:

```bash
npx cdk synth -c stage=dev
npx cdk deploy --all -c stage=prod
```

`stage.ts` resolves stage-specific defaults such as Lambda memory and timeout.

## Notes

- The CDK project currently includes a `setup-alpaca-secrets` package script, but `src/cdk/scripts/` is not present in this worktree. Update the three Alpaca secrets directly in AWS Secrets Manager unless that script is restored.
- Generated folders such as `dist/`, `cdk.out/`, and `node_modules/` should not be committed.
