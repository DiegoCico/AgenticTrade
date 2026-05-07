import { useEffect, useState } from "react";
import { defaultTradingAgentId, emptyPortfolioData, loadTradingDashboard, tradingAgentOptions } from "./api/tradingApi";
import { AppHeader } from "./components/layout/AppHeader";
import { PortfolioDashboard } from "./pages/PortfolioDashboard";
import { TradePlans } from "./components/dashboard/TradePlans";
import { RecentDecisions } from "./components/dashboard/RecentDecisions";
import { CurrentPositions } from "./components/dashboard/CurrentPositions";
import type { PortfolioData, Theme, TradingAgentId } from "./types/portfolio";
import "./App.css";

const PORTFOLIO_REFRESH_INTERVAL_MS = 10_000;
const PORTFOLIO_REFRESH_WINDOW_MS = 5 * 60_000;

export default function App() {
  const [activeTab, setActiveTab] = useState("portfolio");
  const [data, setData] = useState<PortfolioData>(emptyPortfolioData);
  const [isLoading, setIsLoading] = useState(true);
  const [isPollingExpired, setIsPollingExpired] = useState(false);
  const [theme, setTheme] = useState<Theme>("dark");
  const [selectedAgentId, setSelectedAgentId] = useState<TradingAgentId>(defaultTradingAgentId);

  useEffect(() => {
    let cancelled = false;
    let isRequestInFlight = false;
    let hasLoadedOnce = false;

    async function loadData({ showLoading }: { showLoading: boolean }) {
      if (isRequestInFlight) return;
      isRequestInFlight = true;
      console.log("[frontend:App] starting backend data load");

      if (showLoading) {
        setIsLoading(true);
      }

      try {
        const nextData = await loadTradingDashboard(selectedAgentId);
        console.log("[frontend:App] backend data loaded", nextData);

        if (!cancelled) {
          setData(nextData);
          hasLoadedOnce = true;
        }
      } catch (error) {
        console.error("[frontend:App] backend data load failed; rendering empty state", error);

        if (!cancelled && !hasLoadedOnce) {
          setData(emptyPortfolioData);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
        isRequestInFlight = false;
      }
    }

    loadData({ showLoading: true });

    const refreshInterval = window.setInterval(() => {
      loadData({ showLoading: false });
    }, PORTFOLIO_REFRESH_INTERVAL_MS);

    const refreshTimeout = window.setTimeout(() => {
      window.clearInterval(refreshInterval);

      if (!cancelled) {
        setIsPollingExpired(true);
      }
    }, PORTFOLIO_REFRESH_WINDOW_MS);

    return () => {
      cancelled = true;
      window.clearInterval(refreshInterval);
      window.clearTimeout(refreshTimeout);
    };
  }, [selectedAgentId]);

  console.log("[frontend:App] render", {
    activeTab,
    isLoading,
    positions: data.positions.length,
    plans: data.plans.length,
    trades: data.trades.length,
  });

  return (
    <main className="app-shell" data-theme={theme}>
      <AppHeader
        agents={tradingAgentOptions}
        selectedAgentId={selectedAgentId}
        activeTab={activeTab}
        theme={theme}
        onSelectAgent={setSelectedAgentId}
        onSelectTab={setActiveTab}
        onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
      />
      {isLoading && <div className="loading-strip">Loading backend data...</div>}
      {isPollingExpired && <div className="loading-strip">Live updates paused after 5 minutes. Refresh the page to resume.</div>}
      {activeTab === "portfolio" && <PortfolioDashboard data={data} />}
      {activeTab === "positions" && (
        <section className="catalog-page">
          <CurrentPositions positions={data.positions} />
        </section>
      )}
      {activeTab === "plans" && (
        <section className="catalog-page">
          <TradePlans plans={data.plans} />
        </section>
      )}
      {activeTab === "decisions" && (
        <section className="catalog-page">
          <RecentDecisions buyingPower={data.account.buyingPower} trades={data.trades} />
        </section>
      )}
    </main>
  );
}
