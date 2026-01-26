/**
 * Pool Type Definitions
 * Shared types for all DEX pool fetchers
 */

export interface Pool {
  address: string;
  dex: string;
  dexVersion: string;
  token0: TokenInfo;
  token1: TokenInfo;
  fee?: number; // For V3 pools
  reserve0?: bigint; // For V2/AMM pools
  reserve1?: bigint; // For V2/AMM pools
  liquidity?: bigint; // For V3 pools
  sqrtPriceX96?: bigint; // For V3 pools
  tick?: number; // For V3 pools
  blockNumber?: number;
  lastUpdated: number;
  isActive: boolean;
}

export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
}

export interface DEXConfig {
  name: string;
  version: string;
  factory?: string; // Optional for V4 (uses poolManager instead)
  poolManager?: string; // For Uniswap V4 architecture
  multicall?: string;
  router?: string;
  quoter?: string;
  stateView?: string; // For Uniswap V4 state queries
  feeTiers?: number[]; // For V3 DEXs
  dexId?: string; // Standardized kebab-case identifier
}

export interface PoolFetchRequest {
  target: string;
  callData: string;
  description?: string;
}

export interface PoolFetchResult {
  success: boolean;
  pools: Pool[];
  errors: string[];
  stats: FetchStats;
}

export interface FetchStats {
  totalRequested: number;
  successful: number;
  failed: number;
  executionTime: number;
  batches: number;
  rpcCalls: number;
}

export interface PoolRegistry {
  version: string;
  lastUpdated: number;
  blockNumber: number;
  network: string;
  chainId: number;
  pools: Pool[];
  stats: RegistryStats;
}

export interface RegistryStats {
  totalPools: number;
  poolsByDEX: Record<string, number>;
  poolsByToken: Record<string, number>;
  activePools: number;
}

export type PoolFilter = {
  dex?: string;
  token0?: string;
  token1?: string;
  minLiquidity?: bigint;
  isActive?: boolean;
  feeTiers?: number[];
};