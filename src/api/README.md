# AgenticTrade API

The API is a TypeScript tRPC backend that can run locally with Express or deploy as an AWS Lambda handler behind API Gateway. Its main responsibility right now is the AI trading pipeline for three trading agents: Conservative, Neutral, and Aggressive.

## Runtime

- Local server: `src/server.ts`
- Lambda handler: `src/handler.ts`
- Scheduled trading Lambda: `src/scheduled-trading.ts`
- tRPC router root: `src/routers/index.ts`
- Config loader: `src/process.ts`

## Directory Structure

```txt
src/api/
  src/
    routers/
      aiTrading.ts       tRPC procedures for portfolio, decisions, plans, evaluation
      index.ts           root app router
      trpc.ts            tRPC initialization/context
    trading/
      aiDecisionEngine.ts deterministic AI decision layer
      demoData.ts         demo portfolio and market candles
      marketData.ts       market snapshot loader
      marketContext.ts    LLM/fallback market-data context generation
      pipeline.ts         orchestrates the full trading pipeline
      riskValidator.ts    deterministic safety gate
      signals.ts          market signal calculations
      tradePlanner.ts     creates planned/executed trade outcomes
      tradingRepository.ts DynamoDB persistence and history reads
      types.ts            pipeline types
    handler.ts            Lambda entry
    scheduled-trading.ts  EventBridge Scheduler entry for scheduled market evaluation
    server.ts             local Express entry
    process.ts            environment and Secrets Manager config
  TRADING_PIPELINE.md     detailed pipeline explanation
  AI_PROMPTS_AND_FLOW.md  current LLM prompt and AI decision flow
```

## tRPC API

The active router is `aiTrading`.

Procedures:

| Procedure | Type | Description |
| --- | --- | --- |
| `aiTrading.getState` | query | Returns portfolio, decision log, trade plans, and executed trades |
| `aiTrading.getPortfolio` | query | Returns current portfolio state |
| `aiTrading.getPositions` | query | Returns current positions |
| `aiTrading.getTradePlans` | query | Returns planned/blocked trade plans |
| `aiTrading.getDecisions` | query | Returns decision log entries |
| `aiTrading.getTradeHistory` | query | Returns a frontend-ready timeline of executed trades, plans, holds, and AI thoughts |
| `aiTrading.getAgents` | query | Returns the supported trading agents and default agent id |
| `aiTrading.evaluate` | mutation | Runs the trading pipeline for requested symbols or the AI-managed strategy universe |

Example `evaluate` input:

```json
{
  "agentId": "neutral",
  "symbols": ["NVDA", "MSFT", "TSLA"]
}
```

Most read procedures accept an optional `agentId` of `conservative`, `neutral`, or `aggressive`. If omitted, the backend uses `neutral`. Each agent loads its own Alpaca account and has isolated runtime decisions, trade plans, executed trades, and trade-history account id.

If `symbols` is omitted, the API evaluates the AI-managed strategy universe plus current holdings for the selected agent. Neutral keeps the previous balanced targets; Conservative biases toward ETF/dividend/high-dividend candidates; Aggressive biases toward short-term aggressive-stock purchases.

## Trading Pipeline

The pipeline is intentionally structured instead of prompting the AI with raw stocks.

```txt
getMarketSnapshot()
  -> calculateSignals()
  -> buildMarketContext()
  -> requestAiDecisions()
  -> validateDecision()
  -> createTradeOutcome()
  -> submitAlpacaBuyOrder() for approved paper buy plans
  -> decisionLog
```

Current behavior:

- Loads the selected agent's Alpaca account, positions, and market bars when credentials are configured.
- Uses demo data only when `DEMO_MODE=true`; beta/prod disable demo mode and refuse to run if Alpaca market data is unavailable.
- Uses the default AI-managed universe when symbols are not supplied.
- Adds an LLM-ready market-context pass before final decisions.
- Uses a deterministic AI policy engine for final decisions.
- Includes stop-loss and take-profit prices when the AI decision calls for them.
- Creates trade plans and submits approved paper buy plans to Alpaca as bracket orders.
- Logs every recommendation with prompt version, model name, input snapshot, AI output, and risk review.
- Keeps in-memory fallback decisions, trade plans, and executed trades isolated per agent.
- Retries Alpaca and LLM 429 rate-limit responses up to 4 total attempts with a randomized 1-10 second delay before each retry.

Read `TRADING_PIPELINE.md` for the deeper design notes and the expected Alpaca integration path.

Read `AI_PROMPTS_AND_FLOW.md` for the current LLM prompt, fallback behavior, deterministic trade-decision rules, and the future path for replacing the mock decision engine with an LLM decision prompt.

## Scheduled Evaluation

The CDK API stack deploys a separate scheduled Lambda that runs `runTradingPipeline()` automatically:

```txt
Monday-Friday at 10:00 AM, 12:30 PM, and 3:00 PM America/New_York
```

Scheduled evaluation runs the full pipeline independently for Conservative, Neutral, and Aggressive. Manual evaluations through `aiTrading.evaluate` and scheduled evaluations use the same pipeline code. If one scheduled agent fails after retries, the other agents still complete and the Lambda response reports the failed agent.

## DynamoDB Persistence

Trading evaluations now persist portfolio snapshots, market snapshots, AI decisions, trade plans, executed trades, and trade-history timeline items to the DynamoDB table from `DYNAMODB_TABLE_NAME`.

`aiTrading.getTradeHistory` returns records shaped for the frontend:

```ts
{
  items: [
    {
      id: string,
      symbol: string,
      action: "buy" | "sell" | "trim" | "hold" | "plan_buy" | "plan_sell" | "watch",
      status: "planned" | "blocked" | "executed" | "canceled" | "failed" | "held" | "watched",
      occurredAt: string,
      aiThought: {
        summary: string,
        reason: string,
        riskNotes: string,
        confidence: number,
        model: string,
        promptVersion: string
      }
    }
  ],
  nextCursor?: string
}
```

The route accepts optional `agentId`, `accountId`, `symbol`, `from`, `to`, `limit`, and `cursor` fields. If `accountId` is omitted, the route resolves it from the selected agent's current Alpaca portfolio.

## Environment

Create `src/api/.env` for local development.

```txt
NODE_ENV=development
DEMO_MODE=true
AWS_REGION=us-east-1
DYNAMODB_TABLE_NAME=agentictrade-dev-data

ALPACA_API_KEY=your_key
ALPACA_SECRET_KEY=your_secret
ALPACA_BASE_URL=https://paper-api.alpaca.markets/v2
ALPACA_DATA_URL=https://data.alpaca.markets
ALPACA_DATA_FEED=iex
ALPACA_PAPER=true

LLM_PROVIDER=openai-compatible
LLM_API_KEY=your_llm_api_key
LLM_BASE_URL=https://api.openai.com/v1/chat/completions
LLM_MODEL=your_model
LLM_MARKET_CONTEXT_ENABLED=true
```

If `LLM_MARKET_CONTEXT_ENABLED` is omitted, LLM market context is enabled automatically when a key and model are configured. Set it to `false` only to force fallback context.

For Lambda, CDK injects:

```txt
ALPACA_SECRET_ARN=...
ALPACA_CONSERVATIVE_SECRET_ARN=...
ALPACA_NEUTRAL_SECRET_ARN=...
ALPACA_AGGRESSIVE_SECRET_ARN=...
LLM_SECRET_ARN=...
DEMO_MODE=false
```

`process.ts` loads the selected agent's Alpaca credentials and the LLM credentials from AWS Secrets Manager when running in Lambda. Alpaca secret loading is strict in Lambda: if a selected agent's secret ARN, `ALPACA_API_KEY`, or `ALPACA_SECRET_KEY` is missing, that agent fails instead of falling back to another account's credentials. Local development falls back to the single `.env` Alpaca credential pair for all agents.

## Commands

```bash
cd src/api
npm run dev
npm run build
npm test
```

The local API listens on `PORT` or `3001` by default.

## Manual Lambda Test Event

Use this event in the AWS Lambda console to manually run `aiTrading.evaluate`:

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

## Notes

- The current `protectedProcedure` is a pass-through alias while the trading API is still early-stage.
- Alpaca order submission is implemented for approved paper buy plans through bracket market orders.
- The final trade-decision stage is deterministic; the LLM currently provides market context only.
- The scheduled Lambda evaluates Conservative, Neutral, and Aggressive independently on each scheduled invocation.
