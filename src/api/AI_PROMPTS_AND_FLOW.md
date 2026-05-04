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

This loads candles for the requested symbols. The API first tries Alpaca market data when Alpaca credentials are configured. If Alpaca is unavailable, it falls back to demo market data only when `DEMO_MODE=true`. In beta/prod, demo mode is disabled and the API throws instead of using fixture candles.

If the caller does not provide symbols, `pipeline.ts` now uses the AI-managed strategy universe from `STRATEGY_UNIVERSE.ts` plus any current holdings. That makes the normal flow AI-selected instead of user-selected.

Current strategy targets:

- ETFs: 35% target allocation, with a 30-40% intended range
- Safer stocks: 32.5% target allocation
- Aggressive stocks: 32.5% target allocation

The current strategy universe lives in `src/api/src/trading/STRATEGY_UNIVERSE.ts` and is grouped into ETF, safer-stock, and aggressive-stock buckets.

Alpaca market data request:

```txt
GET {ALPACA_DATA_URL}/v2/stocks/bars
symbols={symbols}
timeframe=1Hour
limit=min(symbolCount * 12, 10000)
feed={ALPACA_DATA_FEED, default "iex"}
```

The Alpaca adapter follows pagination and maps the most recent 12 hourly candles per returned symbol. If Alpaca rejects invalid symbols, the adapter retries without the rejected tickers and logs the skipped symbols.

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

If Alpaca credentials are missing or Alpaca returns an error, the pipeline logs the failure. It uses `demoPortfolio` only when `DEMO_MODE=true`; otherwise the request fails so beta/prod do not silently evaluate or trade on demo data.

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

If `LLM_MARKET_CONTEXT_ENABLED` is omitted, the config loader enables the LLM automatically when a key and model are configured. If the LLM is explicitly disabled, missing required values, or the request fails, the backend uses `fallbackMarketContext()` instead.

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

{"summary":"string","themes":["string"],"perSymbol":[{"symbol":"string","view":"constructive|cautious|neutral","rationale":"string","scores":{"opportunity":0-100,"risk":0-100,"confidence":0-100}}]}

Do not recommend order execution. Only summarize market context and symbol-level views for the candidateSignals list.

Scores mean: opportunity=quality of the long setup, risk=downside/volatility risk, confidence=confidence in your view.

Token budget rule: the backend already screened the full universe into compact signals. Do not ask for raw candles.

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
    positions: [
      {
        s,
        shares,
        cost,
        px,
        alloc,
        bucket
      }
    ]
  },
  snapshot: {
    snapshotId,
    capturedAt,
    candleCount
  },
  universeSummary: {
    evaluatedSymbols,
    buckets: [
      {
        bucket,
        symbols,
        bullish,
        bearish,
        neutral,
        elevatedVolatility
      }
    ]
  },
  screenedSignals: [
    {
      s,
      bucket,
      px,
      mom,
      vol,
      vr,
      alloc,
      signal
    }
  ],
  candidateSignals: [
    {
      s,
      bucket,
      px,
      mom,
      vol,
      vr,
      alloc,
      signal
    }
  ]
}
```

`screenedSignals` contains the full evaluated universe in compact form. `candidateSignals` contains the highest-ranked bullish names, elevated-risk names, and current holdings that need closer LLM commentary. Raw candles are intentionally excluded from the prompt to keep token usage controlled.

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
      "rationale": "string",
      "scores": {
        "opportunity": 0,
        "risk": 0,
        "confidence": 0
      }
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
- deterministic fallback scores per symbol

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
  journal: {
    strategyBucket: string;
    signal: "bullish" | "bearish" | "neutral";
    preLlmConfidence: number;
    finalConfidence: number;
    signalStrength: "strong" | "moderate" | "weak";
    noTradeBias: string;
    executionPlan: string;
    llmInfluence: {
      view: "constructive" | "cautious" | "neutral" | "missing";
      opportunityScore: number;
      riskScore: number;
      confidenceScore: number;
      confidenceAdjustment: number;
      noTradeBiasApplied: boolean;
    };
    checkpoints: string[];
  };
}
```

## Current Decision Rules

### No-Trade Bias

The decision engine now defaults to `hold`. It only plans a buy or trim when all relevant gates pass.

For a planned buy:

- signal must be `bullish`
- momentum must be at least `1.0%`
- volume ratio must be at least `0.2`
- volatility must be at or below `7.5%`
- final confidence must be at least `70`
- symbol must be selected by the strategy ranker
- the strategy sleeve must still have allocation room
- the position must not be near max allocation

For a trim:

- signal must be `bearish`
- shares must already be owned
- momentum must be at or below `-1.8%` or volatility must be at least `4%`
- final confidence must be at least `72`

If these gates do not pass, the output is a journaled `hold` decision explaining which checks failed.

### Bullish Signal

If a symbol is bullish and clears the no-trade gate:

- action: `plan_buy`
- quantity: sized against the remaining ETF, safer-stock, or aggressive-stock sleeve target, capped by max trade size
- trigger price: current price times `0.985`
- stop loss: trigger price times `0.96`
- take profit: trigger price times `1.08`
- confidence: based on momentum, volume ratio, LLM scores, and market-context view

The policy ranks bullish candidates inside each sleeve and only plans buys for selected candidates. If a sleeve is already at or above target, bullish candidates in that sleeve are held instead of bought.

Approved buy plans are submitted to Alpaca paper trading as market bracket orders. The take-profit and stop-loss prices from the decision become the Alpaca bracket legs, and broker order ID/status metadata is stored with the executed trade record.

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

The LLM market context affects final deterministic decisions through a bounded confidence adjustment. The engine tracks both pre-LLM confidence and final confidence in each decision journal.

```txt
constructive: +3
cautious: -3
neutral: 0
opportunity score above/below 50: small positive/negative adjustment
risk score above/below 50: small negative/positive adjustment
total LLM confidence adjustment: clamped to -8 through +8
```

The symbol rationale is also appended into the decision reason:

```txt
Market context: {symbol-level rationale}
```

Each decision stores `journal.llmInfluence`, including the LLM view, opportunity score, risk score, confidence score, and confidence adjustment. This lets later performance analysis compare pre-LLM confidence against final LLM-influenced confidence.

Persistence also writes a separate DynamoDB item with `entityType: "LLM_INFLUENCE"` for each decision. It stores symbol, action, risk-approved final action, pre-LLM confidence, final confidence, confidence delta, no-trade-bias status, and the structured LLM influence fields. This makes LLM influence performance easier to query without scanning full decision records.

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
- LLM influence records
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
- approved buy plans can be sent to Alpaca paper trading

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

- portfolio settings and compact current positions
- market snapshot ID, capture time, and candle count
- bucket-level universe summary
- compact screened signals for the evaluated universe
- ranked candidate signals for closer LLM commentary
- a short instruction prompt

Raw candle arrays are not sent to the LLM. The backend calculates signals from candles first, then sends the smaller signal payload. For the larger strategy universe, a reasonable rough estimate is:

```txt
input_tokens_per_evaluation: 3,000 to 8,000
output_tokens_per_evaluation: 500 to 1,200
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
