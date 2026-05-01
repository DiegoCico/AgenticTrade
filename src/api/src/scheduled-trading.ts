import { runTradingPipeline } from './trading/pipeline';

export async function handler(event: unknown) {
  console.log('[scheduled-trading] Starting scheduled trading evaluation', {
    event,
    startedAt: new Date().toISOString(),
  });

  const result = await runTradingPipeline();

  console.log('[scheduled-trading] Finished scheduled trading evaluation', {
    finishedAt: new Date().toISOString(),
    evaluatedSignals: result.signals.length,
    decisions: result.decisions.length,
    tradePlans: result.tradePlans.length,
    executedTrades: result.executedTrades.length,
  });

  return {
    ok: true,
    evaluatedSignals: result.signals.length,
    decisions: result.decisions.length,
  };
}
