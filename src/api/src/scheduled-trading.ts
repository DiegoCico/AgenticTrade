import { TRADING_AGENT_PROFILES, type TradingAgentId } from './trading/strategy';
import { runTradingPipeline } from './trading/pipeline';

const SCHEDULED_TRADING_AGENTS = Object.keys(TRADING_AGENT_PROFILES) as TradingAgentId[];

export async function handler(event: unknown) {
  console.log('[scheduled-trading] Starting scheduled trading evaluation', {
    event,
    startedAt: new Date().toISOString(),
  });

  const results = await Promise.all(
    SCHEDULED_TRADING_AGENTS.map(async (agentId) => {
      try {
        const result = await runTradingPipeline({ agentId });

        return {
          agentId,
          ok: true,
          evaluatedSignals: result.signals.length,
          decisions: result.decisions.length,
          tradePlans: result.tradePlans.length,
          executedTrades: result.executedTrades.length,
        };
      } catch (error) {
        console.error('[scheduled-trading] Agent evaluation failed', {
          agentId,
          error,
        });

        return {
          agentId,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );

  console.log('[scheduled-trading] Finished scheduled trading evaluation', {
    finishedAt: new Date().toISOString(),
    results,
  });

  return {
    ok: results.every((result) => result.ok),
    results,
  };
}
