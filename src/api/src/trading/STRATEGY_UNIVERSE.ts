import type { StrategySymbol } from './strategy';

export const STRATEGY_UNIVERSE: StrategySymbol[] = [
  // Core ETFs
  { symbol: 'SPY', bucket: 'etf' },
  { symbol: 'VOO', bucket: 'etf' },
  { symbol: 'IVV', bucket: 'etf' },
  { symbol: 'QQQ', bucket: 'etf' },
  { symbol: 'VTI', bucket: 'etf' },
  { symbol: 'DIA', bucket: 'etf' },
  { symbol: 'IWM', bucket: 'etf' },
  { symbol: 'VT', bucket: 'etf' },

  // Growth / Tech ETFs
  { symbol: 'VGT', bucket: 'etf' },
  { symbol: 'XLK', bucket: 'etf' },
  { symbol: 'ARKK', bucket: 'etf' },
  { symbol: 'SMH', bucket: 'etf' },
  { symbol: 'SOXX', bucket: 'etf' },
  { symbol: 'FDN', bucket: 'etf' },
  { symbol: 'CLOU', bucket: 'etf' },

  // Sector ETFs
  { symbol: 'XLF', bucket: 'etf' },
  { symbol: 'XLE', bucket: 'etf' },
  { symbol: 'XLV', bucket: 'etf' },
  { symbol: 'XLI', bucket: 'etf' },
  { symbol: 'XLP', bucket: 'etf' },
  { symbol: 'XLY', bucket: 'etf' },
  { symbol: 'XLU', bucket: 'etf' },
  { symbol: 'XLB', bucket: 'etf' },
  { symbol: 'XLRE', bucket: 'etf' },

  // Dividend / Defensive ETFs
  { symbol: 'SCHD', bucket: 'etf' },
  { symbol: 'VYM', bucket: 'etf' },
  { symbol: 'HDV', bucket: 'etf' },
  { symbol: 'DGRO', bucket: 'etf' },

  // International ETFs
  { symbol: 'VXUS', bucket: 'etf' },
  { symbol: 'VEA', bucket: 'etf' },
  { symbol: 'VWO', bucket: 'etf' },
  { symbol: 'IEFA', bucket: 'etf' },
  { symbol: 'EEM', bucket: 'etf' },

  // Bond ETFs
  { symbol: 'BND', bucket: 'etf' },
  { symbol: 'AGG', bucket: 'etf' },
  { symbol: 'TLT', bucket: 'etf' },
  { symbol: 'IEF', bucket: 'etf' },
  { symbol: 'HYG', bucket: 'etf' },

  // Commodities
  { symbol: 'GLD', bucket: 'etf' },
  { symbol: 'SLV', bucket: 'etf' },
  { symbol: 'USO', bucket: 'etf' },
  { symbol: 'DBC', bucket: 'etf' },

  // Safe / Blue-chip
  { symbol: 'MSFT', bucket: 'safe_stock' },
  { symbol: 'AAPL', bucket: 'safe_stock' },
  { symbol: 'GOOGL', bucket: 'safe_stock' },
  { symbol: 'AMZN', bucket: 'safe_stock' },
  { symbol: 'META', bucket: 'safe_stock' },
  { symbol: 'BRK.B', bucket: 'safe_stock' },
  { symbol: 'JNJ', bucket: 'safe_stock' },
  { symbol: 'PG', bucket: 'safe_stock' },
  { symbol: 'KO', bucket: 'safe_stock' },
  { symbol: 'PEP', bucket: 'safe_stock' },
  { symbol: 'WMT', bucket: 'safe_stock' },
  { symbol: 'COST', bucket: 'safe_stock' },
  { symbol: 'HD', bucket: 'safe_stock' },
  { symbol: 'MCD', bucket: 'safe_stock' },
  { symbol: 'DIS', bucket: 'safe_stock' },
  { symbol: 'V', bucket: 'safe_stock' },
  { symbol: 'MA', bucket: 'safe_stock' },
  { symbol: 'ADBE', bucket: 'safe_stock' },
  { symbol: 'NFLX', bucket: 'safe_stock' },
  { symbol: 'CSCO', bucket: 'safe_stock' },
  { symbol: 'ORCL', bucket: 'safe_stock' },
  { symbol: 'INTC', bucket: 'safe_stock' },
  { symbol: 'IBM', bucket: 'safe_stock' },
  { symbol: 'TXN', bucket: 'safe_stock' },
  { symbol: 'AVGO', bucket: 'safe_stock' },

  // Financial / Healthcare stable
  { symbol: 'JPM', bucket: 'safe_stock' },
  { symbol: 'BAC', bucket: 'safe_stock' },
  { symbol: 'GS', bucket: 'safe_stock' },
  { symbol: 'MS', bucket: 'safe_stock' },
  { symbol: 'UNH', bucket: 'safe_stock' },
  { symbol: 'LLY', bucket: 'safe_stock' },
  { symbol: 'PFE', bucket: 'safe_stock' },
  { symbol: 'MRK', bucket: 'safe_stock' },

  // Aggressive / Growth
  { symbol: 'NVDA', bucket: 'aggressive_stock' },
  { symbol: 'TSLA', bucket: 'aggressive_stock' },
  { symbol: 'AMD', bucket: 'aggressive_stock' },
  { symbol: 'PLTR', bucket: 'aggressive_stock' },
  { symbol: 'COIN', bucket: 'aggressive_stock' },
  { symbol: 'SNOW', bucket: 'aggressive_stock' },
  { symbol: 'NET', bucket: 'aggressive_stock' },
  { symbol: 'CRWD', bucket: 'aggressive_stock' },
  { symbol: 'ZS', bucket: 'aggressive_stock' },
  { symbol: 'DDOG', bucket: 'aggressive_stock' },
  { symbol: 'SHOP', bucket: 'aggressive_stock' },
  { symbol: 'ROKU', bucket: 'aggressive_stock' },
  { symbol: 'SQ', bucket: 'aggressive_stock' },
  { symbol: 'U', bucket: 'aggressive_stock' },
  { symbol: 'RIVN', bucket: 'aggressive_stock' },
  { symbol: 'LCID', bucket: 'aggressive_stock' },
  { symbol: 'AFRM', bucket: 'aggressive_stock' },
  { symbol: 'UPST', bucket: 'aggressive_stock' },
  { symbol: 'AI', bucket: 'aggressive_stock' },

  // Biotech / high volatility
  { symbol: 'MRNA', bucket: 'aggressive_stock' },
  { symbol: 'BNTX', bucket: 'aggressive_stock' },
  { symbol: 'REGN', bucket: 'aggressive_stock' },
  { symbol: 'VRTX', bucket: 'aggressive_stock' },

  // International / Emerging growth
  { symbol: 'BABA', bucket: 'aggressive_stock' },
  { symbol: 'NIO', bucket: 'aggressive_stock' },
  { symbol: 'XPEV', bucket: 'aggressive_stock' },
  { symbol: 'LI', bucket: 'aggressive_stock' },
  { symbol: 'TCEHY', bucket: 'aggressive_stock' },
];
