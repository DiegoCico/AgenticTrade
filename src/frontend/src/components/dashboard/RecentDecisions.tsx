import { motion } from "framer-motion";
import type { TradeDecision } from "../../types/portfolio";
import { compactMoney } from "../../utils/formatters";

type RecentDecisionsProps = {
  buyingPower: number;
  trades: TradeDecision[];
};

export function RecentDecisions({ buyingPower, trades }: RecentDecisionsProps) {
  return (
    <section className="trades-panel">
      <div className="section-header">
        <h2>Recent AI decisions</h2>
        <span>{compactMoney.format(buyingPower)} buying power</span>
      </div>
      {trades.length === 0 && <p className="empty-copy">No decisions have been logged yet.</p>}
      {trades.map((trade, index) => (
        <motion.article
          animate={{ opacity: 1, y: 0 }}
          className="trade-card decision-card"
          initial={{ opacity: 0, y: 10 }}
          key={`${trade.time}-${trade.symbol}-${index}`}
          transition={{ duration: 0.3, delay: index * 0.06 }}
        >
          <div className="decision-topline">
            <div>
              <strong>
                {trade.action} {trade.symbol}
              </strong>
              <span>
                {trade.time} · {formatStatus(trade.status)}
              </span>
            </div>
            <div className="decision-badges">
              <span className={`decision-pill ${trade.riskApproved ? "approved" : "blocked"}`}>
                {trade.riskApproved ? "Risk approved" : "Risk blocked"}
              </span>
              <span className="decision-pill">Confidence {trade.confidence}</span>
            </div>
          </div>

          <p>{trade.reason}</p>

          {trade.journal && (
            <div className="decision-journal">
              <div className="decision-metrics">
                <Metric label="Bucket" value={formatBucket(trade.journal.strategyBucket)} />
                <Metric label="Signal" value={`${trade.journal.signal} · ${trade.journal.signalStrength}`} />
                <Metric label="Before LLM" value={String(trade.journal.preLlmConfidence)} />
                <Metric label="After LLM" value={String(trade.journal.finalConfidence)} />
                <Metric label="LLM impact" value={formatSigned(trade.journal.llmInfluence.confidenceAdjustment)} />
              </div>

              <div className="decision-scores" aria-label={`${trade.symbol} LLM scores`}>
                <Score label="Opportunity" value={trade.journal.llmInfluence.opportunityScore} />
                <Score label="Risk" value={trade.journal.llmInfluence.riskScore} />
                <Score label="LLM confidence" value={trade.journal.llmInfluence.confidenceScore} />
              </div>

              <div className="decision-note">
                <strong>{trade.journal.llmInfluence.noTradeBiasApplied ? "Why it was not bought" : "Why it was selected"}</strong>
                <p>{trade.journal.noTradeBias}</p>
              </div>

              <div className="decision-note">
                <strong>Execution journal</strong>
                <p>{trade.journal.executionPlan}</p>
              </div>

              <div className="checkpoint-list">
                {trade.journal.checkpoints.slice(0, 8).map((checkpoint) => (
                  <span key={checkpoint}>{checkpoint}</span>
                ))}
              </div>
            </div>
          )}

          {!trade.journal && (
            <div className="decision-note">
              <strong>Legacy decision</strong>
              <p>{trade.riskNotes || trade.riskReasons.join(" ") || "No journal was stored for this decision."}</p>
            </div>
          )}
        </motion.article>
      ))}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Score({ label, value }: { label: string; value: number }) {
  return (
    <div className="score-row">
      <span>{label}</span>
      <div>
        <i style={{ width: `${Math.max(4, Math.min(100, value))}%` }} />
      </div>
      <strong>{value}</strong>
    </div>
  );
}

function formatStatus(status: TradeDecision["status"]) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatBucket(bucket: string) {
  return bucket.replace(/_/g, " ");
}

function formatSigned(value: number) {
  return value > 0 ? `+${value}` : String(value);
}
