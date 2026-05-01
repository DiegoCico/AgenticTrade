# AgenticTrade Frontend

The frontend is a Vite + React dashboard for watching how the AI trading system is performing. It currently uses local JSON fixture data so the UI can be developed before the backend is fully connected.

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
| `Portfolio` | Portfolio value, animated chart, AI status, positions, watchlist, recent decisions |
| `Current positions` | Current holdings plus bought/sold/trimmed/held action context and AI-thought tooltips |
| `Trade plans` | Planned buy/sell triggers with confidence and risk notes |
| `Decisions` | Recent AI decisions |

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
    App.tsx
    App.css
    index.css
    main.tsx
```

## Data

Temporary fixture data lives in:

```txt
src/frontend/src/data/portfolio.json
```

It includes:

- account state
- portfolio summary
- performance series by timeframe
- positions
- recent trades/decisions
- watchlist items
- planned trade triggers

The backend equivalent is being built under `src/api/src/trading`.

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

## API Integration Plan

The current UI reads from `portfolio.json`. The next step is to replace that fixture with tRPC calls to:

- `aiTrading.getState`
- `aiTrading.getPortfolio`
- `aiTrading.getPositions`
- `aiTrading.getTradePlans`
- `aiTrading.getDecisions`
- `aiTrading.evaluate`
