// Core Types for Arbitrage Bot

export interface Token {
  address: string;
  symbol: string;
  decimals: number;
  name: string;
}

export interface PoolState {
  dex: string;
  address: string;
  token0: Token;
  token1: Token;
  sqrtPriceX96?: bigint;
  liquidity?: bigint;
  reserve0?: bigint;
  reserve1?: bigint;
  fee: number; // Fee tier (e.g., 500 for 0.05%)
  tick?: number;
  version: 'v2' | 'v3' | 'v4' | 'curve';
}

export interface SwapRoute {
  path: Token[];
  dexes: string[];
  pools: PoolState[];
  effectiveRate: number;
  logRate: number;
  estimatedAmountOut: bigint;
  gasEstimate: number;
  timestamp: number;
}

export interface ArbitrageOpportunity {
  id: string;
  baseToken: Token;
  loanAmount: bigint;
  path: Token[];
  dexes: string[];
  pools: PoolState[];
  expectedProfit: bigint;
  expectedProfitUSD: number;
  flashFee: bigint;
  gasCost: bigint;
  netProfit: bigint;
  timestamp: number;
  blockNumber: number;
  score: number;
  entropy: number;
  dexTypes: string[];
  dexIdentifiers: string[];
}

export interface EffectiveRateResult {
  rate: number;
  amountOut: bigint;
  slippage: number;
  gasEstimate: number;
}

export interface FlashLoanParams {
  asset: string;
  amount: bigint;
  premium: number;
  routes: SwapRoute[];
  minProfit: bigint;
}

export interface ExecutionResult {
  success: boolean;
  txHash: string;
  profit: bigint;
  gasUsed: number;
  timestamp: number;
  error?: string;
}

export interface BlockSnapshot {
  blockNumber: number;
  timestamp: number;
  baseFee: bigint;
  gasUsed: bigint;
  gasLimit: bigint;
  poolStates: Map<string, PoolState>;
}

export interface Cycle {
  path: string[];
  totalWeight: number;
  effectiveRate: number;
  profitPotential: number;
}

export interface GasEstimate {
  baseFee: bigint;
  priorityFee: bigint;
  gasLimit: bigint;
  maxFeePerGas: bigint;
  totalCost: bigint;
}

export interface OpportunityScore {
  profit: number;
  gasEfficiency: number;
  latencyRisk: number;
  entropy: number;
  totalScore: number;
}