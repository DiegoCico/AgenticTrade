import { useState } from "react";
import { AppHeader } from "./components/layout/AppHeader";
import portfolioData from "./data/portfolio.json";
import { PortfolioDashboard } from "./pages/PortfolioDashboard";
import { TradePlans } from "./components/dashboard/TradePlans";
import { RecentDecisions } from "./components/dashboard/RecentDecisions";
import { CurrentPositions } from "./components/dashboard/CurrentPositions";
import type { PortfolioData, Theme } from "./types/portfolio";
import "./App.css";

const data = portfolioData as PortfolioData;

export default function App() {
  const [activeTab, setActiveTab] = useState("portfolio");
  const [theme, setTheme] = useState<Theme>("dark");

  return (
    <main className="app-shell" data-theme={theme}>
      <AppHeader
        accountMode={data.account.mode}
        activeTab={activeTab}
        theme={theme}
        onSelectTab={setActiveTab}
        onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
      />
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
        <section className="catalog-page catalog-narrow">
          <RecentDecisions buyingPower={data.account.buyingPower} trades={data.trades} />
        </section>
      )}
    </main>
  );
}
