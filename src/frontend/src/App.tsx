import { useEffect, useState } from "react";
import { loadTradingDashboard, emptyPortfolioData } from "./api/tradingApi";
import { AppHeader } from "./components/layout/AppHeader";
import { PortfolioDashboard } from "./pages/PortfolioDashboard";
import { TradePlans } from "./components/dashboard/TradePlans";
import { RecentDecisions } from "./components/dashboard/RecentDecisions";
import { CurrentPositions } from "./components/dashboard/CurrentPositions";
import type { PortfolioData, Theme } from "./types/portfolio";
import "./App.css";

export default function App() {
  const [activeTab, setActiveTab] = useState("portfolio");
  const [data, setData] = useState<PortfolioData>(emptyPortfolioData);
  const [isLoading, setIsLoading] = useState(true);
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      console.log("[frontend:App] starting backend data load");
      setIsLoading(true);

      try {
        const nextData = await loadTradingDashboard();
        console.log("[frontend:App] backend data loaded", nextData);

        if (!cancelled) {
          setData(nextData);
        }
      } catch (error) {
        console.error("[frontend:App] backend data load failed; rendering empty state", error);

        if (!cancelled) {
          setData(emptyPortfolioData);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, []);

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
        accountMode={data.account.mode}
        activeTab={activeTab}
        theme={theme}
        onSelectTab={setActiveTab}
        onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
      />
      {isLoading && <div className="loading-strip">Loading backend data...</div>}
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
