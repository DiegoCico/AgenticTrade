# AgenticTrade Frontend

The frontend is a Vite + React dashboard for watching how the AI trading system is performing. It loads portfolio, position, plan, and decision data from the backend tRPC API for the selected trading agent.

## Stack

- React 19
- TypeScript
- Vite
- Recharts for interactive performance charts
- Framer Motion for UI animation
- Lucide React icons
- CSS modules through `App.css` and global styles in `index.css`

## Current Views

The app uses top-level tabs in `AppHeader`.

| Tab | Purpose |
| --- | --- |
| `Portfolio` | Portfolio value, animated chart, AI status, positions, and watchlist |
| `Current positions` | Current holdings plus bought/sold/trimmed/held action context and AI-thought tooltips |
| `Trade plans` | Planned buy/sell triggers with confidence and risk notes |
| `Decisions` | Recent AI decisions with date/time context and detail dialogs |

Position and watchlist rows open the symbol's TradingView chart in a new tab.

The header includes a trading-agent dropdown:

- Conservative Agent
- Neutral Agent
- Aggressive Agent

Changing the selected agent reloads the dashboard from that agent's backend account. Current positions, trade plans, decisions, executed trades, and trade history are all scoped by the selected agent.

## Directory Structure

```txt
src/frontend/
  public/
    logo.png
  src/
    components/
      common/
        ChangeBadge.tsx
      dashboard/
        AIStatusPanel.tsx
        CurrentPositions.tsx
        PerformanceChart.tsx
        PositionsList.tsx
        RecentDecisions.tsx
        TradePlans.tsx
        Watchlist.tsx
      layout/
        AppHeader.tsx
    data/
      portfolio.json
    pages/
      PortfolioDashboard.tsx
    types/
      portfolio.ts
    utils/
      formatters.ts
      tradingView.ts
    App.tsx
    App.css
    index.css
    main.tsx
```

## Data

The UI loads dashboard data from `src/frontend/src/api/tradingApi.ts`.

It calls:

- `aiTrading.getState`
- `aiTrading.getTradeHistory`

Both calls pass the selected `agentId`. `portfolio.json` remains in the worktree as a development fixture/reference, but the app no longer uses it as the primary data source. If the backend returns no history, the UI renders empty lists instead of inventing fixture trades.

## Development

```bash
cd src/frontend
npm install
npm run dev
```

Default URL:

```txt
http://localhost:5173
```

## Build And Test

```bash
npm run build
npm test
npm run lint
```

The production build may emit a bundle-size warning because Recharts and Framer Motion are included. The warning does not fail the build.

## Styling

The UI is intentionally black/white with green trading accents. Theme state is currently owned by `App.tsx` and applied through:

```tsx
<main className="app-shell" data-theme={theme}>
```

Responsive behavior:

- Desktop: logo, tabs, and actions stay on one header row.
- Tablet/mobile: tabs move to a full-width second row.
- Small mobile: tabs scroll horizontally and compact cards replace wide table layouts.

## API Integration

The UI loads dashboard data from the backend through `src/api/tradingApi.ts`.

It calls:

- `aiTrading.getState`
- `aiTrading.getTradeHistory`

with the selected `agentId`.

Local development defaults to:

```txt
http://localhost:3001
```

Override the backend URL with:

```txt
VITE_API_URL=https://your-api-host
```

If the backend returns no history, the UI renders empty lists. It does not fall back to fixture trades.

After page load, `App.tsx` refreshes backend dashboard data every 10 seconds for 5 minutes. When the 5-minute window expires, polling stops and the UI asks the user to refresh the page to resume live updates.

The frontend maps recent trade history back onto open positions so the Current Positions tab can show the latest AI thought for each held symbol. It also creates fallback chart points from live portfolio/position values when the backend does not return a historical performance series.

Debug logs are intentionally verbose in the browser console:

- request procedure/input/url
- raw tRPC responses
- mapped frontend portfolio data
- render counts for positions, plans, and trades
