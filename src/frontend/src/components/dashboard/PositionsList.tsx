import { motion } from "framer-motion";
import type { Position } from "../../types/portfolio";
import { money } from "../../utils/formatters";
import { getTradingViewChartUrl } from "../../utils/tradingView";
import { ChangeBadge } from "../common/ChangeBadge";

type PositionsListProps = {
  positions: Position[];
};

export function PositionsList({ positions }: PositionsListProps) {
  return (
    <div className="positions-panel">
      <div className="section-header">
        <h2>Positions</h2>
        <span>{positions.length} holdings</span>
      </div>
      <div className="positions-list">
        {positions.map((position, index) => (
          <motion.a
            animate={{ opacity: 1, x: 0 }}
            className="position-row"
            href={getTradingViewChartUrl(position.symbol)}
            initial={{ opacity: 0, x: -12 }}
            key={position.symbol}
            rel="noreferrer"
            target="_blank"
            transition={{ duration: 0.28, delay: index * 0.04 }}
            whileHover={{ scale: 1.01 }}
          >
            <div className="symbol-cell">
              <strong>{position.symbol}</strong>
              <span>{position.name}</span>
            </div>
            <div>
              <strong>{money.format(position.marketValue)}</strong>
              <span>{position.shares} shares</span>
            </div>
            <div>
              <strong>{money.format(position.price)}</strong>
              <ChangeBadge value={position.dayChangePercent} />
            </div>
            <div>
              <strong>{position.allocation}%</strong>
              <span>{position.aiSignal}</span>
            </div>
          </motion.a>
        ))}
      </div>
    </div>
  );
}
