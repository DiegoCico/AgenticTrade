import { getConfig } from '../process';
import type { MarketContext, MarketSnapshot, PortfolioState, TradingSignal } from './types';

type MarketContextInput = {
  portfolio: PortfolioState;
  snapshot: MarketSnapshot;
  signals: TradingSignal[];
};

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
    })),
  };
}

function buildPrompt(input: MarketContextInput) {
  return [
    'Analyze the supplied portfolio market data for an AI trading system.',
    'Return strict JSON with this shape:',
    '{"summary":"string","themes":["string"],"perSymbol":[{"symbol":"string","view":"constructive|cautious|neutral","rationale":"string"}]}',
    'Do not recommend order execution. Only summarize market context and symbol-level views.',
    JSON.stringify(
      {
        portfolio: {
          cash: input.portfolio.cash,
          buyingPower: input.portfolio.buyingPower,
          totalValue: input.portfolio.totalValue,
          maxPositionPercent: input.portfolio.maxPositionPercent,
          positions: input.portfolio.positions,
        },
        snapshot: {
          snapshotId: input.snapshot.snapshotId,
          capturedAt: input.snapshot.capturedAt,
          candles: input.snapshot.candles,
        },
        signals: input.signals,
      },
      null,
      2,
    ),
  ].join('\n\n');
}

function normalizeLlmContext(value: any, input: MarketContextInput, provider: string, model: string): MarketContext {
  const perSymbol = Array.isArray(value?.perSymbol)
    ? value.perSymbol
        .filter((item: any) => typeof item?.symbol === 'string')
        .map((item: any) => ({
          symbol: String(item.symbol).toUpperCase(),
          view: item.view === 'constructive' || item.view === 'cautious' || item.view === 'neutral' ? item.view : 'neutral',
          rationale: typeof item.rationale === 'string' ? item.rationale : 'No rationale returned by LLM.',
        }))
    : [];

  const fallback = fallbackMarketContext(input, provider, model);

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
    const response = await fetch(config.LLM_BASE_URL, {
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

    if (!response.ok) {
      throw new Error(`LLM request failed with ${response.status}`);
    }

    const payload: any = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    const parsed = typeof content === 'string' ? JSON.parse(content) : content;

    return normalizeLlmContext(parsed, input, config.LLM_PROVIDER, config.LLM_MODEL);
  } catch (error) {
    console.warn('[marketContext] Falling back to deterministic market context:', error);
    return fallbackMarketContext(input, `${config.LLM_PROVIDER}-fallback`, config.LLM_MODEL || 'unconfigured');
  }
}
