# AgenticTrade

AgenticTrade is an AI-assisted paper trading dashboard. The frontend shows portfolio performance, current positions, AI trade decisions, and planned buy/sell triggers. The backend exposes a tRPC API with a controlled trading pipeline that evaluates market snapshots, calculates signals, asks an AI decision layer for actions, validates those actions through risk rules, and records the resulting plans or trades.

The current implementation is built for Alpaca paper trading in deployed environments. Demo data is only used when `DEMO_MODE=true`; beta/prod deployments disable demo mode and refuse to run the trading pipeline if live Alpaca market data is unavailable.

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
- Alpaca paper trading key/secret for live backend integration work

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

LLM market-context configuration:

```txt
LLM_PROVIDER=openai-compatible
LLM_API_KEY=your_key
LLM_BASE_URL=https://api.openai.com/v1/chat/completions
LLM_MODEL=your_model
LLM_MARKET_CONTEXT_ENABLED=true
```

If `LLM_MARKET_CONTEXT_ENABLED` is omitted, the API auto-enables LLM market context when a key and model are configured. Set it to `false` only when you explicitly want deterministic fallback market context.

Deployed environments use the CDK-created Alpaca secret:

```txt
agentictrade-api/{stage}/alpaca
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
  "body": "{\"json\":{}}",
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
