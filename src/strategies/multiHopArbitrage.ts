import { ethers } from 'ethers';
import { ArbitrageOpportunity, Token, PoolState } from '../types';
import { ExchangeGraph } from '../math/graph';
import { BaseStrategy } from './baseStrategy';
import { calculateEffectiveRate } from '../math/effectiveRate';
import { AAVE_FLASH_LOAN_FEE_POINTS } from '../config/constants';

/**
 * Multi-Hop Cyclic Arbitrage Strategy
 * 
 * Detects profitable cycles in the token exchange graph using negative log-weight cycle detection.
 * 
 * Mathematical Proof:
 * Given a directed graph of exchange rates, a negative log-weight cycle implies a strictly profitable arbitrage.
 * 
 * Let each swap have effective rate: R_i = amountOut_i / amountIn_i
 * Transform to log space: w_i = -ln(R_i)
 * 
 * Cycle product: ∏ R_i > 1 ⇔ Σ ln(R_i) > 0 ⇔ Σ -ln(R_i) < 0
 * 
 * Thus: Negative cycle ⇔ guaranteed profit before costs
 */
export class MultiHopArbitrageStrategy extends BaseStrategy {
  private maxHops: number;

  constructor(
    provider: ethers.JsonRpcProvider,
    maxHops: number = 4,
    minProfitThreshold: number = 0.01
  ) {
    super(provider, minProfitThreshold);
    this.maxHops = maxHops;
  }

  /**
   * Get strategy name
   */
  getName(): string {
    return 'Multi-Hop Cyclic Arbitrage';
  }

  /**
   * Find multi-hop arbitrage opportunities
   */
  async findOpportunities(
    pools: Map<string, PoolState>,
    baseToken: Token,
    loanAmount: bigint
  ): Promise<ArbitrageOpportunity[]> {
    const opportunities: ArbitrageOpportunity[] = [];
    const currentBlock = await this.provider.getBlockNumber();

    // Build exchange graph
    const graph = this.buildGraph(pools, loanAmount);

    // Find negative cycles (profitable arbitrage paths)
    const cycles = graph.findNegativeCycles(baseToken, this.maxHops);

    for (const cycle of cycles) {
      const opportunity = await this.buildOpportunityFromCycle(
        cycle,
        pools,
        baseToken,
        loanAmount,
        currentBlock
      );

      if (opportunity && opportunity.netProfit > 0n) {
        opportunities.push(opportunity);
      }
    }

    return opportunities;
  }

  /**
   * Build arbitrage opportunity from a cycle
   */
  private async buildOpportunityFromCycle(
    cycle: any,
    pools: Map<string, PoolState>,
    baseToken: Token,
    loanAmount: bigint,
    blockNumber: number
  ): Promise<ArbitrageOpportunity | null> {
    try {
      // Reconstruct the path and pools
      const path: Token[] = [baseToken];
      const dexes: string[] = [];
      const routePools: PoolState[] = [];

      // Find pools for each hop in the cycle
      for (let i = 0; i < cycle.path.length - 1; i++) {
        const fromToken = cycle.path[i];
        const toToken = cycle.path[i + 1];

        // Find the best pool for this hop
        const pool = this.findBestPoolForHop(pools, fromToken, toToken, loanAmount);
        if (!pool) {
          return null;
        }

        path.push(pool.token1.address === baseToken.address ? pool.token0 : pool.token1);
        dexes.push(pool.dex);
        routePools.push(pool);
      }

      // Simulate the full cycle to get accurate profit
      let currentAmount = loanAmount;
      let totalGas = 0;

      for (let i = 0; i < routePools.length; i++) {
        const pool = routePools[i];
        const tokenIn = path[i];
        const tokenOut = path[i + 1];

        const rateResult = calculateEffectiveRate(pool, tokenIn, tokenOut, currentAmount);
        currentAmount = rateResult.amountOut;
        totalGas += rateResult.gasEstimate;
      }

      // Calculate final amount
      const finalAmount = currentAmount;

      // Calculate flash loan fee
      const flashFee = (loanAmount * BigInt(AAVE_FLASH_LOAN_FEE_POINTS)) / BigInt(10000);

      // Calculate gas cost (use current gas price)
      const gasPrice = await this.provider.getFeeData();
      const gasCost = BigInt(totalGas) * (gasPrice.gasPrice || 2000000000n);

      // Calculate profit
      const grossProfit = finalAmount - loanAmount;
      const netProfit = grossProfit - flashFee - gasCost;

      // Convert to USD (simplified, would use oracle in production)
      const profitUSD = Number(netProfit) / 1e18 * 2000; // Assuming $2000 ETH

      // Calculate entropy (uniqueness of path)
      const entropy = this.calculatePathEntropy(path.map(t => t.symbol));

      // Calculate opportunity score
      const score = this.calculateOpportunityScore(profitUSD, totalGas, entropy, blockNumber);

      return {
        id: this.generateOpportunityId(path, blockNumber),
        baseToken,
        loanAmount,
        path,
        dexes,
        pools: routePools,
        expectedProfit: netProfit,
        expectedProfitUSD: profitUSD,
        flashFee,
        gasCost,
        netProfit,
        timestamp: Date.now(),
        blockNumber,
        score,
        entropy,
        dexTypes: dexes.map(d => d.toLowerCase()),
        dexIdentifiers: dexes,
      };
    } catch (error) {
      console.error('Error building opportunity from cycle:', error);
      return null;
    }
  }

  /**
   * Find the best pool for a specific hop
   */
  private findBestPoolForHop(
    pools: Map<string, PoolState>,
    fromSymbol: string,
    toSymbol: string,
    amount: bigint
  ): PoolState | null {
    let bestPool: PoolState | null = null;
    let bestRate = 0;

    for (const pool of pools.values()) {
      const fromMatches = pool.token0.symbol === fromSymbol || pool.token1.symbol === fromSymbol;
      const toMatches = pool.token0.symbol === toSymbol || pool.token1.symbol === toSymbol;

      if (fromMatches && toMatches) {
        const tokenIn = pool.token0.symbol === fromSymbol ? pool.token0 : pool.token1;
        const tokenOut = pool.token0.symbol === toSymbol ? pool.token0 : pool.token1;

        try {
          const rateResult = calculateEffectiveRate(pool, tokenIn, tokenOut, amount);
          if (rateResult.rate > bestRate) {
            bestRate = rateResult.rate;
            bestPool = pool;
          }
        } catch (error) {
          continue;
        }
      }
    }

    return bestPool;
  }

  /**
   * Calculate path entropy (uniqueness metric)
   * Higher entropy = more unique path = harder to copy = safer from MEV
   */
  private calculatePathEntropy(path: string[]): number {
    // Count frequency of each hop
    const hopCounts = new Map<string, number>();
    for (let i = 0; i < path.length - 1; i++) {
      const hop = `${path[i]}-${path[i + 1]}`;
      hopCounts.set(hop, (hopCounts.get(hop) || 0) + 1);
    }

    // Calculate Shannon entropy
    let entropy = 0;
    const totalHops = path.length - 1;
    for (const count of hopCounts.values()) {
      const probability = count / totalHops;
      entropy -= probability * Math.log2(probability);
    }

    return entropy;
  }

  /**
   * Calculate opportunity score
   * 
   * score = (profit / gas) * e^(-λ * latency) * (1 + entropy)
   */
  private calculateOpportunityScore(
    profitUSD: number,
    gasUsed: number,
    entropy: number,
    blockNumber: number
  ): number {
    const latency = 0; // Simplified for now

    const profitPerGas = profitUSD / gasUsed;
    const latencyDecay = Math.exp(-0.1 * Math.abs(latency)); // λ = 0.1
    const entropyBonus = 1 + entropy * 0.5;

    return profitPerGas * latencyDecay * entropyBonus;
  }
}