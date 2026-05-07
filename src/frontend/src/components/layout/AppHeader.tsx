import { Moon, Sun } from "lucide-react";
import type { Theme, TradingAgentId, TradingAgentOption } from "../../types/portfolio";

type AppHeaderProps = {
  agents: readonly TradingAgentOption[];
  selectedAgentId: TradingAgentId;
  activeTab: string;
  theme: Theme;
  onSelectAgent: (agentId: TradingAgentId) => void;
  onSelectTab: (tab: string) => void;
  onToggleTheme: () => void;
};

const tabs = [
  { id: "portfolio", label: "Portfolio" },
  { id: "positions", label: "Current positions" },
  { id: "plans", label: "Trade plans" },
  { id: "decisions", label: "Decisions" },
];

export function AppHeader({
  agents,
  selectedAgentId,
  activeTab,
  theme,
  onSelectAgent,
  onSelectTab,
  onToggleTheme,
}: AppHeaderProps) {
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
      <div className="header-actions">
        <label className="account-select-wrap">
          <span className="sr-only">Trading agent</span>
          <select
            className="account-select"
            value={selectedAgentId}
            aria-label="Trading agent"
            onChange={(event) => onSelectAgent(event.target.value as TradingAgentId)}
          >
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.label}
              </option>
            ))}
          </select>
        </label>
        <button className="icon-button" type="button" onClick={onToggleTheme}>
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          <span className="sr-only">Toggle theme</span>
        </button>
      </div>
    </header>
  );
}
