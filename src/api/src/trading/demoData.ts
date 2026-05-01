import type { PortfolioState, MarketSnapshot, TradePlan, ExecutedTrade, DecisionLogEntry } from './types';

export const demoPortfolio: PortfolioState = {
  accountId: 'paper-agentictrade',
  cash: 12842.25,
  buyingPower: 25684.5,
  totalValue: 184263.78,
  maxPositionPercent: 25,
  maxTradeValuePercent: 8,
  minConfidence: 65,
  positions: [
    {
      symbol: 'NVDA',
      name: 'NVIDIA',
      shares: 42,
      averageCost: 812.4,
      price: 928.36,
      allocationPercent: 21.2,
    },
    {
      symbol: 'MSFT',
      name: 'Microsoft',
      shares: 71,
      averageCost: 390.12,
      price: 421.58,
      allocationPercent: 16.2,
    },
    {
      symbol: 'TSLA',
      name: 'Tesla',
      shares: 94,
      averageCost: 184.33,
      price: 177.92,
      allocationPercent: 9.1,
    },
    {
      symbol: 'SPY',
      name: 'S&P 500 ETF',
      shares: 83,
      averageCost: 486.3,
      price: 512.24,
      allocationPercent: 23.1,
    },
    {
      symbol: 'COIN',
      name: 'Coinbase',
      shares: 56,
      averageCost: 219.6,
      price: 238.04,
      allocationPercent: 7.2,
    },
  ],
};

export const demoMarketSnapshot: MarketSnapshot = {
  snapshotId: 'snapshot-demo-2026-04-30-1335',
  capturedAt: '2026-04-30T13:35:00-04:00',
  candles: [
    { symbol: 'NVDA', timestamp: '2026-04-30T09:30:00-04:00', open: 902, high: 914, low: 898, close: 908, volume: 9000000 },
    { symbol: 'NVDA', timestamp: '2026-04-30T10:30:00-04:00', open: 908, high: 922, low: 905, close: 919, volume: 11800000 },
    { symbol: 'NVDA', timestamp: '2026-04-30T11:30:00-04:00', open: 919, high: 932, low: 916, close: 928.36, volume: 14200000 },
    { symbol: 'MSFT', timestamp: '2026-04-30T09:30:00-04:00', open: 416, high: 419, low: 414.8, close: 417.3, volume: 3200000 },
    { symbol: 'MSFT', timestamp: '2026-04-30T10:30:00-04:00', open: 417.3, high: 421.1, low: 416.5, close: 420.6, volume: 4200000 },
    { symbol: 'MSFT', timestamp: '2026-04-30T11:30:00-04:00', open: 420.6, high: 422.4, low: 419.8, close: 421.58, volume: 5100000 },
    { symbol: 'TSLA', timestamp: '2026-04-30T09:30:00-04:00', open: 181.2, high: 182.1, low: 178.4, close: 180.1, volume: 7200000 },
    { symbol: 'TSLA', timestamp: '2026-04-30T10:30:00-04:00', open: 180.1, high: 180.7, low: 176.9, close: 178.4, volume: 9600000 },
    { symbol: 'TSLA', timestamp: '2026-04-30T11:30:00-04:00', open: 178.4, high: 179.2, low: 176.8, close: 177.92, volume: 11000000 },
    { symbol: 'SPY', timestamp: '2026-04-30T09:30:00-04:00', open: 510.3, high: 511.7, low: 509.9, close: 511.2, volume: 14500000 },
    { symbol: 'SPY', timestamp: '2026-04-30T10:30:00-04:00', open: 511.2, high: 512.8, low: 510.9, close: 512, volume: 17100000 },
    { symbol: 'SPY', timestamp: '2026-04-30T11:30:00-04:00', open: 512, high: 513.1, low: 511.7, close: 512.24, volume: 18900000 },
    { symbol: 'COIN', timestamp: '2026-04-30T09:30:00-04:00', open: 229.4, high: 234.9, low: 228.1, close: 232.18, volume: 5100000 },
    { symbol: 'COIN', timestamp: '2026-04-30T10:30:00-04:00', open: 232.18, high: 239.6, low: 231.4, close: 236.8, volume: 7600000 },
    { symbol: 'COIN', timestamp: '2026-04-30T11:30:00-04:00', open: 236.8, high: 240.2, low: 235.9, close: 238.04, volume: 8200000 },
  ],
};

export const tradePlans: TradePlan[] = [];
export const executedTrades: ExecutedTrade[] = [];
export const decisionLog: DecisionLogEntry[] = [];
