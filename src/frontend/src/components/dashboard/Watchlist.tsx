import type { WatchlistItem } from "../../types/portfolio";
import { money } from "../../utils/formatters";
import { getTradingViewChartUrl } from "../../utils/tradingView";
import { ChangeBadge } from "../common/ChangeBadge";

type WatchlistProps = {
  items: WatchlistItem[];
};

export function Watchlist({ items }: WatchlistProps) {
  return (
    <section className="watchlist-panel">
      <div className="section-header">
        <h2>Watchlist</h2>
        <span>AI tracked</span>
      </div>
      {items.map((item) => (
        <a className="watch-row" href={getTradingViewChartUrl(item.symbol)} key={item.symbol} rel="noreferrer" target="_blank">
          <strong>{item.symbol}</strong>
          <span>{money.format(item.price)}</span>
          <ChangeBadge value={item.changePercent} />
        </a>
      ))}
    </section>
  );
}
