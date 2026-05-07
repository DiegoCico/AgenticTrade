# AI Trading Pipeline

This API uses a controlled trading pipeline instead of sending raw stocks directly to an AI prompt. The goal is to make every recommendation repeatable, auditable, and guarded by deterministic risk rules.

## Flow

1. `strategy.ts` resolves the selected trading agent and AI-managed strategy universe when the caller does not provide symbols.
2. `marketData.ts` loads a market snapshot for the resolved symbols using the selected agent's Alpaca credentials.
3. `signals.ts` converts raw candles into structured signals such as momentum, volatility, volume ratio, and current allocation.
4. `marketContext.ts` gives the agentic AI a market-data review step. It can call an OpenAI-compatible LLM endpoint for structured symbol views and scores, or fall back to deterministic market context.
5. `aiDecisionEngine.ts` receives portfolio state, signals, and market context, then returns strict decision objects. Decisions include a journal with no-trade gate results, LLM influence, pre/post confidence, entry/trigger prices, stop-loss prices, and take-profit prices. It is currently a deterministic mock policy engine, but this is where the full LLM decision call should be plugged in later.
6. `riskValidator.ts` checks the AI decision against portfolio rules:
   - confidence must meet the minimum threshold
   - buys cannot exceed buying power
   - trade value cannot exceed max trade size
   - sells/trims cannot exceed owned shares
   - buys cannot exceed max position allocation
   - stop-loss and take-profit prices must be valid for the requested action
7. `tradePlanner.ts` turns approved decisions into planned trades or executed trades, preserving any stop-loss and take-profit guardrails.
8. `pipeline.ts` submits approved buy plans to the selected agent's Alpaca paper account as market bracket orders when Alpaca is configured, then logs every decision with the prompt version, model name, input snapshot, market context, AI output, decision journal, LLM influence record, risk review, plan, and broker order metadata.

## AI-Managed Strategy

When `aiTrading.evaluate` is called without `symbols`, the AI-managed strategy evaluates a built-in universe instead of asking the user for tickers. The optional `agentId` can be `conservative`, `neutral`, or `aggressive`; it defaults to `neutral`.

Neutral target allocation:

- ETFs: target 35%, with a 30-40% intended range
- Stocks: target 65%
- Safer stock sleeve: target 32.5%
- Aggressive stock sleeve: target 32.5%

Conservative target allocation:

- ETFs: target 55%, with a 45-65% intended range
- Safer stock sleeve: target 35%
- Aggressive stock sleeve: target 10%
- Smaller trade sizes, higher buy confidence, lower volatility ceiling, and more ETF/safer-stock picks

Aggressive target allocation:

- ETFs: target 20%, with a 15-30% intended range
- Safer stock sleeve: target 25%
- Aggressive stock sleeve: target 55%
- Larger trade sizes, lower buy confidence threshold, higher volatility ceiling, and tighter short-term bracket exits

The current universe is defined in `src/api/src/trading/STRATEGY_UNIVERSE.ts`. It contains ETF, safer-stock, and aggressive-stock candidates used by the default AI-managed evaluation.

The decision engine ranks bullish candidates by momentum, volume, and volatility, then chooses a limited number from each sleeve. Buy quantities are sized against the remaining sleeve target and still pass through the deterministic risk gate.

The engine has a no-trade bias, but it is tuned to be moderately aggressive for paper trading. It defaults to `hold` unless a symbol has a bullish signal, acceptable volatility, enough final confidence, allocation room, and valid risk controls. Every decision includes a journal explaining whether the no-trade bias was applied or cleared.

## Scheduled Evaluation

The deployed API stack includes a dedicated scheduled Lambda entry point at `src/scheduled-trading.ts`.

EventBridge Scheduler invokes it Monday through Friday at `10:00 AM`, `12:30 PM`, and `3:00 PM America/New_York`.

```txt
cron(0 10,15 ? * MON-FRI *)
cron(30 12 ? * MON-FRI *)
timezone: America/New_York
```

The scheduled Lambda runs the same `runTradingPipeline()` function used by the manual `aiTrading.evaluate` mutation. Each scheduled invocation runs Conservative, Neutral, and Aggressive independently.

Each agent result is isolated. If one scheduled agent fails after retries, the Lambda logs and returns that agent's failure while allowing the other agents to complete.

## LLM Market Context

The market-context step is implemented in `marketContext.ts`.

Local development uses:

```txt
LLM_PROVIDER=openai-compatible
LLM_API_KEY=...
LLM_BASE_URL=https://api.openai.com/v1/chat/completions
LLM_MODEL=...
LLM_MARKET_CONTEXT_ENABLED=true
```

`LLM_MARKET_CONTEXT_ENABLED` can be omitted. When omitted, the API enables LLM market context automatically if `LLM_API_KEY` and `LLM_MODEL` are configured. Set it to `false` only to force deterministic fallback context.

Deployed Lambda functions receive `LLM_SECRET_ARN` from CDK. The API config loader reads that secret from AWS Secrets Manager and falls back to environment variables for local development.

The CDK-created secret stores:

```json
{
  "LLM_PROVIDER": "openai-compatible",
  "LLM_API_KEY": "...",
  "LLM_BASE_URL": "https://api.openai.com/v1/chat/completions",
  "LLM_MODEL": "...",
  "LLM_MARKET_CONTEXT_ENABLED": "true"
}
```

When enabled, the pipeline sends portfolio state, a bucket-level universe summary, compact screened signals, and ranked candidate signals to the LLM. It does not send raw candle arrays; candles are converted into signals first to keep token usage controlled. The LLM returns strict JSON containing `summary`, `themes`, and `perSymbol` views. If the LLM is explicitly disabled, unconfigured, or fails, the pipeline uses deterministic fallback context so evaluation still runs.

## Alpaca Integration

Alpaca credentials are supported through local `.env` values and AWS Secrets Manager.

Local development uses:

```txt
ALPACA_API_KEY=...
ALPACA_SECRET_KEY=...
ALPACA_BASE_URL=https://paper-api.alpaca.markets/v2
ALPACA_DATA_URL=https://data.alpaca.markets
ALPACA_DATA_FEED=iex
ALPACA_PAPER=true
```

Deployed Lambda functions receive one Alpaca secret ARN per agent from CDK:

```txt
ALPACA_CONSERVATIVE_SECRET_ARN
ALPACA_NEUTRAL_SECRET_ARN
ALPACA_AGGRESSIVE_SECRET_ARN
```

`ALPACA_SECRET_ARN` is still set as a Neutral compatibility alias. In Lambda, the API config loader strictly reads the selected agent's secret from AWS Secrets Manager. If that agent's secret ARN, `ALPACA_API_KEY`, or `ALPACA_SECRET_KEY` is missing, that agent fails instead of falling back to another account. Local development can still use environment variables.

Each CDK-created secret stores:

```json
{
  "ALPACA_API_KEY": "...",
  "ALPACA_SECRET_KEY": "...",
  "ALPACA_BASE_URL": "https://paper-api.alpaca.markets/v2",
  "ALPACA_DATA_URL": "https://data.alpaca.markets",
  "ALPACA_DATA_FEED": "iex",
  "ALPACA_PAPER": "true"
}
```

After deployment, update each secret directly in AWS Secrets Manager. Real Alpaca keys should not be committed to CDK source. Use `ALPACA_PAPER=false` only when intentionally switching away from paper trading.

In beta/prod, `DEMO_MODE=false`. If Alpaca market data cannot be loaded, the API throws instead of falling back to demo candles. This prevents accidental trades or decisions based on stale fixture data.

Alpaca bars are requested with pagination and invalid-symbol retry handling. The mapped snapshot keeps the most recent 12 hourly candles per returned symbol. Approved buy plans are submitted to the selected agent's Alpaca account as paper market bracket orders with take-profit and stop-loss legs.

Alpaca 429 rate-limit responses are retried up to 4 total attempts. Each retry waits a randomized 1-10 seconds before trying again.

## API Surface

The tRPC router is mounted at `aiTrading`.

- `aiTrading.getState`
- `aiTrading.getPortfolio`
- `aiTrading.getPositions`
- `aiTrading.getTradePlans`
- `aiTrading.getDecisions`
- `aiTrading.evaluate`
- `aiTrading.getTradeHistory`
- `aiTrading.getAgents`

Example mutation input:

```json
{
  "agentId": "aggressive",
  "symbols": ["NVDA", "MSFT", "TSLA"]
}
```

If `symbols` is omitted, the pipeline evaluates the AI-managed strategy universe plus current holdings. Provide `symbols` only when you want to override the default strategy universe for a manual evaluation.

Each read route accepts optional `agentId` where relevant. `aiTrading.getTradeHistory` also accepts `accountId`; when omitted, it resolves the account id from the selected agent's current Alpaca portfolio.

## Manual Lambda Test Event

For the AWS Lambda console, invoke the tRPC handler with an HTTP API v2 event. The important pieces are `rawPath`, `pathParameters.proxy`, and the tRPC body:

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

## Stop Loss And Take Profit

AI decisions and resulting trade plans can include:

```json
{
  "triggerPrice": 180.5,
  "stopLossPrice": 173.28,
  "takeProfitPrice": 194.94
}
```

For planned buys, the deterministic policy currently uses a stop loss below the planned entry and a take profit above it. For trims or sells, the pipeline can carry exit guardrails through the decision log and trade outcome so the future Alpaca execution adapter has the data it needs to place protective orders.

## Why Not Just Prompt The Model?

A prompt-only design is hard to test and risky to execute. This pipeline keeps the AI inside a bounded system:

- market data is normalized first
- the model sees structured signals instead of raw noise
- the model gets a separate market-context pass before decisions
- the response shape is controlled
- deterministic risk validation can reject unsafe decisions
- every recommendation is stored in a decision log

## Replacing The Mock AI

`marketContext.ts` and `aiDecisionEngine.ts` are intentionally isolated. To use a real model for final decisions, keep the same `requestAiDecisions` function signature and replace the body with:

1. Build a JSON prompt from `portfolio`, `signals`, and `marketContext`.
2. Ask the model for strict JSON matching `AiDecision[]`.
3. Parse and validate the response before returning it.

The rest of the pipeline should not need to change.
