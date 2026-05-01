# AI Trading Pipeline

This API uses a controlled trading pipeline instead of sending raw stocks directly to an AI prompt. The goal is to make every recommendation repeatable, auditable, and guarded by deterministic risk rules.

## Flow

1. `marketData.ts` loads a market snapshot for the requested symbols.
2. `signals.ts` converts raw candles into structured signals such as momentum, volatility, volume ratio, and current allocation.
3. `marketContext.ts` gives the agentic AI a market-data review step. It can call an OpenAI-compatible LLM endpoint when configured, or fall back to deterministic market context.
4. `aiDecisionEngine.ts` receives portfolio state, signals, and market context, then returns strict decision objects. Decisions can include entry/trigger prices, stop-loss prices, and take-profit prices. It is currently a deterministic mock policy engine, but this is where the full LLM decision call should be plugged in later.
5. `riskValidator.ts` checks the AI decision against portfolio rules:
   - confidence must meet the minimum threshold
   - buys cannot exceed buying power
   - trade value cannot exceed max trade size
   - sells/trims cannot exceed owned shares
   - buys cannot exceed max position allocation
   - stop-loss and take-profit prices must be valid for the requested action
6. `tradePlanner.ts` turns approved decisions into planned trades or executed trades, preserving any stop-loss and take-profit guardrails.
7. `pipeline.ts` logs every decision with the prompt version, model name, input snapshot, market context, AI output, and risk review.

## Scheduled Evaluation

The deployed API stack includes a dedicated scheduled Lambda entry point at `src/scheduled-trading.ts`.

EventBridge Scheduler invokes it Monday through Friday at `10:00 AM America/New_York`, which is 30 minutes after the regular U.S. market open.

```txt
cron(0 10 ? * MON-FRI *)
timezone: America/New_York
```

The scheduled Lambda runs the same `runTradingPipeline()` function used by the manual `aiTrading.evaluate` mutation. That keeps manual and automated evaluations on the same code path.

## LLM Market Context

The market-context step is implemented in `marketContext.ts`.

Local development uses:

```txt
LLM_PROVIDER=openai-compatible
LLM_API_KEY=...
LLM_BASE_URL=https://api.openai.com/v1/chat/completions
LLM_MODEL=...
LLM_MARKET_CONTEXT_ENABLED=false
```

Deployed Lambda functions receive `LLM_SECRET_ARN` from CDK. The API config loader reads that secret from AWS Secrets Manager and falls back to environment variables for local development.

The CDK-created secret stores:

```json
{
  "LLM_PROVIDER": "openai-compatible",
  "LLM_API_KEY": "...",
  "LLM_BASE_URL": "https://api.openai.com/v1/chat/completions",
  "LLM_MODEL": "...",
  "LLM_MARKET_CONTEXT_ENABLED": "false"
}
```

When enabled, the pipeline sends normalized market data, portfolio state, and computed signals to the LLM and expects strict JSON containing `summary`, `themes`, and `perSymbol` views. If the LLM is disabled, unconfigured, or fails, the pipeline uses deterministic fallback context so evaluation still runs.

## Alpaca Integration

Alpaca credentials are supported through local `.env` values and AWS Secrets Manager.

Local development uses:

```txt
ALPACA_API_KEY=...
ALPACA_SECRET_KEY=...
ALPACA_BASE_URL=https://paper-api.alpaca.markets/v2
ALPACA_DATA_URL=https://data.alpaca.markets
ALPACA_PAPER=true
```

Deployed Lambda functions receive `ALPACA_SECRET_ARN` from CDK. The API config loader reads that secret from AWS Secrets Manager and falls back to environment variables if the secret cannot be loaded.

The CDK-created secret stores:

```json
{
  "ALPACA_API_KEY": "...",
  "ALPACA_SECRET_KEY": "...",
  "ALPACA_BASE_URL": "https://paper-api.alpaca.markets/v2",
  "ALPACA_DATA_URL": "https://data.alpaca.markets",
  "ALPACA_PAPER": "true"
}
```

After deployment, update it with:

```bash
npm run setup-alpaca-secrets -- --stage dev --api-key your_key --secret-key your_secret
```

Use `--live` only when intentionally switching away from paper trading.

## API Surface

The tRPC router is mounted at `aiTrading`.

- `aiTrading.getState`
- `aiTrading.getPortfolio`
- `aiTrading.getPositions`
- `aiTrading.getTradePlans`
- `aiTrading.getDecisions`
- `aiTrading.evaluate`

Example mutation input:

```json
{
  "symbols": ["NVDA", "MSFT", "TSLA"]
}
```

If `symbols` is omitted, the pipeline evaluates every current holding in the demo portfolio.

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
