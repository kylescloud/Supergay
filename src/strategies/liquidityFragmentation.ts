import { ethers } from 'ethers';
import { ArbitrageOpportunity, Token, PoolState } from '../types';
import { BaseStrategy } from './baseStrategy';
import { calculateEffectiveRate, calculateMarginalRate } from '../math/effectiveRate';
import { ARBITRAGE_CONFIG } from '../config/constants';

/**
 * Liquidity Fragmentation Arbitrage Strategy
 * 
 * Key invariant: Constant-product AMMs satisfy x * y = k ⇒ dy/dx = -y/x
 * 
 * Fragmentation effect:
 * Two pools with same price but different reserves:
 *   y_1/x_1 = y_2/x_2 but |dy/dx|_1 ≠ |dy/dx|_2
 * 
 * Result:
 * A trade buys in low-slope pool and sells in high-slope pool
 * Produces profit even at equal spot price.
 * 
 * Most scanners never compute slope, which is why this opportunity exists.
 */
export class LiquidityFragmentationStrategy extends BaseStrategy {
  constructor(
    provider: ethers.JsonRpcProvider,
    minProfitThreshold: number = 0.01
  ) {
    super(provider, minProfitThreshold);
  }

  /**
   * Get strategy name
   */
  getName(): string {
    return 'Liquidity Fragmentation Arbitrage';
  }

  /**
   * Find liquidity fragmentation arbitrage opportunities
   */
  async findOpportunities(
    pools: Map<string, PoolState>,
    baseToken: Token,
    loanAmount: bigint
  ): Promise<ArbitrageOpportunity[]> {
    const opportunities: ArbitrageOpportunity[] = [];
    const currentBlock = await this.provider.getBlockNumber();

    // Group pools by token pair
    const poolsByPair = this.groupPoolsByPair(pools);

    // Check each pair for fragmentation arbitrage
    for (const [pairKey, pairPools] of poolsByPair) {
      if (pairPools.length < 2) continue; // Need at least 2 pools

      const opportunity = await this.checkFragmentationArbitrage(
        pairPools,
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
   * Group pools by token pair (same as fee-tier, but for all DEXs)
   */
  private groupPoolsByPair(pools: Map<string, PoolState>): Map<string, PoolState[]> {
    const grouped = new Map<string, PoolState[]>();

    for (const pool of pools.values()) {
      const token0 = pool.token0.address.toLowerCase();
      const token1 = pool.token1.address.toLowerCase();
      const pairKey = [token0, token1].sort().join('-');

      if (!grouped.has(pairKey)) {
        grouped.set(pairKey, []);
      }
      grouped.get(pairKey)!.push(pool);
    }

    return grouped;
  }

  /**
   * Check for liquidity fragmentation arbitrage
   */
  private async checkFragmentationArbitrage(
    pairPools: PoolState[],
    baseToken: Token,
    loanAmount: bigint,
    blockNumber: number
  ): Promise<ArbitrageOpportunity | null> {
    if (pairPools.length < 2) return null;

    // Calculate marginal rates for each pool
    const poolMarginalRates: Array<{ pool: PoolState; marginalRate: number; effectiveRate: number }> = [];

    for (const pool of pairPools) {
      const tokenIn = pool.token0.address === baseToken.address ? pool.token0 : pool.token1;
      const tokenOut = pool.token0.address === baseToken.address ? pool.token1 : pool.token0;

      try {
        const effectiveRate = calculateEffectiveRate(pool, tokenIn, tokenOut, loanAmount);
        const marginalRate = calculateMarginalRate(pool, tokenIn, tokenOut, loanAmount);

        poolMarginalRates.push({
          pool,
          marginalRate,
          effectiveRate: effectiveRate.rate,
        });
      } catch (error) {
        continue;
      }
    }

    if (poolMarginalRates.length < 2) return null;

    // Sort by marginal rate (ascending)
    poolMarginalRates.sort((a, b) => a.marginalRate - b.marginalRate);

    // Check for significant marginal rate difference
    const lowestSlopePool = poolMarginalRates[0];
    const highestSlopePool = poolMarginalRates[poolMarginalRates.length - 1];

    const marginalRateDiff = highestSlopePool.marginalRate - lowestSlopePool.marginalRate;
    const relativeDiff = marginalRateDiff / lowestSlopePool.marginalRate;

    // Need at least ARBITRAGE_CONFIG.PRICE_TOLERANCE difference in slopes
    if (relativeDiff < ARBITRAGE_CONFIG.PRICE_TOLERANCE) {
      return null;
    }

    // Simulate arbitrage: buy in low-slope pool, sell in high-slope pool
    const tokenOut = lowestSlopePool.pool.token0.address === baseToken.address 
      ? lowestSlopePool.pool.token1 
      : lowestSlopePool.pool.token0;

    // Buy in low-slope pool (better rate for larger trades)
    const buyResult = calculateEffectiveRate(
      lowestSlopePool.pool,
      baseToken,
      tokenOut,
      loanAmount
    );
    const intermediateAmount = buyResult.amountOut;

    // Sell in high-slope pool (better rate for selling)
    const sellResult = calculateEffectiveRate(
      highestSlopePool.pool,
      tokenOut,
      baseToken,
      intermediateAmount
    );

    // Calculate costs
    const flashFee = this.calculateFlashFee(loanAmount);
    const totalGas = buyResult.gasEstimate + sellResult.gasEstimate;
    const gasPrice = await this.provider.getFeeData();
    const gasCost = BigInt(totalGas) * (gasPrice.gasPrice || 2000000000n);

    // Calculate profit
    const finalAmount = sellResult.amountOut;
    const grossProfit = finalAmount - loanAmount;
    const netProfit = grossProfit - flashFee - gasCost;

    if (netProfit <= 0n) return null;

    // Convert to USD
    const profitUSD = Number(netProfit) / 1e18 * 2000;

    // Build opportunity
    return {
      id: this.generateOpportunityId([baseToken, tokenOut, baseToken], blockNumber),
      baseToken,
      loanAmount,
      path: [baseToken, tokenOut, baseToken],
      dexes: [lowestSlopePool.pool.dex, highestSlopePool.pool.dex],
      pools: [lowestSlopePool.pool, highestSlopePool.pool],
      expectedProfit: netProfit,
      expectedProfitUSD: profitUSD,
      flashFee,
      gasCost,
      netProfit,
      timestamp: Date.now(),
      blockNumber,
      score: profitUSD / totalGas,
      entropy: 0.7, // Higher uniqueness due to cross-DEX
      dexTypes: [lowestSlopePool.pool.dex.toLowerCase(), highestSlopePool.pool.dex.toLowerCase()],
      dexIdentifiers: [lowestSlopePool.pool.dex, highestSlopePool.pool.dex],
    };
  }

  /**
   * Validate opportunity before execution
   */
  async validateOpportunity(opportunity: ArbitrageOpportunity): Promise<boolean> {
    // Check minimum profit threshold
    if (opportunity.expectedProfitUSD < this.minProfitThreshold) {
      return false;
    }

    // Verify pools are from different DEXs
    if (opportunity.dexes[0] === opportunity.dexes[1]) {
      return false;
    }

    // Check if marginal rates are still favorable
    const loanAmount = opportunity.loanAmount;
    const pool0 = opportunity.pools[0];
    const pool1 = opportunity.pools[1];

    const tokenIn = opportunity.path[0];
    const tokenOut = opportunity.path[1];

    const marginalRate0 = calculateMarginalRate(pool0, tokenIn, tokenOut, loanAmount);
    const marginalRate1 = calculateMarginalRate(pool1, tokenOut, tokenIn, loanAmount);

    // Low-slope pool should have lower marginal rate
    if (marginalRate0 >= marginalRate1) {
      return false;
    }

    return true;
  }

  /**
   * Get liquidity depth for a pool
   */
  private getLiquidityDepth(pool: PoolState): bigint {
    switch (pool.version) {
      case 'v3':
        return pool.liquidity || 0n;
      case 'v2':
      case 'curve':
        return (pool.reserve0 || 0n) + (pool.reserve1 || 0n);
      default:
        return 0n;
    }
  }

  /**
   * Calculate slippage for a trade size
   */
  private calculateSlippage(
    pool: PoolState,
    amountIn: bigint,
    amountOut: bigint
  ): number {
    const liquidity = this.getLiquidityDepth(pool);
    if (liquidity === 0n) return 1;

    // Simplified slippage calculation
    const slippage = Number(amountIn) / Number(liquidity);
    return Math.min(slippage, ARBITRAGE_CONFIG.MAX_SLIPPAGE);
  }
}