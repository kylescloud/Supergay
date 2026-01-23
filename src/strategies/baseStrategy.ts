import { ethers } from 'ethers';
import { ArbitrageOpportunity, Token, PoolState } from '../types';
import { ExchangeGraph } from '../math/graph';

/**
 * Base Arbitrage Strategy Interface
 * 
 * All arbitrage strategies must implement this interface.
 */
export interface IArbitrageStrategy {
  /**
   * Find arbitrage opportunities based on pool states
   */
  findOpportunities(
    pools: Map<string, PoolState>,
    baseToken: Token,
    loanAmount: bigint
  ): Promise<ArbitrageOpportunity[]>;

  /**
   * Get strategy name
   */
  getName(): string;

  /**
   * Validate opportunity before execution
   */
  validateOpportunity(opportunity: ArbitrageOpportunity): Promise<boolean>;
}

/**
 * Base Strategy Implementation
 * 
 * Provides common functionality for all arbitrage strategies.
 */
export abstract class BaseStrategy implements IArbitrageStrategy {
  protected provider: ethers.JsonRpcProvider;
  protected minProfitThreshold: number;

  constructor(provider: ethers.JsonRpcProvider, minProfitThreshold: number = 0.01) {
    this.provider = provider;
    this.minProfitThreshold = minProfitThreshold;
  }

  /**
   * Find arbitrage opportunities (to be implemented by subclasses)
   */
  abstract findOpportunities(
    pools: Map<string, PoolState>,
    baseToken: Token,
    loanAmount: bigint
  ): Promise<ArbitrageOpportunity[]>;

  /**
   * Get strategy name (to be implemented by subclasses)
   */
  abstract getName(): string;

  /**
   * Validate opportunity before execution
   */
  async validateOpportunity(opportunity: ArbitrageOpportunity): Promise<boolean> {
    // Check minimum profit threshold
    if (opportunity.expectedProfitUSD < this.minProfitThreshold) {
      return false;
    }

    // Check if opportunity is still valid (not stale)
    const currentBlock = await this.provider.getBlockNumber();
    const blockAge = currentBlock - opportunity.blockNumber;
    if (blockAge > 3) { // More than 3 blocks old is stale
      return false;
    }

    // Check path length
    if (opportunity.path.length > 6) {
      return false; // Too many hops, too risky
    }

    return true;
  }

  /**
   * Calculate flash loan fee
   */
  protected calculateFlashFee(loanAmount: bigint, premium: number = 0.0009): bigint {
    return (loanAmount * BigInt(Math.floor(premium * 10000))) / BigInt(10000);
  }

  /**
   * Calculate gas cost
   */
  protected calculateGasCost(gasUsed: number, gasPrice: bigint): bigint {
    return BigInt(gasUsed) * gasPrice;
  }

  /**
   * Generate unique opportunity ID
   */
  protected generateOpportunityId(
    path: Token[],
    blockNumber: number
  ): string {
    const pathStr = path.map(t => t.symbol).join('-');
    return `${pathStr}-${blockNumber}`;
  }

  /**
   * Build graph from pool states
   */
  protected buildGraph(pools: Map<string, PoolState>, loanAmount: bigint): ExchangeGraph {
    const graph = new ExchangeGraph();
    const poolArray = Array.from(pools.values());
    graph.buildFromPools(poolArray, loanAmount);
    return graph;
  }
}