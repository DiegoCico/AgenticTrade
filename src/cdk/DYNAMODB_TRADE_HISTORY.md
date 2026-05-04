# DynamoDB Trade History Design

This document defines the DynamoDB records the API should use to persist stock purchase history, executed trades, AI decisions, risk reviews, and the frontend-ready data needed to show trade history alongside AI thoughts.

The CDK stack already creates one DynamoDB table in `src/cdk/lib/dynamo-stack.ts`:

```txt
tableName: agentictrade-{stage}
partition key: pk
sort key: sk
billing: on demand
prod retention: retained with point-in-time recovery
dev/beta retention: destroyed with stack
```

Use this as a single-table design. The API Lambdas already receive `DYNAMODB_TABLE_NAME` and have read/write permissions.

## API Goal

The frontend needs one normalized history feed that can answer:

- what stock was bought, sold, trimmed, held, or planned
- when the action happened
- quantity, fill price, order value, and realized/unrealized context
- which AI thought caused the trade
- what risk rules approved or blocked it
- what market snapshot and signals the AI saw
- whether the record is planned, executed, rejected, canceled, or failed

Current API routes in `src/api/src/routers/aiTrading.ts` return in-memory data:

```txt
aiTrading.getState
aiTrading.getPortfolio
aiTrading.getPositions
aiTrading.getTradePlans
aiTrading.getDecisions
aiTrading.evaluate
```

`getState` is backed by current portfolio state plus recent decision/trade records. The dedicated route for the full timeline is:

```txt
aiTrading.getTradeHistory
```

Recommended input:

```ts
{
  accountId?: string;
  symbol?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}
```

## Entity Types

Use prefixed `pk` and `sk` strings so related records can be queried together.

| Entity | `pk` | `sk` | Purpose |
| --- | --- | --- | --- |
| Account metadata | `ACCOUNT#{accountId}` | `PROFILE` | Display name, account mode, settings |
| Current portfolio | `ACCOUNT#{accountId}` | `PORTFOLIO#CURRENT` | Latest portfolio state for dashboard |
| Portfolio snapshot | `ACCOUNT#{accountId}` | `PORTFOLIO#{isoTimestamp}` | Historical account values |
| Position snapshot | `ACCOUNT#{accountId}` | `POSITION#{symbol}#CURRENT` | Latest position for a symbol |
| Market snapshot | `SNAPSHOT#{snapshotId}` | `METADATA` | Captured market context |
| Market candle | `SNAPSHOT#{snapshotId}` | `CANDLE#{symbol}#{timestamp}` | Candle data used by the AI |
| AI decision | `ACCOUNT#{accountId}` | `DECISION#{createdAt}#{decisionId}` | AI output and risk review |
| Trade plan | `ACCOUNT#{accountId}` | `PLAN#{createdAt}#{planId}` | Planned or blocked trade |
| Executed trade | `ACCOUNT#{accountId}` | `TRADE#{executedAt}#{tradeId}` | Purchase/sale execution record |
| LLM influence | `ACCOUNT#{accountId}` | `LLM_INFLUENCE#{createdAt}#{decisionId}` | Query market-context influence on decisions |

The `ACCOUNT#...` partition is the primary source for the dashboard and account-level history. Symbol filtering currently uses the account history feed with a filter expression; move to a symbol-specific GSI only if that read path needs optimization.

## Current Index Rollout

The current stack defines three GSIs. The API should move onto them one read path at a time so each behavior can be verified independently.

Current API usage:

```txt
gsi1: active for account trade-history feed
gsi2: provisioned, not used by the API yet
gsi3: provisioned, not used by the API yet
```

Current trade-history query:

```txt
gsi1pk = ACCOUNT#{accountId}#HISTORY
gsi1sk between {from} and {to}
scanIndexForward = false
```

For a symbol filter, the API currently uses the same `gsi1` query with:

```txt
FilterExpression: symbol = {symbol}
```

Move symbol-specific reads to `gsi2` later as the next isolated change.

### `gsi1`

```txt
gsi1pk: ACCOUNT#{accountId}#TYPE#{entityType}
gsi1sk: {timestamp}#{id}
```

Use for paginated lists by account or type:

- the combined trade history feed with `gsi1pk = ACCOUNT#{accountId}#HISTORY`
- all executed trades for an account
- all decisions for an account
- all trade plans for an account
- all portfolio snapshots for charting

### `gsi2`

```txt
gsi2pk: SYMBOL#{symbol}#TYPE#{entityType}
gsi2sk: {timestamp}#{id}
```

Use for symbol-specific history:

- all NVDA trades
- all NVDA AI decisions
- all NVDA plans

### `gsi3`

```txt
gsi3pk: STATUS#{status}
gsi3sk: {createdAt}#{id}
```

Use for operational queues:

- planned trades waiting for trigger
- blocked trades needing review
- failed executions

## Item Shapes

Every item should include:

```ts
type BaseItem = {
  pk: string;
  sk: string;
  entityType: string;
  accountId?: string;
  symbol?: string;
  createdAt: string;
  updatedAt?: string;
  schemaVersion: 1;
};
```

### Executed Trade

This is the purchase/sale history record the frontend should render in a trade timeline.

```json
{
  "pk": "ACCOUNT#0a6343d3-ef4a-4a17-b3dc-416130ec7326",
  "sk": "TRADE#2026-05-03T14:35:21.000Z#trade_01H...",
  "entityType": "EXECUTED_TRADE",
  "schemaVersion": 1,
  "accountId": "0a6343d3-ef4a-4a17-b3dc-416130ec7326",
  "tradeId": "trade_01H...",
  "decisionId": "decision_01H...",
  "planId": "plan_01H...",
  "snapshotId": "snapshot_2026-05-03_1435",
  "symbol": "NVDA",
  "action": "plan_buy",
  "side": "buy",
  "quantity": 4,
  "price": 928.36,
  "grossValue": 3713.44,
  "fees": 0,
  "netValue": 3713.44,
  "currency": "USD",
  "executedAt": "2026-05-03T14:35:21.000Z",
  "source": "paper",
  "broker": "alpaca",
  "brokerOrderId": "alpaca-order-id",
  "status": "accepted",
  "stopLossPrice": 890,
  "takeProfitPrice": 1010,
  "aiThought": {
    "summary": "Momentum is constructive and position size remains inside risk limits.",
    "reason": "NVDA has positive momentum with acceptable volatility.",
    "riskNotes": "Trade value is below max trade size and stop loss is valid.",
    "confidence": 78,
    "model": "mock-policy-engine",
    "promptVersion": "trading-pipeline-v1"
  },
  "riskReview": {
    "approved": true,
    "finalAction": "plan_buy",
    "reasons": []
  },
  "createdAt": "2026-05-03T14:35:21.000Z",
  "updatedAt": "2026-05-03T14:35:21.000Z"
}
```

### AI Decision

Persist the full decision log so trades can be audited later.

```json
{
  "pk": "ACCOUNT#0a6343d3-ef4a-4a17-b3dc-416130ec7326",
  "sk": "DECISION#2026-05-03T14:35:20.000Z#decision_01H...",
  "entityType": "AI_DECISION",
  "schemaVersion": 1,
  "accountId": "0a6343d3-ef4a-4a17-b3dc-416130ec7326",
  "decisionId": "decision_01H...",
  "snapshotId": "snapshot_2026-05-03_1435",
  "symbol": "NVDA",
  "createdAt": "2026-05-03T14:35:20.000Z",
  "promptVersion": "trading-pipeline-v1",
  "model": "mock-policy-engine",
  "aiDecision": {
    "symbol": "NVDA",
    "action": "plan_buy",
    "quantity": 4,
    "triggerPrice": 928.36,
    "stopLossPrice": 890,
    "takeProfitPrice": 1010,
    "confidence": 78,
    "reason": "NVDA has positive momentum with acceptable volatility.",
    "riskNotes": "Trade value is below max trade size and stop loss is valid."
  },
  "riskReview": {
    "approved": true,
    "finalAction": "plan_buy",
    "reasons": []
  },
  "inputSummary": {
    "portfolioTotalValue": 184263.78,
    "buyingPower": 25684.5,
    "currentPrice": 928.36,
    "momentumPercent": 2.24,
    "volatilityPercent": 1.4,
    "volumeRatio": 1.28,
    "positionAllocationPercent": 21.2,
    "marketContextSummary": "Semiconductors remain constructive."
  }
}
```

Store a compact `inputSummary` on the decision item for quick timeline rendering. Store large prompt inputs and candle details in the `MarketSnapshot` records so decision rows stay small.

### Trade Plan

```json
{
  "pk": "ACCOUNT#0a6343d3-ef4a-4a17-b3dc-416130ec7326",
  "sk": "PLAN#2026-05-03T14:35:20.000Z#plan_01H...",
  "entityType": "TRADE_PLAN",
  "schemaVersion": 1,
  "accountId": "0a6343d3-ef4a-4a17-b3dc-416130ec7326",
  "planId": "plan_01H...",
  "decisionId": "decision_01H...",
  "snapshotId": "snapshot_2026-05-03_1435",
  "symbol": "NVDA",
  "side": "buy",
  "quantity": 4,
  "triggerPrice": 928.36,
  "stopLossPrice": 890,
  "takeProfitPrice": 1010,
  "confidence": 78,
  "status": "planned",
  "reason": "NVDA has positive momentum with acceptable volatility.",
  "riskNotes": "Trade value is below max trade size and stop loss is valid.",
  "createdAt": "2026-05-03T14:35:20.000Z",
  "updatedAt": "2026-05-03T14:35:20.000Z"
}
```

### LLM Influence

Each decision also writes a compact LLM influence item so the market-context effect can be analyzed without scanning full decision records.

```json
{
  "pk": "ACCOUNT#0a6343d3-ef4a-4a17-b3dc-416130ec7326",
  "sk": "LLM_INFLUENCE#2026-05-04T16:18:25.534Z#decision_01H...",
  "entityType": "LLM_INFLUENCE",
  "schemaVersion": 1,
  "accountId": "0a6343d3-ef4a-4a17-b3dc-416130ec7326",
  "decisionId": "decision_01H...",
  "symbol": "NVDA",
  "action": "plan_buy",
  "riskApprovedFinalAction": "plan_buy",
  "preLlmConfidence": 72,
  "finalConfidence": 78,
  "confidenceDelta": 6,
  "noTradeBiasApplied": false,
  "llmInfluence": {
    "view": "constructive",
    "opportunityScore": 78,
    "riskScore": 25,
    "confidenceScore": 82,
    "confidenceAdjustment": 6,
    "noTradeBiasApplied": false
  },
  "createdAt": "2026-05-04T16:18:25.534Z"
}
```

### Portfolio Snapshot

```json
{
  "pk": "ACCOUNT#0a6343d3-ef4a-4a17-b3dc-416130ec7326",
  "sk": "PORTFOLIO#2026-05-03T14:35:20.000Z",
  "entityType": "PORTFOLIO_SNAPSHOT",
  "schemaVersion": 1,
  "accountId": "0a6343d3-ef4a-4a17-b3dc-416130ec7326",
  "cash": 12842.25,
  "buyingPower": 25684.5,
  "totalValue": 184263.78,
  "maxPositionPercent": 25,
  "maxTradeValuePercent": 8,
  "minConfidence": 65,
  "positions": [
    {
      "symbol": "NVDA",
      "name": "NVIDIA",
      "shares": 42,
      "averageCost": 812.4,
      "price": 928.36,
      "allocationPercent": 21.2
    }
  ],
  "createdAt": "2026-05-03T14:35:20.000Z"
}
```

## Frontend DTO

The API should avoid sending raw DynamoDB records directly to React. Convert items into a frontend DTO.

```ts
export type TradeHistoryItem = {
  id: string;
  accountId: string;
  symbol: string;
  action: "buy" | "sell" | "trim" | "hold" | "plan_buy" | "plan_sell" | "watch";
  side?: "buy" | "sell";
  status: "planned" | "blocked" | "executed" | "canceled" | "failed" | "held" | "watched";
  quantity: number;
  price?: number;
  triggerPrice?: number;
  grossValue?: number;
  netValue?: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  occurredAt: string;
  aiThought: {
    summary: string;
    reason: string;
    riskNotes: string;
    confidence: number;
    model: string;
    promptVersion: string;
  };
  riskReview: {
    approved: boolean;
    finalAction: string;
    reasons: string[];
  };
  marketContext?: {
    snapshotId: string;
    summary: string;
    themes: string[];
  };
};
```

`aiTrading.getTradeHistory` should return:

```ts
{
  items: TradeHistoryItem[];
  nextCursor?: string;
}
```

## Write Flow

When `runTradingPipeline()` runs:

1. Write one `MARKET_SNAPSHOT` item and related `CANDLE` items.
2. Write a `PORTFOLIO_SNAPSHOT` item.
3. For each AI output, write an `AI_DECISION` item.
4. For each AI output, write an `LLM_INFLUENCE` item.
5. If risk validation creates a plan, write a `TRADE_PLAN` item.
6. If an Alpaca paper order is accepted, write an `EXECUTED_TRADE` item with broker metadata.
7. Write account-level `TRADE_HISTORY_ITEM` records for decisions, plans, and executed trades.

The current implementation writes in DynamoDB batch chunks of 25 items. Use conditional writes or transactions later only for records that must become strictly idempotent across Lambda retries.

## Read Patterns

### Dashboard

Query:

```txt
pk = ACCOUNT#{accountId}
sk begins_with PORTFOLIO#CURRENT
```

Then query recent history:

```txt
gsi1pk = ACCOUNT#{accountId}#TYPE#EXECUTED_TRADE
scanIndexForward = false
limit = 10
```

### Trade History

Query:

```txt
gsi1pk = ACCOUNT#{accountId}#HISTORY
gsi1sk between {from} and {to}
scanIndexForward = false
```

### AI Thoughts Timeline

Query:

```txt
gsi1pk = ACCOUNT#{accountId}#TYPE#AI_DECISION
scanIndexForward = false
```

### Symbol History

Current API query:

```txt
gsi1pk = ACCOUNT#{accountId}#HISTORY
gsi1sk between {from} and {to}
FilterExpression: symbol = {symbol}
scanIndexForward = false
```

Future optimized query after the API is moved to `gsi2`:

```txt
gsi2pk = SYMBOL#{symbol}#TYPE#EXECUTED_TRADE
scanIndexForward = false
```

## Implementation Notes

- Keep `DecisionLogEntry`, `TradePlan`, and `ExecutedTrade` from `src/api/src/trading/types.ts` as the source domain types.
- Add a persistence module such as `src/api/src/trading/tradingRepository.ts`.
- Map DynamoDB records to frontend DTOs in the router layer or a small service layer, not in React.
- Do not store secrets, raw API keys, or complete broker account payloads in trade history items.
- Store large LLM prompts only if audit requirements need them. Otherwise store prompt version, model, structured inputs, and AI output.
- Prefer ISO 8601 timestamps in UTC for all sort keys.
- Use `accountId` from the broker/paper account, not a display name, as the stable partition identifier.
