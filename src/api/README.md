# AgenticTrade API

The API is a TypeScript tRPC backend that can run locally with Express or deploy as an AWS Lambda handler behind API Gateway. Its main responsibility right now is the AI trading pipeline.

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
      aiDecisionEngine.ts mock AI decision layer
      demoData.ts         demo portfolio and market candles
      marketData.ts       market snapshot loader
      marketContext.ts    LLM/fallback market-data context generation
      pipeline.ts         orchestrates the full trading pipeline
      riskValidator.ts    deterministic safety gate
      signals.ts          market signal calculations
      tradePlanner.ts     creates planned/executed trade outcomes
      types.ts            pipeline types
    handler.ts            Lambda entry
    scheduled-trading.ts  EventBridge Scheduler entry for daily market evaluation
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
| `aiTrading.evaluate` | mutation | Runs the trading pipeline for requested symbols or the AI-managed strategy universe |

Example `evaluate` input:

```json
{
  "symbols": ["NVDA", "MSFT", "TSLA"]
}
```

If `symbols` is omitted, the API evaluates the AI-managed strategy universe plus current holdings. The strategy targets 30-40% ETFs, with the stock sleeve split evenly between safer and more aggressive candidates selected by the AI policy.

## Trading Pipeline

The pipeline is intentionally structured instead of prompting the AI with raw stocks.

```txt
getMarketSnapshot()
  -> calculateSignals()
  -> buildMarketContext()
  -> requestAiDecisions()
  -> validateDecision()
  -> createTradeOutcome()
  -> decisionLog
```

Current behavior:

- Loads Alpaca account, positions, and market bars when credentials are configured.
- Falls back to demo candles and demo portfolio data when Alpaca is unavailable.
- Uses the default AI-managed universe when symbols are not supplied.
- Adds an LLM-ready market-context pass before final decisions.
- Uses a deterministic mock AI policy engine.
- Includes stop-loss and take-profit prices when the AI decision calls for them.
- Creates in-memory trade plans and executed trades.
- Logs every recommendation with prompt version, model name, input snapshot, AI output, and risk review.

Read `TRADING_PIPELINE.md` for the deeper design notes and the expected Alpaca integration path.

Read `AI_PROMPTS_AND_FLOW.md` for the current LLM prompt, fallback behavior, deterministic trade-decision rules, and the future path for replacing the mock decision engine with an LLM decision prompt.

## Scheduled Evaluation

The CDK API stack deploys a separate scheduled Lambda that runs `runTradingPipeline()` automatically:

```txt
Monday-Friday at 10:00 AM America/New_York
```

That is 30 minutes after the regular U.S. market open. Manual evaluations through `aiTrading.evaluate` and scheduled evaluations use the same pipeline code.

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

The route accepts optional `accountId`, `symbol`, `from`, `to`, `limit`, and `cursor` fields.

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
ALPACA_PAPER=true

LLM_PROVIDER=openai-compatible
LLM_API_KEY=your_llm_api_key
LLM_BASE_URL=https://api.openai.com/v1/chat/completions
LLM_MODEL=your_model
LLM_MARKET_CONTEXT_ENABLED=false
```

For Lambda, CDK injects:

```txt
ALPACA_SECRET_ARN=...
LLM_SECRET_ARN=...
```

`process.ts` loads Alpaca and LLM credentials from AWS Secrets Manager when running in Lambda and falls back to environment variables for local development.

## Commands

```bash
cd src/api
npm run dev
npm run build
npm test
```

The local API listens on `PORT` or `3001` by default.

## Notes

- The current `protectedProcedure` is a pass-through alias while the trading API is in demo/public mode.
- Alpaca order submission is not implemented yet; the pipeline is ready for an execution adapter.
- Tests currently pass with no test files present.
