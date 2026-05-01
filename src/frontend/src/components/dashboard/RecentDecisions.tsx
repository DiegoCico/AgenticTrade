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
      {trades.map((trade, index) => (
        <motion.article
          animate={{ opacity: 1, y: 0 }}
          className="trade-card"
          initial={{ opacity: 0, y: 10 }}
          key={`${trade.time}-${trade.symbol}`}
          transition={{ duration: 0.3, delay: index * 0.06 }}
        >
          <div>
            <strong>
              {trade.action} {trade.symbol}
            </strong>
            <span>{trade.time}</span>
          </div>
          <p>{trade.reason}</p>
        </motion.article>
      ))}
    </section>
  );
}
