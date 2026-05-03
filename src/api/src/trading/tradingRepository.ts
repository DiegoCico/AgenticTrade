import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  QueryCommand,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { config } from '../process';
import type {
  DecisionLogEntry,
  ExecutedTrade,
  MarketSnapshot,
  PortfolioState,
  TradeAction,
  TradeHistoryItem,
  TradeHistoryResult,
  TradePlan,
} from './types';

const HISTORY_GSI_PK_PREFIX = 'ACCOUNT';
const TYPE_GSI_PK_PREFIX = 'TYPE';
const SYMBOL_GSI_PK_PREFIX = 'SYMBOL';
const STATUS_GSI_PK_PREFIX = 'STATUS';
const SCHEMA_VERSION = 1;
const DEFAULT_HISTORY_LIMIT = 50;
const MAX_HISTORY_LIMIT = 100;

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: config.REGION }),
  {
    marshallOptions: {
      removeUndefinedValues: true,
    },
  },
);

type TradeHistoryRecord = TradeHistoryItem & {
  pk: string;
  sk: string;
  entityType: 'TRADE_HISTORY_ITEM';
  schemaVersion: typeof SCHEMA_VERSION;
  createdAt: string;
  updatedAt: string;
  decisionId?: string;
  planId?: string;
  tradeId?: string;
  snapshotId?: string;
  gsi1pk: string;
  gsi1sk: string;
  gsi2pk: string;
  gsi2sk: string;
  gsi3pk: string;
  gsi3sk: string;
};

type PersistPipelineRunInput = {
  portfolio: PortfolioState;
  snapshot: MarketSnapshot;
  decisions: DecisionLogEntry[];
  tradePlans: TradePlan[];
  executedTrades: ExecutedTrade[];
};

export type GetTradeHistoryInput = {
  accountId?: string;
  symbol?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
};

function getTableName() {
  return config.TABLE_NAME;
}

function accountPk(accountId: string) {
  return `ACCOUNT#${accountId}`;
}

function historyPk(accountId: string) {
  return `${HISTORY_GSI_PK_PREFIX}#${accountId}#HISTORY`;
}

function typePk(accountId: string, entityType: string) {
  return `${HISTORY_GSI_PK_PREFIX}#${accountId}#${TYPE_GSI_PK_PREFIX}#${entityType}`;
}

function symbolPk(symbol: string, entityType: string) {
  return `${SYMBOL_GSI_PK_PREFIX}#${symbol}#${TYPE_GSI_PK_PREFIX}#${entityType}`;
}

function statusPk(status: string) {
  return `${STATUS_GSI_PK_PREFIX}#${status}`;
}

function encodeCursor(key: Record<string, unknown> | undefined) {
  return key ? Buffer.from(JSON.stringify(key), 'utf8').toString('base64url') : undefined;
}

function decodeCursor(cursor: string | undefined) {
  if (!cursor) return undefined;

  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function normalizeLimit(limit: number | undefined) {
  if (!limit || limit < 1) return DEFAULT_HISTORY_LIMIT;
  return Math.min(limit, MAX_HISTORY_LIMIT);
}

function toIsoLowerBound(from: string | undefined) {
  return from || '0000-00-00T00:00:00.000Z';
}

function toIsoUpperBound(to: string | undefined) {
  return to || '9999-12-31T23:59:59.999Z';
}

function findDecisionForSymbol(decisions: DecisionLogEntry[], symbol: string) {
  return decisions.find((decision) => decision.aiDecision.symbol === symbol);
}

function actionSide(action: TradeAction): 'buy' | 'sell' | undefined {
  if (action === 'buy' || action === 'plan_buy') return 'buy';
  if (action === 'sell' || action === 'trim' || action === 'plan_sell') return 'sell';
  return undefined;
}

function historyItemFromDecision(decision: DecisionLogEntry, accountId: string): TradeHistoryItem {
  const { aiDecision, riskReview } = decision;
  const status = aiDecision.action === 'watch' ? 'watched' : 'held';

  return {
    id: decision.id,
    accountId,
    symbol: aiDecision.symbol,
    action: aiDecision.action,
    side: actionSide(aiDecision.action),
    status,
    quantity: aiDecision.quantity,
    triggerPrice: aiDecision.triggerPrice,
    stopLossPrice: aiDecision.stopLossPrice,
    takeProfitPrice: aiDecision.takeProfitPrice,
    occurredAt: decision.createdAt,
    aiThought: {
      summary: decision.input.marketContext.summary,
      reason: aiDecision.reason,
      riskNotes: aiDecision.riskNotes,
      confidence: aiDecision.confidence,
      model: decision.model,
      promptVersion: decision.promptVersion,
    },
    riskReview,
    marketContext: {
      snapshotId: decision.snapshotId,
      summary: decision.input.marketContext.summary,
      themes: decision.input.marketContext.themes,
    },
  };
}

function historyItemFromPlan(plan: TradePlan, decision: DecisionLogEntry | undefined, accountId: string): TradeHistoryItem {
  return {
    id: plan.id,
    accountId,
    symbol: plan.symbol,
    action: plan.side === 'buy' ? 'plan_buy' : 'plan_sell',
    side: plan.side,
    status: plan.status,
    quantity: plan.quantity,
    triggerPrice: plan.triggerPrice,
    stopLossPrice: plan.stopLossPrice,
    takeProfitPrice: plan.takeProfitPrice,
    occurredAt: plan.createdAt,
    aiThought: {
      summary: decision?.input.marketContext.summary ?? plan.reason,
      reason: plan.reason,
      riskNotes: plan.riskNotes,
      confidence: plan.confidence,
      model: decision?.model ?? 'unknown',
      promptVersion: decision?.promptVersion ?? 'unknown',
    },
    riskReview: decision?.riskReview ?? {
      approved: plan.status === 'planned',
      finalAction: plan.side === 'buy' ? 'plan_buy' : 'plan_sell',
      reasons: plan.status === 'blocked' ? [plan.riskNotes] : [],
    },
    marketContext: decision
      ? {
          snapshotId: decision.snapshotId,
          summary: decision.input.marketContext.summary,
          themes: decision.input.marketContext.themes,
        }
      : undefined,
  };
}

function historyItemFromTrade(
  trade: ExecutedTrade,
  decision: DecisionLogEntry | undefined,
  accountId: string,
): TradeHistoryItem {
  const grossValue = Number((trade.quantity * trade.price).toFixed(2));

  return {
    id: trade.id,
    accountId,
    symbol: trade.symbol,
    action: trade.action,
    side: actionSide(trade.action),
    status: 'executed',
    quantity: trade.quantity,
    price: trade.price,
    grossValue,
    netValue: grossValue,
    stopLossPrice: trade.stopLossPrice,
    takeProfitPrice: trade.takeProfitPrice,
    occurredAt: trade.executedAt,
    aiThought: {
      summary: decision?.input.marketContext.summary ?? trade.reason,
      reason: trade.reason,
      riskNotes: decision?.aiDecision.riskNotes ?? '',
      confidence: decision?.aiDecision.confidence ?? 0,
      model: decision?.model ?? 'unknown',
      promptVersion: decision?.promptVersion ?? 'unknown',
    },
    riskReview: decision?.riskReview ?? {
      approved: true,
      finalAction: trade.action,
      reasons: [],
    },
    marketContext: decision
      ? {
          snapshotId: decision.snapshotId,
          summary: decision.input.marketContext.summary,
          themes: decision.input.marketContext.themes,
        }
      : undefined,
  };
}

function toHistoryRecord(item: TradeHistoryItem, extra: { decisionId?: string; planId?: string; tradeId?: string; snapshotId?: string }) {
  const timestampAndId = `${item.occurredAt}#${item.id}`;

  return {
    ...item,
    pk: accountPk(item.accountId),
    sk: `HISTORY#${timestampAndId}`,
    entityType: 'TRADE_HISTORY_ITEM',
    schemaVersion: SCHEMA_VERSION,
    createdAt: item.occurredAt,
    updatedAt: item.occurredAt,
    ...extra,
    gsi1pk: historyPk(item.accountId),
    gsi1sk: timestampAndId,
    gsi2pk: symbolPk(item.symbol, 'TRADE_HISTORY_ITEM'),
    gsi2sk: `${item.occurredAt}#${item.accountId}#${item.id}`,
    gsi3pk: statusPk(item.status),
    gsi3sk: `${item.occurredAt}#${item.accountId}#${item.id}`,
  } satisfies TradeHistoryRecord;
}

function toPutRequest(item: Record<string, unknown>) {
  return {
    PutRequest: {
      Item: item,
    },
  };
}

async function batchWriteAll(items: Record<string, unknown>[]) {
  const tableName = getTableName();

  console.log('[tradingRepository] batchWriteAll input', {
    tableName,
    itemCount: items.length,
    entityTypes: items.map((item) => item.entityType),
  });

  for (let index = 0; index < items.length; index += 25) {
    const chunk = items.slice(index, index + 25);
    console.log('[tradingRepository] writing chunk', {
      tableName,
      from: index,
      to: index + chunk.length,
      itemCount: chunk.length,
    });

    await client.send(
      new BatchWriteCommand({
        RequestItems: {
          [tableName]: chunk.map(toPutRequest),
        },
      }),
    );
  }
}

function buildPersistenceItems(input: PersistPipelineRunInput) {
  const now = new Date().toISOString();
  const accountId = input.portfolio.accountId;
  const items: Record<string, unknown>[] = [
    {
      pk: accountPk(accountId),
      sk: 'PORTFOLIO#CURRENT',
      entityType: 'PORTFOLIO_CURRENT',
      schemaVersion: SCHEMA_VERSION,
      ...input.portfolio,
      createdAt: now,
      updatedAt: now,
    },
    {
      pk: accountPk(accountId),
      sk: `PORTFOLIO#${now}`,
      entityType: 'PORTFOLIO_SNAPSHOT',
      schemaVersion: SCHEMA_VERSION,
      ...input.portfolio,
      createdAt: now,
      gsi1pk: typePk(accountId, 'PORTFOLIO_SNAPSHOT'),
      gsi1sk: `${now}#${accountId}`,
    },
    {
      pk: `SNAPSHOT#${input.snapshot.snapshotId}`,
      sk: 'METADATA',
      entityType: 'MARKET_SNAPSHOT',
      schemaVersion: SCHEMA_VERSION,
      ...input.snapshot,
      createdAt: input.snapshot.capturedAt,
      updatedAt: now,
    },
  ];

  for (const candle of input.snapshot.candles) {
    items.push({
      pk: `SNAPSHOT#${input.snapshot.snapshotId}`,
      sk: `CANDLE#${candle.symbol}#${candle.timestamp}`,
      entityType: 'MARKET_CANDLE',
      schemaVersion: SCHEMA_VERSION,
      ...candle,
      snapshotId: input.snapshot.snapshotId,
      createdAt: input.snapshot.capturedAt,
      gsi2pk: symbolPk(candle.symbol, 'MARKET_CANDLE'),
      gsi2sk: `${candle.timestamp}#${input.snapshot.snapshotId}`,
    });
  }

  for (const decision of input.decisions) {
    const decisionItem = {
      pk: accountPk(accountId),
      sk: `DECISION#${decision.createdAt}#${decision.id}`,
      entityType: 'AI_DECISION',
      schemaVersion: SCHEMA_VERSION,
      accountId,
      decisionId: decision.id,
      symbol: decision.aiDecision.symbol,
      ...decision,
      gsi1pk: typePk(accountId, 'AI_DECISION'),
      gsi1sk: `${decision.createdAt}#${decision.id}`,
      gsi2pk: symbolPk(decision.aiDecision.symbol, 'AI_DECISION'),
      gsi2sk: `${decision.createdAt}#${accountId}#${decision.id}`,
    };

    items.push(decisionItem);

    if (decision.aiDecision.action === 'hold' || decision.aiDecision.action === 'watch') {
      items.push(
        toHistoryRecord(historyItemFromDecision(decision, accountId), {
          decisionId: decision.id,
          snapshotId: decision.snapshotId,
        }),
      );
    }
  }

  for (const plan of input.tradePlans) {
    const decision = findDecisionForSymbol(input.decisions, plan.symbol);

    items.push({
      pk: accountPk(accountId),
      sk: `PLAN#${plan.createdAt}#${plan.id}`,
      entityType: 'TRADE_PLAN',
      schemaVersion: SCHEMA_VERSION,
      accountId,
      planId: plan.id,
      decisionId: decision?.id,
      snapshotId: decision?.snapshotId,
      ...plan,
      gsi1pk: typePk(accountId, 'TRADE_PLAN'),
      gsi1sk: `${plan.createdAt}#${plan.id}`,
      gsi2pk: symbolPk(plan.symbol, 'TRADE_PLAN'),
      gsi2sk: `${plan.createdAt}#${accountId}#${plan.id}`,
      gsi3pk: statusPk(plan.status),
      gsi3sk: `${plan.createdAt}#${accountId}#${plan.id}`,
    });

    items.push(
      toHistoryRecord(historyItemFromPlan(plan, decision, accountId), {
        decisionId: decision?.id,
        planId: plan.id,
        snapshotId: decision?.snapshotId,
      }),
    );
  }

  for (const trade of input.executedTrades) {
    const decision = findDecisionForSymbol(input.decisions, trade.symbol);

    items.push({
      pk: accountPk(accountId),
      sk: `TRADE#${trade.executedAt}#${trade.id}`,
      entityType: 'EXECUTED_TRADE',
      schemaVersion: SCHEMA_VERSION,
      accountId,
      tradeId: trade.id,
      decisionId: decision?.id,
      snapshotId: decision?.snapshotId,
      ...trade,
      grossValue: Number((trade.quantity * trade.price).toFixed(2)),
      gsi1pk: typePk(accountId, 'EXECUTED_TRADE'),
      gsi1sk: `${trade.executedAt}#${trade.id}`,
      gsi2pk: symbolPk(trade.symbol, 'EXECUTED_TRADE'),
      gsi2sk: `${trade.executedAt}#${accountId}#${trade.id}`,
      gsi3pk: statusPk('executed'),
      gsi3sk: `${trade.executedAt}#${accountId}#${trade.id}`,
    });

    items.push(
      toHistoryRecord(historyItemFromTrade(trade, decision, accountId), {
        decisionId: decision?.id,
        tradeId: trade.id,
        snapshotId: decision?.snapshotId,
      }),
    );
  }

  return items;
}

export async function persistPipelineRun(input: PersistPipelineRunInput) {
  try {
    console.log('[tradingRepository] persistPipelineRun input', {
      accountId: input.portfolio.accountId,
      snapshotId: input.snapshot.snapshotId,
      decisions: input.decisions.length,
      tradePlans: input.tradePlans.length,
      executedTrades: input.executedTrades.length,
      candles: input.snapshot.candles.length,
    });

    const items = buildPersistenceItems(input);
    console.log('[tradingRepository] persistPipelineRun built items', {
      itemCount: items.length,
      keys: items.map((item) => ({ pk: item.pk, sk: item.sk, entityType: item.entityType })),
    });

    await batchWriteAll(items);
  } catch (error) {
    console.warn('[tradingRepository] Failed to persist trading pipeline run', error);
  }
}

function toTradeHistoryItem(record: TradeHistoryRecord): TradeHistoryItem {
  return {
    id: record.id,
    accountId: record.accountId,
    symbol: record.symbol,
    action: record.action,
    side: record.side,
    status: record.status,
    quantity: record.quantity,
    price: record.price,
    triggerPrice: record.triggerPrice,
    grossValue: record.grossValue,
    netValue: record.netValue,
    stopLossPrice: record.stopLossPrice,
    takeProfitPrice: record.takeProfitPrice,
    occurredAt: record.occurredAt,
    aiThought: record.aiThought,
    riskReview: record.riskReview,
    marketContext: record.marketContext,
  };
}

export async function getTradeHistory(input: GetTradeHistoryInput = {}): Promise<TradeHistoryResult> {
  const accountId = input.accountId ?? 'paper-agentictrade';
  const limit = normalizeLimit(input.limit);
  const from = toIsoLowerBound(input.from);
  const to = toIsoUpperBound(input.to);
  const cursor = decodeCursor(input.cursor);

  console.log('[tradingRepository] getTradeHistory input', {
    rawInput: input,
    accountId,
    limit,
    from,
    to,
    hasCursor: Boolean(cursor),
  });

  const query: QueryCommandInput = input.symbol
    ? {
        TableName: getTableName(),
        IndexName: 'gsi1',
        KeyConditionExpression: 'gsi1pk = :pk AND gsi1sk BETWEEN :from AND :to',
        ExpressionAttributeValues: {
          ':pk': historyPk(accountId),
          ':from': from,
          ':to': `${to}~`,
          ':symbol': input.symbol.toUpperCase(),
        },
        FilterExpression: 'symbol = :symbol',
        ScanIndexForward: false,
        Limit: limit,
        ExclusiveStartKey: cursor,
      }
    : {
        TableName: getTableName(),
        IndexName: 'gsi1',
        KeyConditionExpression: 'gsi1pk = :pk AND gsi1sk BETWEEN :from AND :to',
        ExpressionAttributeValues: {
          ':pk': historyPk(accountId),
          ':from': from,
          ':to': `${to}~`,
        },
        ScanIndexForward: false,
        Limit: limit,
        ExclusiveStartKey: cursor,
      };

  const result = await client.send(new QueryCommand(query));
  console.log('[tradingRepository] getTradeHistory query result', {
    accountId,
    symbol: input.symbol,
    count: result.Count,
    scannedCount: result.ScannedCount,
    items: result.Items?.length ?? 0,
    hasNextCursor: Boolean(result.LastEvaluatedKey),
  });

  return {
    items: (result.Items ?? []).map((item) => toTradeHistoryItem(item as TradeHistoryRecord)),
    nextCursor: encodeCursor(result.LastEvaluatedKey),
  };
}
