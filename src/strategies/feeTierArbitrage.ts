import { ethers } from 'ethers';
import { ArbitrageOpportunity, Token, PoolState } from '../types';
import { BaseStrategy } from './baseStrategy';
import { calculateEffectiveRate } from '../math/effectiveRate';

/**
 * Fee-Tier Mispricing Arbitrage Strategy
 * 
 * Observes that for the same token pair, two pools with different fee tiers cannot both be optimal
 * unless liquidity is perfectly balanced.
 * 
 * Rate formula: R = (√P_out / √P_in)² * (1 - f)
 * 
 * Proof sketch:
 * If R_p1 > R_p2:
 *   - Rational flow moves through p1
 *   - Liquidity rebalancing lags block time
 *   - Transient arbitrage exists
 * 
 * This persists until dP/dt_p1 = dP/dt_p2, which empirically takes multiple blocks.
 */
export class FeeTierArbitrageStrategy extends BaseStrategy {
  // CRITICAL FIX #2: All V3 DEXs that have fee tiers
  private readonly V3_DEXS = new Set([
    'uniswap-v3',
    'sushiswap-v3',
    'pancakeswap-v3',
    'aerodrome-slipstream',
    'aerodrome-slipstream-2',
    'uniswap-v4' // Also has fee tiers
  ]);

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
    return 'Fee-Tier Mispricing Arbitrage';
  }

  /**
   * Find fee-tier arbitrage opportunities
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

    // Check each pair for fee-tier arbitrage
    for (const [pairKey, pairPools] of poolsByPair) {
      if (pairPools.length < 2) continue; // Need at least 2 pools

      const opportunity = await this.checkFeeTierArbitrage(
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
   * Group pools by token pair
   * CRITICAL FIX #2: Now includes all V3 DEXs, not just Uniswap V3
   */
  private groupPoolsByPair(pools: Map<string, PoolState>): Map<string, PoolState[]> {
    const grouped = new Map<string, PoolState[]>();

    for (const pool of pools.values()) {
      // Check if DEX has fee tiers (all V3 DEXs)
      if (!this.V3_DEXS.has(pool.dex.toLowerCase())) continue;

      // Validate pool has fee tier data
      if (!pool.fee || pool.fee === 0) continue;

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
   * Check for fee-tier arbitrage in a token pair
   */
  private async checkFeeTierArbitrage(
    pairPools: PoolState[],
    baseToken: Token,
    loanAmount: bigint,
    blockNumber: number
  ): Promise<ArbitrageOpportunity | null> {
    if (pairPools.length < 2) return null;

    // Sort pools by fee tier
    const sortedPools = pairPools.sort((a, b) => a.fee - b.fee);

    // Find the best buying pool (lowest fee, good rate)
    // and the best selling pool (higher fee, better rate)
    let bestBuyPool: PoolState | null = null;
    let bestSellPool: PoolState | null = null;
    let bestBuyRate = 0;
    let bestSellRate = 0;

    for (const pool of sortedPools) {
      const tokenIn = pool.token0.address === baseToken.address ? pool.token0 : pool.token1;
      const tokenOut = pool.token0.address === baseToken.address ? pool.token1 : pool.token0;

      const rateResult = calculateEffectiveRate(pool, tokenIn, tokenOut, loanAmount);

      // For buying: want higher rate (more output)
      if (rateResult.rate > bestBuyRate) {
        bestBuyRate = rateResult.rate;
        bestBuyPool = pool;
      }
    }

    // Check if we found opportunities
    if (!bestBuyPool) return null;

    // Simulate the arbitrage: buy in one fee tier, sell in another
    const tokenOut = bestBuyPool.token0.address === baseToken.address ? bestBuyPool.token1 : bestBuyPool.token0;

    // Calculate profit from buying in best pool
    const buyResult = calculateEffectiveRate(bestBuyPool, baseToken, tokenOut, loanAmount);
    const intermediateAmount = buyResult.amountOut;

    // Calculate profit from selling back to base token in different fee tier
    let bestFinalAmount = 0n;
    let bestSellPoolForReturn: PoolState | null = null;

    for (const pool of sortedPools) {
      if (pool === bestBuyPool) continue; // Don't use the same pool

      const returnResult = calculateEffectiveRate(
        pool,
        tokenOut,
        baseToken,
        intermediateAmount
      );

      if (returnResult.amountOut > bestFinalAmount) {
        bestFinalAmount = returnResult.amountOut;
        bestSellPoolForReturn = pool;
      }
    }

    if (!bestSellPoolForReturn) return null;

    // Calculate costs
    const flashFee = this.calculateFlashFee(loanAmount);
    const totalGas = buyResult.gasEstimate + bestSellPoolForReturn.fee; // Simplified gas calculation
    const gasPrice = await this.provider.getFeeData();
    const gasCost = BigInt(totalGas) * (gasPrice.gasPrice || 2000000000n);

    // Calculate profit
    const finalAmount = bestFinalAmount;
    const grossProfit = finalAmount - loanAmount;
    const netProfit = grossProfit - flashFee - gasCost;

    if (netProfit <= 0n) return null;

    // Convert to USD
    const profitUSD = Number(netProfit) / 1e18 * 2000; // Assuming $2000 ETH

    // Build opportunity
    return {
      id: this.generateOpportunityId(
        [baseToken, tokenOut, baseToken],
        blockNumber
      ),
      baseToken,
      loanAmount,
      path: [baseToken, tokenOut, baseToken],
      dexes: [bestBuyPool.dex, bestSellPoolForReturn!.dex],
      pools: [bestBuyPool, bestSellPoolForReturn!],
      expectedProfit: netProfit,
      expectedProfitUSD: profitUSD,
      flashFee,
      gasCost,
      netProfit,
      timestamp: Date.now(),
      blockNumber,
      score: profitUSD / totalGas,
      entropy: 0.5, // Medium uniqueness for fee-tier arb
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

    // Verify pools still exist and have liquidity
    if (opportunity.pools.length < 2) {
      return false;
    }

    // Check if fee tiers are different
    const fee0 = opportunity.pools[0].fee;
    const fee1 = opportunity.pools[1].fee;
    if (fee0 === fee1) {
      return false; // Not a fee-tier arbitrage
    }

    return true;
  }
}