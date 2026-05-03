import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { emptyPortfolioData } from "../../api/tradingApi";
import { AIStatusPanel } from "./AIStatusPanel";

describe("AIStatusPanel", () => {
  it("shows no risk score when there are no positions", () => {
    render(<AIStatusPanel data={emptyPortfolioData} />);

    expect(screen.getByText("Risk score")).toBeInTheDocument();
    expect(screen.getByText("--")).toBeInTheDocument();
  });

  it("shows a numeric risk score when positions exist", () => {
    render(
      <AIStatusPanel
        data={{
          ...emptyPortfolioData,
          portfolio: {
            ...emptyPortfolioData.portfolio,
            riskScore: 42,
          },
          positions: [
            {
              symbol: "MSFT",
              name: "Microsoft",
              shares: 10,
              price: 420,
              marketValue: 4200,
              dayChangePercent: 1.2,
              allocation: 42,
              aiSignal: "Plan Buy",
              lastAction: "Bought",
              actionTime: "12:00 PM",
              actionPrice: 413.7,
              aiThought: "constructive setup",
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("42/100")).toBeInTheDocument();
  });
});
