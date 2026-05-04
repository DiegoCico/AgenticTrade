import { useState } from "react";
import { motion } from "framer-motion";
import type { TradeDecision } from "../../types/portfolio";
import { compactMoney } from "../../utils/formatters";

type RecentDecisionsProps = {
  buyingPower: number;
  trades: TradeDecision[];
};

export function RecentDecisions({ buyingPower, trades }: RecentDecisionsProps) {
  const [selectedTrade, setSelectedTrade] = useState<TradeDecision | null>(null);

  return (
    <>
      <section className="trades-panel">
        <div className="section-header">
          <h2>Recent AI decisions</h2>
          <span>{compactMoney.format(buyingPower)} buying power</span>
        </div>
        {trades.length === 0 && <p className="empty-copy">No decisions have been logged yet.</p>}
        <div className="decision-list">
          {trades.map((trade, index) => (
            <motion.button
              animate={{ opacity: 1, y: 0 }}
              className="trade-card decision-card decision-summary-card"
              initial={{ opacity: 0, y: 10 }}
              key={`${trade.time}-${trade.symbol}-${index}`}
              onClick={() => setSelectedTrade(trade)}
              transition={{ duration: 0.3, delay: index * 0.04 }}
              type="button"
            >
              <div className="decision-topline">
                <div>
                  <strong>
                    {formatAction(trade.action)} {trade.symbol}
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

              <p className="decision-summary-copy">{trade.reason}</p>

              <div className="decision-context-row">
                <span>{trade.journal ? formatBucket(trade.journal.strategyBucket) : "Legacy decision"}</span>
                <span>{trade.journal ? `${trade.journal.signal} · ${trade.journal.signalStrength}` : formatStatus(trade.status)}</span>
                <strong>View details</strong>
              </div>
            </motion.button>
          ))}
        </div>
      </section>

      {selectedTrade && <DecisionDetailsModal trade={selectedTrade} onClose={() => setSelectedTrade(null)} />}
    </>
  );
}

function DecisionDetailsModal({ onClose, trade }: { onClose: () => void; trade: TradeDecision }) {
  return (
    <div className="decision-modal-backdrop" onClick={onClose}>
      <motion.div
        animate={{ opacity: 1, y: 0, scale: 1 }}
        aria-labelledby="decision-modal-title"
        className="decision-modal"
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        transition={{ duration: 0.18 }}
      >
        <div className="decision-modal-header">
          <div>
            <span>{trade.time}</span>
            <h3 id="decision-modal-title">
              {formatAction(trade.action)} {trade.symbol}
            </h3>
          </div>
          <button aria-label="Close decision details" className="modal-close-button" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <div className="decision-badges modal-badges">
          <span className={`decision-pill ${trade.riskApproved ? "approved" : "blocked"}`}>
            {trade.riskApproved ? "Risk approved" : "Risk blocked"}
          </span>
          <span className="decision-pill">{formatStatus(trade.status)}</span>
          <span className="decision-pill">Confidence {trade.confidence}</span>
          {trade.quantity > 0 && <span className="decision-pill">Qty {trade.quantity}</span>}
        </div>

        <div className="decision-note">
          <strong>Decision reason</strong>
          <p>{trade.reason}</p>
        </div>

        {trade.journal ? (
          <>
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
              {trade.journal.checkpoints.map((checkpoint) => (
                <span key={checkpoint}>{checkpoint}</span>
              ))}
            </div>
          </>
        ) : (
          <div className="decision-note">
            <strong>Risk notes</strong>
            <p>{trade.riskNotes || trade.riskReasons.join(" ") || "No journal was stored for this decision."}</p>
          </div>
        )}
      </motion.div>
    </div>
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

function formatAction(action: string) {
  return action.replace(/_/g, " ");
}

function formatBucket(bucket: string) {
  return bucket.replace(/_/g, " ");
}

function formatSigned(value: number) {
  return value > 0 ? `+${value}` : String(value);
}
