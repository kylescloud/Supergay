// Top 200 Base Tokens - Generated on 2026-01-25T05:52:15.151Z
// Base: 1 flash loan assets | Quote: 2 tokens

// Aave V3 Flash Loan Borrowable Assets on Base (14 tokens)
export const FLASH_LOAN_ASSETS = {
  USDC: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' // Rank #6 - USDC
} as const;

// Top Quote Tokens on Base (excluding flash loan assets)
export const QUOTE_TOKENS = {
  WBTC: '0x1cea84203673764244e05693e42e6ace62be9ba5', // Rank #16 - Wrapped Bitcoin
  LINK: '0x88fb150bdc53a65fe94dea0c9ba0a6daf8c6e196' // Rank #22 - Chainlink
} as const;

// Token Metadata (for pool discovery and swaps)
export const TOKEN_METADATA: Record<string, { decimals: number; symbol: string; name: string }> = {
  USDC: { decimals: 18, symbol: 'USDC', name: 'USDC' },
  WBTC: { decimals: 18, symbol: 'WBTC', name: 'Wrapped Bitcoin' },
  LINK: { decimals: 18, symbol: 'LINK', name: 'Chainlink' }
} as const;

// All tokens combined for convenience
export const ALL_TOKENS = { ...FLASH_LOAN_ASSETS, ...QUOTE_TOKENS } as const;

