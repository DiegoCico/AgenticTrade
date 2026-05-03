import { describe, expect, it } from "vitest";
import { emptyPortfolioData, mapPortfolioData } from "./tradingApi";

describe("mapPortfolioData", () => {
  it("keeps an empty backend portfolio empty instead of inventing risk or rows", () => {
    const data = mapPortfolioData({
      portfolio: {
        accountId: "paper-empty",
        cash: 1000,
        buyingPower: 2000,
        totalValue: 1000,
        maxPositionPercent: 25,
        maxTradeValuePercent: 8,
        minConfidence: 65,
        positions: [],
      },
      decisions: [],
      tradePlans: [],
      executedTrades: [],
    });

    expect(data.positions).toEqual([]);
    expect(data.plans).toEqual([]);
    expect(data.watchlist).toEqual([]);
    expect(data.portfolio.riskScore).toBe(0);
    expect(data.account).toMatchObject({
      name: "paper-empty",
      cash: 1000,
      buyingPower: 2000,
    });
  });

  it("maps Alpaca-backed portfolio state into dashboard positions and plans", () => {
    const data = mapPortfolioData({
      portfolio: {
        accountId: "alpaca-account",
        cash: 500,
        buyingPower: 1000,
        totalValue: 10_000,
        maxPositionPercent: 25,
        maxTradeValuePercent: 8,
        minConfidence: 65,
        positions: [
          {
            symbol: "MSFT",
            name: "Microsoft",
            shares: 10,
            averageCost: 390,
            price: 420,
            allocationPercent: 42,
          },
        ],
      },
      decisions: [
        {
          id: "decision-1",
          createdAt: "2026-05-03T16:00:00.000Z",
          model: "mock-policy-engine",
          promptVersion: "trading-pipeline-v1",
          aiDecision: {
            symbol: "MSFT",
            action: "plan_buy",
            quantity: 2,
            triggerPrice: 413.7,
            confidence: 80,
            reason: "MSFT has constructive momentum.",
            riskNotes: "risk bounded",
          },
        },
      ],
      tradePlans: [
        {
          id: "plan-1",
          symbol: "MSFT",
          side: "buy",
          quantity: 2,
          triggerPrice: 413.7,
          confidence: 80,
          status: "planned",
          reason: "Wait for pullback.",
          riskNotes: "risk bounded",
          createdAt: "2026-05-03T16:01:00.000Z",
        },
      ],
      executedTrades: [],
    });

    expect(data.positions).toHaveLength(1);
    expect(data.positions[0]).toMatchObject({
      symbol: "MSFT",
      marketValue: 4200,
      allocation: 42,
      aiSignal: "Plan Buy",
      lastAction: "Bought",
      actionPrice: 413.7,
    });
    expect(data.plans[0]).toMatchObject({
      symbol: "MSFT",
      side: "Buy",
      currentPrice: 420,
    });
    expect(data.watchlist[0]).toMatchObject({
      symbol: "MSFT",
      price: 420,
    });
    expect(data.portfolio.riskScore).toBe(42);
  });

  it("exports a stable empty dashboard model", () => {
    expect(emptyPortfolioData.positions).toEqual([]);
    expect(emptyPortfolioData.trades).toEqual([]);
    expect(emptyPortfolioData.performance["1D"]).toEqual([]);
  });
});
