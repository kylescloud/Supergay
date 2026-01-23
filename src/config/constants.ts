// Base Chain Constants
export const BASE_CHAIN_ID = 8453;

// Aave V3 Pool Address on Base
export const AAVE_V3_POOL = '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5';

// WETH Address on Base
export const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';

// Public RPC Nodes for Scanning (8 nodes for load balancing and failover)
export const PUBLIC_RPC_NODES = [
  'https://mainnet.base.org',
  'https://base.publicnode.com',
  'https://base.meowrpc.com',
  'https://base.gateway.tenderly.co',
  'https://rpc.1inch.io/base',
  'https://rpc.quicknode.com/base/v1/p7b9d33c8c5849e2b7a6b9d8e0f6c5b9d8e0f6c5b',
  'https://base.drpc.org',
  'https://base-rpc.publicnode.com',
] as const;

// Private RPC Nodes for Execution Only (2 nodes for high-priority transactions)
export const PRIVATE_RPC_NODES = [
  // Primary private RPC (user-configured)
  process.env.PRIVATE_RPC_1 || '',
  // Secondary private RPC (user-configured)
  process.env.PRIVATE_RPC_2 || '',
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

// Common Token Addresses on Base
export const TOKENS = {
  WETH: '0x4200000000000000000000000000000000000006',
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  USDbC: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
  DAI: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
  WBTC: '0x2aE3F1ec7f1F5012cf12ab14AD75ca5a5d9F83E8',
  CBETH: '0xFDe4C96C8593536E31F229eA8F37b2aDA39A4E7D',
  USDT: '0xfde4C96c8593536E31F229EA8f37b2ADa39a4E7d',
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
    registry: '0x0000000000000000000000000000000000000000', // To be updated
    factory: '0xF017d5909378e67Baf1682738D8514D494b5e44f',
    router: '0x99a583981d3d968c3D71425676B72C720f02b734',
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