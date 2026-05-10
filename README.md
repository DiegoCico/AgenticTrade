# AgenticTrade

AgenticTrade is an AI-assisted paper trading dashboard. The frontend shows portfolio performance, current positions, AI trade decisions, and planned buy/sell triggers for three selectable trading agents: Conservative, Neutral, and Aggressive. The backend exposes a tRPC API with a controlled trading pipeline that evaluates market snapshots, calculates signals, asks an AI decision layer for actions, validates those actions through risk rules, and records the resulting plans or trades.

The current implementation is built for Alpaca paper trading in deployed environments. Each agent can use its own Alpaca paper account and Secrets Manager secret. Demo data is only used when `DEMO_MODE=true`; beta/prod deployments disable demo mode and refuse to run the trading pipeline if live Alpaca market data is unavailable.

## Project Structure

```txt
src/
  api/       tRPC API, trading pipeline, local Express server, Lambda handler
  frontend/  Vite + React portfolio dashboard
  cdk/       AWS CDK infrastructure
```

## Current App

Frontend tabs:

- `Portfolio`: portfolio value, animated performance chart, AI status, positions, and watchlist
- `Current positions`: current holdings with latest bought/sold/trimmed/held action and hoverable AI reasoning
- `Trade plans`: planned buy/sell triggers such as “buy AMD if it hits $158”
- `Decisions`: recent AI decision log cards with date/time context and detail dialogs

The dashboard refreshes backend data every 10 seconds for 5 minutes after page load. After that, live updates pause and the user must refresh the page to start another polling window. Position and watchlist rows open the symbol's TradingView chart in a new tab.

The header trading-agent selector controls which backend account is loaded. Conservative, Neutral, and Aggressive each have separate current positions, decisions, trade plans, executed trades, and Alpaca credentials. Neutral is the default and is also the scheduled trading agent.

Backend pipeline:

```txt
Market snapshot
  -> Signal calculation
  -> LLM/fallback market context
  -> AI decision layer
  -> Risk validator
  -> Trade planner / Alpaca paper order submitter
  -> Decision log
```

Agent profiles:

- `Conservative Agent`: prioritizes ETFs, dividend ETFs, and defensive high-dividend stocks with smaller trades and tighter volatility limits. Requires strong momentum (≥1%) and volume ratio (≥0.2) to trigger a buy.
- `Neutral Agent`: preserves the previous balanced sleeve targets. Same momentum and volume thresholds as conservative.
- `Aggressive Agent`: targets short-term 1-7 day trades with much lower entry barriers. Per-agent signal thresholds — momentum ≥0.3%, volume ratio ≥0.05, volatility up to 15% — let the agent act on weaker signals that the other agents ignore. Confidence offset is −10 (effective buy threshold ~60). Position sizing is 1.5× the base trade value. Take-profit is 4% and stop-loss is 2.5% for fast bracket exits.

Infrastructure:

- API Gateway HTTP API
- Lambda tRPC handler
- DynamoDB table
- S3 + CloudFront frontend hosting
- Route53/DNS stack
- Alpaca Secrets Manager stack
- LLM Secrets Manager stack

## Prerequisites

- Node.js 18+
- npm
- AWS CLI configured for deployment
- AWS CDK bootstrap completed for the target account/region
- Alpaca paper trading key/secret pairs for the Conservative, Neutral, and Aggressive accounts

## Install

From the repo root:

```bash
npm install
```

Each workspace can also be installed directly if needed:

```bash
cd src/frontend && npm install
cd ../api && npm install
cd ../cdk && npm install
```

## Development

Run frontend and API together:

```bash
npm run dev
```

Run only the frontend:

```bash
npm run dev:frontend
```

Run only the API:

```bash
npm run dev:api
```

Default local URLs:

- Frontend: `http://localhost:5173`
- API: `http://localhost:3001`
- tRPC endpoint: `http://localhost:3001/trpc`

## Build And Test

```bash
npm run build
npm run test
```

Workspace builds:

```bash
npm -w src/frontend run build
npm -w src/api run build
npm -w src/cdk run build
```

Note: the frontend build may warn about bundle size because Recharts and Framer Motion are included. That warning is non-blocking.

## Alpaca Configuration

Local API development reads Alpaca values from `src/api/.env`:

```txt
ALPACA_API_KEY=your_key
ALPACA_SECRET_KEY=your_secret
ALPACA_BASE_URL=https://paper-api.alpaca.markets/v2
ALPACA_DATA_URL=https://data.alpaca.markets
ALPACA_PAPER=true
```

Local development uses the same environment credentials for all agents unless you run in Lambda with the per-agent Secrets Manager ARNs below.

LLM market-context configuration:

```txt
LLM_PROVIDER=openai-compatible
LLM_API_KEY=your_key
LLM_BASE_URL=https://api.openai.com/v1/chat/completions
LLM_MODEL=your_model
LLM_MARKET_CONTEXT_ENABLED=true
```

If `LLM_MARKET_CONTEXT_ENABLED` is omitted, the API auto-enables LLM market context when a key and model are configured. Set it to `false` only when you explicitly want deterministic fallback market context.

Deployed environments use CDK-created Alpaca secrets:

```txt
agentictrade-api/{stage}/alpaca/conservative
agentictrade-api/{stage}/alpaca/neutral
agentictrade-api/{stage}/alpaca/aggressive
```

Expected secret JSON:

```json
{
  "ALPACA_API_KEY": "your_key",
  "ALPACA_SECRET_KEY": "your_secret",
  "ALPACA_BASE_URL": "https://paper-api.alpaca.markets/v2",
  "ALPACA_DATA_URL": "https://data.alpaca.markets",
  "ALPACA_DATA_FEED": "iex",
  "ALPACA_PAPER": "true"
}
```

Do not hardcode real Alpaca keys in CDK source. Deploy the placeholder secrets, then update each secret value directly in AWS Secrets Manager.

## Manual Lambda Test Event

To run the trading evaluation manually from the AWS Lambda console, use the tRPC HTTP API v2 event shape:

```json
{
  "version": "2.0",
  "routeKey": "POST /trpc/{proxy+}",
  "rawPath": "/trpc/aiTrading.evaluate",
  "rawQueryString": "",
  "headers": {
    "content-type": "application/json",
    "origin": "https://d2cktegyq4qcfk.cloudfront.net"
  },
  "requestContext": {
    "http": {
      "method": "POST",
      "path": "/trpc/aiTrading.evaluate",
      "protocol": "HTTP/1.1",
      "sourceIp": "127.0.0.1",
      "userAgent": "lambda-console-test"
    },
    "requestId": "manual-test",
    "routeKey": "POST /trpc/{proxy+}",
    "stage": "$default"
  },
  "pathParameters": {
    "proxy": "aiTrading.evaluate"
  },
  "body": "{\"json\":{\"agentId\":\"neutral\"}}",
  "isBase64Encoded": false
}
```

## Deployment

Build the frontend first so the web stack has assets:

```bash
npm -w src/frontend run build
```

Deploy CDK stacks:

```bash
cd src/cdk
npm run cdk:deploy:dev
```

Useful CDK commands:

```bash
npm run cdk:synth
npm run cdk:diff
npm run cdk:destroy:dev
```

## Docs

- API details: `src/api/README.md`
- Trading pipeline details: `src/api/TRADING_PIPELINE.md`
- Frontend details: `src/frontend/README.md`
- Infrastructure details: `src/cdk/README.md`
