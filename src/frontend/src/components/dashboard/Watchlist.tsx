import type { WatchlistItem } from "../../types/portfolio";
import { money } from "../../utils/formatters";
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
        <div className="watch-row" key={item.symbol}>
          <strong>{item.symbol}</strong>
          <span>{money.format(item.price)}</span>
          <ChangeBadge value={item.changePercent} />
        </div>
      ))}
    </section>
  );
}
