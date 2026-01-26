// Base Chain Constants
export const BASE_CHAIN_ID = 8453;

// Aave V3 Pool Address on Base
export const AAVE_V3_POOL = '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5';

// WETH Address on Base
export const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';

// Public RPC Nodes for Scanning (6 nodes for load balancing and failover)
export const PUBLIC_RPC_NODES = [
  'https://mainnet.base.org',
  'https://base.publicnode.com',
  'https://base.meowrpc.com',
  'https://base.gateway.tenderly.co',
  'https://base.drpc.org',
  'https://base-rpc.publicnode.com',
] as const;

// Private RPC Nodes for Execution Only (2 nodes for high-priority transactions)
export const PRIVATE_RPC_NODES = [
  // Primary private RPC (Moralis)
  'https://site1.moralis-nodes.com/base/60f0cf30acc14837bbb9405cbdcff357',
  // Secondary private RPC (Moralis)
  'https://site2.moralis-nodes.com/base/60f0cf30acc14837bbb9405cbdcff357',
] as const;

// RPC Load Balancing Configuration
export const RPC_CONFIG = {
  // Maximum retries per RPC node before switching
  maxRetriesPerNode: 3,
  // Timeout in milliseconds for RPC calls
  requestTimeout: 10000,
  // Health check interval in milliseconds
  healthCheckInterval: 30000,
  // Enable/disable health checks
  enableHealthChecks: true,
  // Minimum response time in milliseconds to consider RPC healthy
  maxResponseTime: 2000,
  // Maximum consecutive failures before marking RPC as unhealthy
  maxConsecutiveFailures: 5,
} as const;

// Aave V3 Flash Loan Borrowable Assets on Base (14 tokens)
export const TOKENS = {
  WETH: '0x4200000000000000000000000000000000000006',
  cbETH: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22',
  USDbC: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
  wstETH: '0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452',
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  weETH: '0x04C0599Ae5A44757c0af6F9eC3b93da8976c150A',
  cbBTC: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
  ezETH: '0x2416092f143378750bb29b79eD961ab195CcEea5',
  GHO: '0x6Bb7c9e0dDd5f7871e30A870e91A4f16F9cb10Ee',
  wrsETH: '0xEDfa23602C7F3c7D0e3d82FD74C8A37dDabBEA0E',
  LBTC: '0xecAcaF1E1c1cbB7C039711F7e07fC7F4A1EaA1c1',
  EURC: '0x60a3e35c9B3F2E0E8d5dD0e29B5D9E9E26f4db42',
  AAVE: '0x6370E0331e9C9dF4398f5a8e7d69c5F269dd7c1b',
  tBTC: '0x236aa50979D5f3De3Bd1Eeb40E81137F22ab794b',
} as const;

// Token Metadata (for pool discovery and swaps)
export const TOKEN_METADATA: Record<string, { decimals: number; symbol: string; name: string }> = {
  WETH: { decimals: 18, symbol: 'WETH', name: 'Wrapped Ether' },
  cbETH: { decimals: 18, symbol: 'cbETH', name: 'Coinbase Wrapped Staked ETH' },
  USDbC: { decimals: 6, symbol: 'USDbC', name: 'USD Base Coin' },
  wstETH: { decimals: 18, symbol: 'wstETH', name: 'Wrapped Lido Staked ETH' },
  USDC: { decimals: 6, symbol: 'USDC', name: 'USD Coin' },
  weETH: { decimals: 18, symbol: 'weETH', name: 'Wrapped eETH' },
  cbBTC: { decimals: 8, symbol: 'cbBTC', name: 'Coinbase Wrapped BTC' },
  ezETH: { decimals: 18, symbol: 'ezETH', name: 'Renzo Restaked ETH' },
  GHO: { decimals: 18, symbol: 'GHO', name: 'GHO Stablecoin' },
  wrsETH: { decimals: 18, symbol: 'wrsETH', name: 'Wrapped Rocket Pool ETH' },
  LBTC: { decimals: 8, symbol: 'LBTC', name: 'LayerZero BTC' },
  EURC: { decimals: 6, symbol: 'EURC', name: 'Euro Coin' },
  AAVE: { decimals: 18, symbol: 'AAVE', name: 'Aave Token' },
  tBTC: { decimals: 18, symbol: 'tBTC', name: 'tBTC' },
} as const;

// DEX Factory and Router Addresses on Base
export const DEX_CONFIG = {
  // Uniswap V4 (New Architecture with Pool Manager)
  uniswapV4: {
    poolManager: '0x498581ff718922c3f8e6a244956af099b2652b2b',
    universalRouter: '0x6ff5693b99212da76ad316178a184ab56d299b43',
    positionManager: '0x7c5f5a4bbd8fd63184577525326123b519429bdc',
    quoter: '0x0d5e0f971ed27fbff6c2837bf31316121532048d',
    stateView: '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71',
    permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
    feeTiers: [100, 500, 2500, 3000, 10000], // 0.01%, 0.05%, 0.25%, 0.3%, 1%
    version: 'v4',
  },
  // Uniswap V3
  uniswapV3: {
    factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
    router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    quoter: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
    feeTiers: [100, 500, 2500, 3000, 10000], // 0.01%, 0.05%, 0.25%, 0.3%, 1%
    version: 'v3',
  },
  // Uniswap V2
  uniswapV2: {
    factory: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6',
    router: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24',
    version: 'v2',
  },
  // Curve Finance
  curve: {
    addressProvider: '0x5ffe7FB82894076ECB99A30D6A32e969e6e35E98',
    exchangeRouter: '0x4f37A9d177470499A2dD084621020b023fcffc1F',
    stableswapMetapoolFactory: '0x3093f9B57A428F3EB6285a589cb35bEA6e78c336',
    twocryptoFactory: '0x5EF72230578b3e399E6C6F4F6360edF95e83BBfd',
    feeDistributor: '0xe8269B33E47761f552E1a3070119560d5fa8bBD6',
    version: 'curve',
    pools: [] as string[],
  },
  // SushiSwap V3
  sushiswapV3: {
    factory: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4',
    router: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
    quoter: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
    feeTiers: [100, 500, 2500, 3000, 10000],
    version: 'v3',
  },
  // PancakeSwap V3
  pancakeSwapV3: {
    factory: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
    router: '0x1b81D678ffb9C0263b24A97847620C99d213eB14',
    quoter: '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',
    feeTiers: [100, 500, 2500, 3000, 10000],
    version: 'v3',
  },
  // Aerodrome Finance (V2-style)
  aerodrome: {
    factory: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da',
    router: '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43',
    version: 'v2',
  },
  // Aerodrome SlipStream (V3-style CL AMM)
  aerodromeSlipStream: {
    factory: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da',
    router: '0xbe6d8f0d05cc4be24d5167a3ef062215be6d18a5',
    quoter: '0x254cf9e1e6e233aa1ac962cb9b05b2cfeaae15b0',
    feeTiers: [100, 500, 2500, 3000, 10000],
    version: 'v3',
  },
  // Aerodrome SlipStream 2 (Alternative CL AMM)
  aerodromeSlipStream2: {
    factory: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da',
    router: '0x51ca29d9828867c363572c37c424e3d6b380c61e',
    quoter: '0x254cf9e1e6e233aa1ac962cb9b05b2cfeaae15b0',
    feeTiers: [100, 500, 2500, 3000, 10000],
    version: 'v3',
  },
  // BaseSwap (V2-style)
  baseSwap: {
    factory: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6',
    router: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24',
    version: 'v2',
  },
} as const;

// Curve Pool Addresses on Base (Stable Pools)
export const CURVE_POOLS = {
  'USDC-DAI': '0x0000000000000000000000000000000000000000', // To be updated with actual addresses
  'USDC-USDbC': '0x0000000000000000000000000000000000000000',
} as const;

// Fee Constants
export const FLASH_LOAN_PREMIUM = 0.0009; // 0.09%
export const BASE_FEE = 0.003; // 0.3% standard fee
export const AAVE_FLASH_LOAN_FEE_POINTS = 9; // 9 basis points

// Gas Constants
export const GAS_LIMITS = {
  FLASH_LOAN_OVERHEAD: 150000,
  SWAP_PER_HOP: 100000,
  APPROVAL: 50000,
  TOTAL_MAX: 1000000,
} as const;

export const GAS_PRICES = {
  LOW: 2000000000,     // 2 gwei
  MEDIUM: 5000000000,  // 5 gwei
  HIGH: 10000000000,   // 10 gwei
  MAX: 20000000000,    // 20 gwei
} as const;

// Slippage Tolerance
export const SLIPPAGE_TOLERANCE = 0.003; // 0.3%

// Profit Thresholds
export const MIN_PROFIT_THRESHOLD = 0.01; // $0.01 minimum profit
export const MIN_PROFIT_GWEI = 10000000; // 0.01 ETH in wei

// Maximum Reasonable Profit Threshold (configurable)
// This prevents false positives from calculation errors
// Default: 10% of trade size (e.g., 1 ETH profit on 10 ETH trade)
export const MAX_PROFIT_PERCENTAGE = 0.10; // 10% maximum profit per trade

// Validate that profit doesn't exceed this percentage of loan amount
export function isProfitReasonable(loanAmount: bigint, netProfit: bigint): boolean {
  const maxProfit = (loanAmount * BigInt(Math.floor(MAX_PROFIT_PERCENTAGE * 10000))) / 10000n;
  return netProfit > 0n && netProfit <= maxProfit;
}

// Get maximum allowed profit for a given loan amount
export function getMaxAllowedProfit(loanAmount: bigint): bigint {
  return (loanAmount * BigInt(Math.floor(MAX_PROFIT_PERCENTAGE * 10000))) / 10000n;
}

// MEV Protection
export const MEV_CONFIG = {
  MAX_PATH_LENGTH: 6,
  MIN_ENTROPY: 0.5,
  LATENCY_DECAY_LAMBDA: 0.1,
  RISK_FACTOR: 1.5,
} as const;

// Arbitrage Constants
export const ARBITRAGE_CONFIG = {
  MAX_HOPS: 4,
  MIN_LIQUIDITY: 1000000, // $1M minimum liquidity
  MAX_SLIPPAGE: 0.01, // 1% maximum slippage
  PRICE_TOLERANCE: 0.001, // 0.1% price tolerance
} as const;

// Block Replay Configuration
export const REPLAY_CONFIG = {
  BLOCK_BATCH_SIZE: 100,
  MAX_LOOKBACK: 1000,
  SNAPSHOT_INTERVAL: 10,
} as const;

// Monitoring Configuration
export const MONITORING_CONFIG = {
  ALERT_THRESHOLD: 100, // $100 profit triggers alert
  LOG_RETENTION_DAYS: 30,
  METRICS_PORT: 8080,
} as const;

// Moralis API Configuration
export const MORALIS_CONFIG = {
  apiKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjQ2NWJmNTc1LTJhYzMtNGYwZS1iMmZjLWMwOGZiNWExYzBiMiIsIm9yZ0lkIjoiNDI2MjAwIiwidXNlcklkIjoiNDM4Mzg0IiwidHlwZUlkIjoiYTc5NTZhMDAtNzE3NC00OWMxLWE5ODUtMGNkYzllNWRlNjNiIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3MzcxMDAxMjQsImV4cCI6NDg5Mjg2MDEyNH0.WBisd1TZJtf0GbthOF8J_jKpyloxSZKaz4xdnAlbeEM',
  rpcApiKey: '60f0cf30acc14837bbb9405cbdcff357',
  baseURL: 'https://deep-index.moralis.io/api/v2.2',
  chain: 'base',
  maxRetries: 3,
  requestTimeout: 30000,
  pageSize: 100
} as const;

// Moralis RPC Nodes for Pool Discovery
export const MORALIS_RPC_NODES = [
  'https://site1.moralis-nodes.com/base/60f0cf30acc14837bbb9405cbdcff357',
  'https://site2.moralis-nodes.com/base/60f0cf30acc14837bbb9405cbdcff357'
] as const;