import { motion } from "framer-motion";
import { Info } from "lucide-react";
import type { Position } from "../../types/portfolio";
import { money } from "../../utils/formatters";
import { getTradingViewChartUrl } from "../../utils/tradingView";
import { ChangeBadge } from "../common/ChangeBadge";

type CurrentPositionsProps = {
  positions: Position[];
};

function actionClass(action: Position["lastAction"]) {
  if (action === "Bought") {
    return "buy";
  }

  if (action === "Sold" || action === "Trimmed") {
    return "sell";
  }

  return "hold";
}

export function CurrentPositions({ positions }: CurrentPositionsProps) {
  function openTradingView(symbol: string) {
    window.open(getTradingViewChartUrl(symbol), "_blank", "noopener,noreferrer");
  }

  return (
    <section className="current-positions-panel">
      <div className="section-header">
        <h2>Current positions</h2>
        <span>{positions.length} open holdings with AI action notes</span>
      </div>

      <div className="current-positions-list">
        {positions.map((position, index) => (
          <motion.article
            animate={{ opacity: 1, y: 0 }}
            className="current-position-row"
            initial={{ opacity: 0, y: 10 }}
            key={position.symbol}
            onClick={() => openTradingView(position.symbol)}
            role="link"
            tabIndex={0}
            transition={{ duration: 0.28, delay: index * 0.04 }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openTradingView(position.symbol);
              }
            }}
          >
            <div className="current-position-main">
              <strong>{position.symbol}</strong>
              <span>{position.name}</span>
            </div>

            <div>
              <span>Shares</span>
              <strong>{position.shares}</strong>
            </div>

            <div>
              <span>Current value</span>
              <strong>{money.format(position.marketValue)}</strong>
            </div>

            <div>
              <span>Day move</span>
              <ChangeBadge value={position.dayChangePercent} />
            </div>

            <div className="action-cell">
              <span className={`action-pill ${actionClass(position.lastAction)}`}>{position.lastAction}</span>
              <small>
                {position.actionTime} at {money.format(position.actionPrice)}
              </small>
            </div>

            <div className="thought-cell">
              <button
                className="thought-button"
                type="button"
                aria-label={`AI thoughts for ${position.symbol}`}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <Info size={16} />
              </button>
              <div className="thought-tooltip" role="tooltip">
                <strong>AI thoughts</strong>
                <p>{position.aiThought}</p>
              </div>
            </div>
          </motion.article>
        ))}
      </div>
    </section>
  );
}
