# AI Prompts And Trading Flow

This document explains how the backend AI flow currently works, where prompts are sent, and which parts are still deterministic.

## Summary

The backend has two AI-related stages:

1. Market context generation in `src/api/src/trading/marketContext.ts`
2. Trade decision generation in `src/api/src/trading/aiDecisionEngine.ts`

Only the market-context stage currently calls an external LLM. The trade-decision stage is currently a deterministic mock policy engine that uses market signals and market context to produce structured decisions.

## Pipeline Order

The full trading pipeline runs in `src/api/src/trading/pipeline.ts`.

```txt
getMarketSnapshot()
  -> calculateSignals()
  -> buildMarketContext()
  -> requestAiDecisions()
  -> validateDecision()
  -> createTradeOutcome()
  -> persistPipelineRun()
```

### Step 1: Market Snapshot

File:

```txt
src/api/src/trading/marketData.ts
src/api/src/trading/alpacaClient.ts
```

This loads candles for the requested symbols. The API first tries Alpaca market data when Alpaca credentials are configured. If Alpaca is unavailable, it falls back to demo market data.

Alpaca market data request:

```txt
GET {ALPACA_DATA_URL}/v2/stocks/bars
symbols={symbols}
timeframe=1Hour
limit=12
feed=iex
```

The mapped candle data sent into the AI flow includes:

```ts
{
  symbol,
  timestamp,
  open,
  high,
  low,
  close,
  volume
}
```

### Step 1A: Portfolio State From Alpaca

File:

```txt
src/api/src/trading/alpacaClient.ts
```

Before building the AI prompt, the pipeline loads the live/paper Alpaca account and open positions:

```txt
GET {ALPACA_BASE_URL}/v2/account
GET {ALPACA_BASE_URL}/v2/positions
```

This gives the AI current account context:

```ts
{
  accountId,
  cash,
  buyingPower,
  totalValue,
  maxPositionPercent,
  maxTradeValuePercent,
  minConfidence,
  positions: [
    {
      symbol,
      name,
      shares,
      averageCost,
      price,
      allocationPercent
    }
  ]
}
```

That portfolio object is passed into:

- `calculateSignals()`
- `buildMarketContext()`
- `requestAiDecisions()`
- `validateDecision()`
- `persistPipelineRun()`

So the AI market-context prompt sees what stocks the Alpaca account currently has, how many shares it owns, the average cost, current price, allocation, cash, buying power, and total portfolio value.

If Alpaca credentials are missing or Alpaca returns an error, the pipeline logs the failure and uses `demoPortfolio` instead.

### Step 2: Trading Signals

File:

```txt
src/api/src/trading/signals.ts
```

This converts candles and portfolio data into structured signals:

- current price
- momentum percent
- volatility percent
- volume ratio
- current position allocation
- signal: `bullish`, `bearish`, or `neutral`

These signals are what the AI layer sees instead of raw, unstructured stock data.

### Step 3: Market Context LLM

File:

```txt
src/api/src/trading/marketContext.ts
```

Function:

```ts
buildMarketContext(input)
```

This is the only current external LLM call.

It runs only when all of these are configured:

```txt
LLM_MARKET_CONTEXT_ENABLED=true
LLM_API_KEY=...
LLM_BASE_URL=...
LLM_MODEL=...
```

If those values are missing, disabled, or the request fails, the backend uses `fallbackMarketContext()` instead.

## Current LLM Request

The backend sends a chat-completions style request to `LLM_BASE_URL`.

Request shape:

```ts
{
  model: config.LLM_MODEL,
  temperature: 0.2,
  response_format: { type: "json_object" },
  messages: [
    {
      role: "system",
      content: "You are a market-context analyst for a paper-trading AI. You summarize data, but you do not execute trades."
    },
    {
      role: "user",
      content: buildPrompt(input)
    }
  ]
}
```

## System Prompt

The system prompt is:

```txt
You are a market-context analyst for a paper-trading AI. You summarize data, but you do not execute trades.
```

This prompt intentionally prevents the market-context stage from recommending or executing orders.

## User Prompt Template

The user prompt is built by `buildPrompt(input)` in `marketContext.ts`.

Current template:

```txt
Analyze the supplied portfolio market data for an AI trading system.

Return strict JSON with this shape:

{"summary":"string","themes":["string"],"perSymbol":[{"symbol":"string","view":"constructive|cautious|neutral","rationale":"string"}]}

Do not recommend order execution. Only summarize market context and symbol-level views.

{JSON payload}
```

The JSON payload contains:

```ts
{
  portfolio: {
    cash,
    buyingPower,
    totalValue,
    maxPositionPercent,
    positions
  },
  snapshot: {
    snapshotId,
    capturedAt,
    candles
  },
  signals
}
```

## Expected LLM Output

The backend expects strict JSON:

```json
{
  "summary": "string",
  "themes": ["string"],
  "perSymbol": [
    {
      "symbol": "NVDA",
      "view": "constructive",
      "rationale": "string"
    }
  ]
}
```

Allowed `view` values:

```txt
constructive
cautious
neutral
```

The response is normalized by `normalizeLlmContext()`. If the LLM returns missing or invalid fields, the backend fills gaps with deterministic fallback values.

## Fallback Market Context

If the LLM is disabled or fails, `fallbackMarketContext()` creates a local market context.

It summarizes:

- count of bullish symbols
- count of bearish symbols
- count of elevated-volatility symbols
- buying power versus total portfolio value
- one rationale per symbol

This keeps scheduled trading and manual evaluation running even without an LLM.

## Trade Decision Engine

File:

```txt
src/api/src/trading/aiDecisionEngine.ts
```

Function:

```ts
requestAiDecisions(input)
```

Despite the name, this function does not call the LLM yet. It is currently deterministic.

It receives:

```ts
{
  portfolio,
  signals,
  marketContext
}
```

It returns one `AiDecision` per signal.

Decision output shape:

```ts
{
  symbol: string;
  action: "buy" | "sell" | "trim" | "hold" | "plan_buy" | "plan_sell" | "watch";
  quantity: number;
  triggerPrice?: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  confidence: number;
  reason: string;
  riskNotes: string;
}
```

## Current Decision Rules

### Bullish Signal

If a symbol is bullish and the current allocation is not near the max allocation:

- action: `plan_buy`
- quantity: about 2.5% of portfolio value divided by current price
- trigger price: current price times `0.985`
- stop loss: trigger price times `0.96`
- take profit: trigger price times `1.08`
- confidence: based on momentum, volume ratio, and market-context view

### Bearish Signal

If a symbol is bearish and shares are owned:

- action: `trim`
- quantity: about 18% of current shares
- trigger price: current price
- stop loss: current price times `0.97`
- take profit: current price times `1.04`
- confidence: based on volatility and market-context view

### Neutral Or No Clear Edge

Otherwise:

- action: `hold`
- quantity: `0`
- optional monitoring stop loss and take profit if a position exists

## Market Context Influence

The LLM market context affects final deterministic decisions through a small confidence adjustment:

```txt
constructive: +3
cautious: -3
neutral: 0
```

The symbol rationale is also appended into the decision reason:

```txt
Market context: {symbol-level rationale}
```

## Risk Validation

File:

```txt
src/api/src/trading/riskValidator.ts
```

Function:

```ts
validateDecision(decision, portfolio)
```

This deterministic risk gate checks:

- confidence must meet `portfolio.minConfidence`
- buy value cannot exceed buying power
- trade value cannot exceed max trade size
- sell or trim quantity cannot exceed owned shares
- buys cannot exceed max position allocation
- buy stop loss must be below entry
- buy take profit must be above entry
- sell/trim guardrail prices must be positive

If a decision fails validation, the final action becomes `watch`.

## Persistence

File:

```txt
src/api/src/trading/tradingRepository.ts
```

After the AI and risk pipeline runs, `persistPipelineRun()` stores:

- portfolio snapshot
- market snapshot
- market candles
- AI decisions
- trade plans
- executed trades
- trade history timeline items with AI thoughts

This is what lets the frontend show trade history alongside the AI's reasoning.

## Important Current Limitation

The final trade decision prompt does not exist yet.

Today:

- LLM generates market context only
- deterministic code generates trade decisions
- deterministic risk validation approves or blocks decisions

To make the LLM generate final trade decisions later, replace the body of `requestAiDecisions()` while preserving its input and output types.

Recommended future prompt target:

```txt
Given portfolio rules, trading signals, and market context, return strict JSON AiDecision[] only.
Do not include prose outside JSON.
Each decision must include symbol, action, quantity, confidence, reason, and riskNotes.
Include triggerPrice, stopLossPrice, and takeProfitPrice when relevant.
Never exceed supplied risk constraints.
```

## Estimated AI Cost Per Day

Current scheduled AI usage is low because the backend makes at most one LLM call per trading evaluation, and that call is only for market context.

The CDK scheduler runs:

```txt
Monday-Friday at 10:00 AM America/New_York
```

So the default production cadence is:

```txt
1 scheduled LLM call per market weekday
```

Manual calls to `aiTrading.evaluate` add one extra market-context LLM call each time.

### Cost Formula

Use the selected model's current input/output token prices:

```txt
daily_cost =
  evaluations_per_day *
  (
    (input_tokens_per_evaluation / 1,000,000) * input_price_per_1m_tokens
    +
    (output_tokens_per_evaluation / 1,000,000) * output_price_per_1m_tokens
  )
```

Where:

```txt
evaluations_per_day = scheduled_runs + manual_evaluate_calls
```

For the current app:

```txt
scheduled_runs = 1 on market weekdays
scheduled_runs = 0 on weekends
```

### GPT-4.1 Mini Estimate

The current market-context prompt sends:

- portfolio settings
- all current positions
- market snapshot candles
- computed trading signals
- a short instruction prompt

For the demo portfolio with five symbols, a reasonable rough estimate is:

```txt
input_tokens_per_evaluation: 2,000 to 5,000
output_tokens_per_evaluation: 300 to 800
```

Using OpenAI `gpt-4.1-mini` standard text pricing:

```txt
input_price_per_1m_tokens = $0.40
output_price_per_1m_tokens = $1.60
```

Example estimate:

```txt
evaluations_per_day = 1
input_tokens = 4,000
output_tokens = 600
input_price_per_1m_tokens = $0.40
output_price_per_1m_tokens = $1.60

daily_cost =
  1 * ((4,000 / 1,000,000) * 0.40 + (600 / 1,000,000) * 1.60)
  = $0.00256 per market day
```

That is less than one cent per scheduled market day.

Using the rough token range above:

```txt
low estimate:
  input_tokens = 2,000
  output_tokens = 300
  daily_cost = ((2,000 / 1,000,000) * 0.40 + (300 / 1,000,000) * 1.60)
  daily_cost = $0.00128

high estimate:
  input_tokens = 5,000
  output_tokens = 800
  daily_cost = ((5,000 / 1,000,000) * 0.40 + (800 / 1,000,000) * 1.60)
  daily_cost = $0.00328
```

So the current scheduled market-context LLM usage with `gpt-4.1-mini` is roughly:

```txt
$0.00128 to $0.00328 per market day
```

### Monthly Estimate

Assuming about 21 market days per month:

```txt
monthly_scheduled_cost = daily_cost * 21
```

Using the middle example above:

```txt
$0.00256 * 21 = $0.05376 per month
```

Using the rough low/high range:

```txt
low monthly estimate:
  $0.00128 * 21 = $0.02688 per month

high monthly estimate:
  $0.00328 * 21 = $0.06888 per month
```

Manual evaluations increase cost linearly:

```txt
extra_monthly_cost =
  manual_evaluations_per_month * cost_per_evaluation
```

### What Changes The Cost

Cost increases when:

- more symbols are evaluated
- more candle history is included
- final trade decisions are moved from deterministic rules to an LLM prompt
- multiple LLM passes are added
- manual `aiTrading.evaluate` calls are frequent
- the selected model has higher token prices

Cost decreases when:

- fewer symbols are evaluated
- candle history is summarized before prompting
- market context is cached per snapshot
- the LLM only runs when signals materially change

### Pricing Source Note

These estimates use OpenAI `gpt-4.1-mini` text pricing as checked on 2026-05-03:

```txt
input: $0.40 / 1M tokens
cached input: $0.10 / 1M tokens
output: $1.60 / 1M tokens
```

The formula stays the same if the model changes; update the per-token prices for the selected `LLM_MODEL`.
