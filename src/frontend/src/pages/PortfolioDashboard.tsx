import { motion } from "framer-motion";
import { Activity } from "lucide-react";
import { useState } from "react";
import { AIStatusPanel } from "../components/dashboard/AIStatusPanel";
import { PerformanceChart } from "../components/dashboard/PerformanceChart";
import { PositionsList } from "../components/dashboard/PositionsList";
import { Watchlist } from "../components/dashboard/Watchlist";
import type { PerformanceRange, PortfolioData } from "../types/portfolio";
import { formatPercent, money } from "../utils/formatters";

type PortfolioDashboardProps = {
  data: PortfolioData;
};

const ranges: PerformanceRange[] = ["1D", "1W", "1M", "3M", "1Y", "ALL"];

export function PortfolioDashboard({ data }: PortfolioDashboardProps) {
  const [range, setRange] = useState<PerformanceRange>("1D");
  const totalChange = data.portfolio.dayChange;

  return (
    <>
      <section className="hero-grid">
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="portfolio-main"
          initial={{ opacity: 0, y: 14 }}
          transition={{ duration: 0.36 }}
        >
          <div className="section-kicker">
            <Activity size={16} />
            Live portfolio
          </div>
          <h1>{money.format(data.portfolio.totalValue)}</h1>
          <p className={totalChange >= 0 ? "hero-change positive-text" : "hero-change negative-text"}>
            {totalChange >= 0 ? "+" : ""}
            {money.format(totalChange)} ({formatPercent(data.portfolio.dayChangePercent)}) today
          </p>
          <PerformanceChart points={data.performance[range]} range={range} />
          <div className="range-tabs" aria-label="Chart time range">
            {ranges.map((item) => (
              <button className={range === item ? "active" : ""} key={item} type="button" onClick={() => setRange(item)}>
                {item}
              </button>
            ))}
          </div>
        </motion.div>

        <AIStatusPanel data={data} />
      </section>

      <section className="content-grid">
        <PositionsList positions={data.positions} />

        <div className="right-column">
          <Watchlist items={data.watchlist} />
        </div>
      </section>
    </>
  );
}
