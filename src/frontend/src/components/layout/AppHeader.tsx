import { Moon, Search, Sun } from "lucide-react";
import type { Theme } from "../../types/portfolio";

type AppHeaderProps = {
  accountMode: string;
  activeTab: string;
  theme: Theme;
  onSelectTab: (tab: string) => void;
  onToggleTheme: () => void;
};

const tabs = [
  { id: "portfolio", label: "Portfolio" },
  { id: "plans", label: "Trade plans" },
  { id: "decisions", label: "Decisions" },
];

export function AppHeader({ accountMode, activeTab, theme, onSelectTab, onToggleTheme }: AppHeaderProps) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-logo-chip">
          <img alt="AgenticTrade logo" className="brand-logo" src="/logo.png" />
        </span>
      </div>
      <nav className="top-tabs" aria-label="Dashboard sections">
        {tabs.map((tab) => (
          <button className={activeTab === tab.id ? "active" : ""} key={tab.id} type="button" onClick={() => onSelectTab(tab.id)}>
            {tab.label}
          </button>
        ))}
      </nav>
      <label className="search">
        <Search size={18} />
        <input aria-label="Search symbols" placeholder="Search symbols" />
      </label>
      <span className="account-pill">{accountMode}</span>
      <button className="icon-button" type="button" onClick={onToggleTheme}>
        {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        <span className="sr-only">Toggle theme</span>
      </button>
    </header>
  );
}
