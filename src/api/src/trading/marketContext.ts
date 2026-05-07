import { getConfig } from '../process';
import type { MarketContext, MarketSnapshot, PortfolioState, TradingSignal } from './types';
import { getStrategyBucket, rankSignalsForStrategy } from './strategy';
import { RateLimitError, withRateLimitRetry } from './rateLimitRetry';

type MarketContextInput = {
  portfolio: PortfolioState;
  snapshot: MarketSnapshot;
  signals: TradingSignal[];
};

const PROMPT_CANDIDATE_LIMIT_PER_BUCKET = 8;

function clampScore(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function fallbackScores(signal: TradingSignal) {
  const momentumScore = clampScore(50 + signal.momentumPercent * 8 + (signal.volumeRatio - 1) * 20, 50);
  const riskScore = clampScore(signal.volatilityPercent * 12 + (signal.signal === 'bearish' ? 20 : 0), 50);
  const confidence = clampScore(signal.signal === 'bullish' ? momentumScore - riskScore * 0.25 + 20 : 55 - riskScore * 0.2, 50);

  return {
    opportunity: momentumScore,
    risk: riskScore,
    confidence,
  };
}

function compactSignal(signal: TradingSignal) {
  return {
    s: signal.symbol,
    bucket: getStrategyBucket(signal.symbol),
    px: signal.currentPrice,
    mom: signal.momentumPercent,
    vol: signal.volatilityPercent,
    vr: signal.volumeRatio,
    alloc: signal.positionAllocationPercent,
    signal: signal.signal,
  };
}

function selectPromptCandidates(signals: TradingSignal[], portfolio: PortfolioState): TradingSignal[] {
  const heldSymbols = new Set(portfolio.positions.map((position) => position.symbol));
  const buckets = ['etf', 'safe_stock', 'aggressive_stock', 'unclassified'] as const;
  const selected = new Map<string, TradingSignal>();

  for (const bucket of buckets) {
    const bucketSignals = signals.filter((signal) => getStrategyBucket(signal.symbol) === bucket);
    const rankedBullish = rankSignalsForStrategy(bucketSignals.filter((signal) => signal.signal === 'bullish')).slice(
      0,
      PROMPT_CANDIDATE_LIMIT_PER_BUCKET,
    );
    const rankedRisk = rankSignalsForStrategy(
      bucketSignals.filter(
        (signal) => signal.signal === 'bearish' || signal.volatilityPercent >= 3.5 || heldSymbols.has(signal.symbol),
      ),
    ).slice(0, PROMPT_CANDIDATE_LIMIT_PER_BUCKET);

    for (const signal of [...rankedBullish, ...rankedRisk]) {
      selected.set(signal.symbol, signal);
    }
  }

  return [...selected.values()];
}

function summarizeBuckets(signals: TradingSignal[]) {
  const buckets = ['etf', 'safe_stock', 'aggressive_stock', 'unclassified'] as const;

  return buckets.map((bucket) => {
    const bucketSignals = signals.filter((signal) => getStrategyBucket(signal.symbol) === bucket);

    return {
      bucket,
      symbols: bucketSignals.length,
      bullish: bucketSignals.filter((signal) => signal.signal === 'bullish').length,
      bearish: bucketSignals.filter((signal) => signal.signal === 'bearish').length,
      neutral: bucketSignals.filter((signal) => signal.signal === 'neutral').length,
      elevatedVolatility: bucketSignals.filter((signal) => signal.volatilityPercent >= 3.5).length,
    };
  });
}

function fallbackMarketContext(input: MarketContextInput, provider = 'deterministic-fallback', model = 'local-rules'): MarketContext {
  const bullish = input.signals.filter((signal) => signal.signal === 'bullish');
  const bearish = input.signals.filter((signal) => signal.signal === 'bearish');
  const elevatedVolatility = input.signals.filter((signal) => signal.volatilityPercent >= 3.5);

  return {
    generatedAt: new Date().toISOString(),
    provider,
    model,
    summary: `Market snapshot contains ${bullish.length} bullish, ${bearish.length} bearish, and ${elevatedVolatility.length} elevated-volatility symbols across the evaluated portfolio.`,
    themes: [
      bullish.length > bearish.length ? 'Momentum is broadly constructive.' : 'Momentum is mixed and requires selectivity.',
      elevatedVolatility.length > 0 ? 'Risk controls should account for elevated intraday volatility.' : 'Volatility is contained across the evaluated symbols.',
      `Portfolio buying power is ${input.portfolio.buyingPower.toFixed(2)} against total value ${input.portfolio.totalValue.toFixed(2)}.`,
    ],
    perSymbol: input.signals.map((signal) => ({
      symbol: signal.symbol,
      view: signal.signal === 'bullish' ? 'constructive' : signal.signal === 'bearish' ? 'cautious' : 'neutral',
      rationale: `${signal.symbol} has ${signal.momentumPercent}% momentum, ${signal.volatilityPercent}% volatility, and ${signal.volumeRatio}x relative volume.`,
      scores: fallbackScores(signal),
    })),
  };
}

function buildPrompt(input: MarketContextInput) {
  const promptCandidates = selectPromptCandidates(input.signals, input.portfolio);

  return [
    'Analyze the supplied portfolio market data for an AI trading system.',
    'Return strict JSON with this shape:',
    '{"summary":"string","themes":["string"],"perSymbol":[{"symbol":"string","view":"constructive|cautious|neutral","rationale":"string","scores":{"opportunity":0-100,"risk":0-100,"confidence":0-100}}]}',
    'Do not recommend order execution. Only summarize market context and symbol-level views for the candidateSignals list.',
    'Scores mean: opportunity=quality of the long setup, risk=downside/volatility risk, confidence=confidence in your view.',
    'Token budget rule: the backend already screened the full universe into compact signals. Do not ask for raw candles.',
    JSON.stringify(
      {
        portfolio: {
          cash: input.portfolio.cash,
          buyingPower: input.portfolio.buyingPower,
          totalValue: input.portfolio.totalValue,
          maxPositionPercent: input.portfolio.maxPositionPercent,
          positions: input.portfolio.positions.map((position) => ({
            s: position.symbol,
            shares: position.shares,
            cost: position.averageCost,
            px: position.price,
            alloc: position.allocationPercent,
            bucket: getStrategyBucket(position.symbol),
          })),
        },
        snapshot: {
          snapshotId: input.snapshot.snapshotId,
          capturedAt: input.snapshot.capturedAt,
          candleCount: input.snapshot.candles.length,
        },
        universeSummary: {
          evaluatedSymbols: input.signals.length,
          buckets: summarizeBuckets(input.signals),
        },
        screenedSignals: input.signals.map(compactSignal),
        candidateSignals: promptCandidates.map(compactSignal),
      },
      null,
    ),
  ].join('\n\n');
}

function normalizeLlmContext(value: any, input: MarketContextInput, provider: string, model: string): MarketContext {
  const fallback = fallbackMarketContext(input, provider, model);
  const fallbackBySymbol = new Map(fallback.perSymbol.map((item) => [item.symbol, item]));
  const perSymbol = Array.isArray(value?.perSymbol)
    ? value.perSymbol
        .filter((item: any) => typeof item?.symbol === 'string')
        .map((item: any) => {
          const symbol = String(item.symbol).toUpperCase();
          const fallbackSymbol = fallbackBySymbol.get(symbol);

          return {
            symbol,
            view: item.view === 'constructive' || item.view === 'cautious' || item.view === 'neutral' ? item.view : 'neutral',
            rationale: typeof item.rationale === 'string' ? item.rationale : 'No rationale returned by LLM.',
            scores: {
              opportunity: clampScore(item.scores?.opportunity, fallbackSymbol?.scores.opportunity ?? 50),
              risk: clampScore(item.scores?.risk, fallbackSymbol?.scores.risk ?? 50),
              confidence: clampScore(item.scores?.confidence, fallbackSymbol?.scores.confidence ?? 50),
            },
          };
        })
    : [];

  return {
    generatedAt: new Date().toISOString(),
    provider,
    model,
    summary: typeof value?.summary === 'string' ? value.summary : fallback.summary,
    themes: Array.isArray(value?.themes) ? value.themes.filter((item: any) => typeof item === 'string') : fallback.themes,
    perSymbol: perSymbol.length > 0 ? perSymbol : fallback.perSymbol,
  };
}

export async function buildMarketContext(input: MarketContextInput): Promise<MarketContext> {
  const config = await getConfig();

  if (!config.LLM_MARKET_CONTEXT_ENABLED || !config.LLM_API_KEY || !config.LLM_BASE_URL || !config.LLM_MODEL) {
    return fallbackMarketContext(input);
  }

  try {
    const response = await withRateLimitRetry('llm:market-context', async (attempt) => {
      const llmResponse = await fetch(config.LLM_BASE_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.LLM_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.LLM_MODEL,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: 'You are a market-context analyst for a paper-trading AI. You summarize data, but you do not execute trades.',
            },
            {
              role: 'user',
              content: buildPrompt(input),
            },
          ],
        }),
      });

      if (llmResponse.status === 429) {
        const bodyPreview = (await llmResponse.text()).slice(0, 500);
        throw new RateLimitError(`LLM request rate limited with ${llmResponse.status}`, {
          status: llmResponse.status,
          attempt,
          bodyPreview,
        });
      }

      if (!llmResponse.ok) {
        throw new Error(`LLM request failed with ${llmResponse.status}`);
      }

      return llmResponse;
    });

    const payload: any = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    const parsed = typeof content === 'string' ? JSON.parse(content) : content;

    return normalizeLlmContext(parsed, input, config.LLM_PROVIDER, config.LLM_MODEL);
  } catch (error) {
    console.warn('[marketContext] Falling back to deterministic market context:', error);
    return fallbackMarketContext(input, `${config.LLM_PROVIDER}-fallback`, config.LLM_MODEL || 'unconfigured');
  }
}
