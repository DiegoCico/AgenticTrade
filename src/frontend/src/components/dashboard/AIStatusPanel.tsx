import { motion } from "framer-motion";
import { RefreshCcw } from "lucide-react";
import type { PortfolioData } from "../../types/portfolio";
import { formatPercent, formatUpdatedAt, money } from "../../utils/formatters";

type AIStatusPanelProps = {
  data: PortfolioData;
};

export function AIStatusPanel({ data }: AIStatusPanelProps) {
  const hasPositions = data.positions.length > 0;

  return (
    <motion.aside
      animate={{ opacity: 1, y: 0 }}
      className="side-panel"
      initial={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.35, delay: 0.08 }}
    >
      <div className="panel-heading">
        <div>
          <span>AI status</span>
          <strong>Monitoring market</strong>
        </div>
        <RefreshCcw className="status-spin" size={18} />
      </div>
      <div className="metric-list">
        <div>
          <span>Account</span>
          <strong>{data.account.name}</strong>
        </div>
        <div>
          <span>Agent</span>
          <strong>{data.account.mode}</strong>
        </div>
        <div>
          <span>Total return</span>
          <strong className="positive-text">
            {money.format(data.portfolio.totalReturn)} ({formatPercent(data.portfolio.totalReturnPercent)})
          </strong>
        </div>
        <div>
          <span>Win rate</span>
          <strong>{data.portfolio.winRate}%</strong>
        </div>
        <div>
          <span>Risk score</span>
          <strong>{hasPositions ? `${data.portfolio.riskScore}/100` : "--"}</strong>
        </div>
        <div>
          <span>Cash</span>
          <strong>{money.format(data.account.cash)}</strong>
        </div>
      </div>
      <p className="timestamp">Updated {formatUpdatedAt(data.account.lastUpdated)}</p>
    </motion.aside>
  );
}
