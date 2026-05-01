# AI Trading Pipeline

This API uses a controlled trading pipeline instead of sending raw stocks directly to an AI prompt. The goal is to make every recommendation repeatable, auditable, and guarded by deterministic risk rules.

## Flow

1. `marketData.ts` loads a market snapshot for the requested symbols.
2. `signals.ts` converts raw candles into structured signals such as momentum, volatility, volume ratio, and current allocation.
3. `aiDecisionEngine.ts` receives portfolio state plus signals and returns strict decision objects. It is currently a deterministic mock policy engine, but this is where an OpenAI call should be plugged in later.
4. `riskValidator.ts` checks the AI decision against portfolio rules:
   - confidence must meet the minimum threshold
   - buys cannot exceed buying power
   - trade value cannot exceed max trade size
   - sells/trims cannot exceed owned shares
   - buys cannot exceed max position allocation
5. `tradePlanner.ts` turns approved decisions into planned trades or executed trades.
6. `pipeline.ts` logs every decision with the prompt version, model name, input snapshot, AI output, and risk review.

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

## Why Not Just Prompt The Model?

A prompt-only design is hard to test and risky to execute. This pipeline keeps the AI inside a bounded system:

- market data is normalized first
- the model sees structured signals instead of raw noise
- the response shape is controlled
- deterministic risk validation can reject unsafe decisions
- every recommendation is stored in a decision log

## Replacing The Mock AI

`aiDecisionEngine.ts` is intentionally isolated. To use a real model, keep the same `requestAiDecisions` function signature and replace the body with:

1. Build a JSON prompt from `portfolio` and `signals`.
2. Ask the model for strict JSON matching `AiDecision[]`.
3. Parse and validate the response before returning it.

The rest of the pipeline should not need to change.
