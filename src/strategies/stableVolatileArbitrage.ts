import { ethers } from 'ethers';
import { ArbitrageOpportunity, Token, PoolState } from '../types';
import { BaseStrategy } from './baseStrategy';
import { calculateEffectiveRate } from '../math/effectiveRate';

/**
 * Stable ↔ Volatile Curve Arbitrage Strategy
 * 
 * Mathematical Edge:
 * Stable AMM invariant (simplified): x³y + y³x = k
 * Consequence: Second derivative d²y/dx² ≈ 0 near peg
 * 
 * Volatile AMMs: d²y/dx² ≠ 0
 * 
 * Result:
 * Under small imbalance:
 *   - Stable pools resist price movement
 *   - Volatile pools overshoot
 * 
 * This creates directional arbitrage under low volatility, which price-only scanners miss.
 */
export class StableVolatileArbitrageStrategy extends BaseStrategy {
  private stableTokens: Set<string>;
  private volatileTokens: Set<string>;

  constructor(
    provider: ethers.JsonRpcProvider,
    minProfitThreshold: number = 0.01
  ) {
    super(provider, minProfitThreshold);
    
    // Define stable tokens (USDC, USDbC, DAI, USDT)
    this.stableTokens = new Set([
      '0x833589fCD6eDb6E08f4c7C32D4f71b54bDA02913'.toLowerCase(), // USDC
      '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA'.toLowerCase(), // USDbC
      '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb'.toLowerCase(), // DAI
      '0xfde4C96c8593536E31F229EA8f37b2ADa39a4E7d'.toLowerCase(), // USDT
    ]);

    // Define volatile tokens (WETH, WBTC, CBETH, etc.)
    this.volatileTokens = new Set([
      '0x4200000000000000000000000000000000000006'.toLowerCase(), // WETH
      '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f'.toLowerCase(), // WBTC
      '0x2Ae3F1Ec7F1F5012CF12ab14Ad75ca5A5d9f83e8'.toLowerCase(), // CBETH
    ]);
  }

  /**
   * Get strategy name
   */
  getName(): string {
    return 'Stable ↔ Volatile Curve Arbitrage';
  }

  /**
   * Find stable-volatile arbitrage opportunities
   */
  async findOpportunities(
    pools: Map<string, PoolState>,
    baseToken: Token,
    loanAmount: bigint
  ): Promise<ArbitrageOpportunity[]> {
    const opportunities: ArbitrageOpportunity[] = [];
    const currentBlock = await this.provider.getBlockNumber();

    // Find stable pools and volatile pools
    const stablePools = this.filterPoolsByTokenTypes(pools, this.stableTokens, this.volatileTokens);
    const volatilePools = this.filterPoolsByTokenTypes(pools, this.volatileTokens, this.stableTokens);

    // Check for arbitrage between stable and volatile pools
    for (const [stablePairKey, stablePool] of stablePools) {
      // Find corresponding volatile pool with same tokens
      const volatilePool = volatilePools.get(stablePairKey);
      if (!volatilePool) continue;

      const opportunity = await this.checkStableVolatileArbitrage(
        stablePool,
        volatilePool,
        baseToken,
        loanAmount,
        currentBlock
      );

      if (opportunity && opportunity.netProfit > 0n) {
        opportunities.push(opportunity);
      }
    }

    // Also check for multi-hop opportunities: Stable → Stable → Volatile → Stable
    const multiHopOpportunities = await this.findMultiHopStableVolatileArbitrage(
      pools,
      baseToken,
      loanAmount,
      currentBlock
    );

    opportunities.push(...multiHopOpportunities);

    return opportunities;
  }

  /**
   * Filter pools by token types
   */
  private filterPoolsByTokenTypes(
    pools: Map<string, PoolState>,
    tokenType0: Set<string>,
    tokenType1: Set<string>
  ): Map<string, PoolState> {
    const filtered = new Map<string, PoolState>();

    for (const pool of pools.values()) {
      const token0IsType0 = tokenType0.has(pool.token0.address.toLowerCase());
      const token1IsType1 = tokenType1.has(pool.token1.address.toLowerCase());
      const token0IsType1 = tokenType1.has(pool.token0.address.toLowerCase());
      const token1IsType0 = tokenType0.has(pool.token1.address.toLowerCase());

      // Pool must have one token from each type
      if ((token0IsType0 && token1IsType1) || (token0IsType1 && token1IsType0)) {
        const pairKey = [pool.token0.address, pool.token1.address]
          .map(a => a.toLowerCase())
          .sort()
          .join('-');
        filtered.set(pairKey, pool);
      }
    }

    return filtered;
  }

  /**
   * Check for stable-volatile arbitrage (simple 2-hop)
   */
  private async checkStableVolatileArbitrage(
    stablePool: PoolState,
    volatilePool: PoolState,
    baseToken: Token,
    loanAmount: bigint,
    blockNumber: number
  ): Promise<ArbitrageOpportunity | null> {
    // Determine which token is which
    const stableToken = this.stableTokens.has(stablePool.token0.address.toLowerCase())
      ? stablePool.token0
      : stablePool.token1;

    const volatileToken = this.volatileTokens.has(volatilePool.token0.address.toLowerCase())
      ? volatilePool.token0
      : volatilePool.token1;

    // Simulate: Buy volatile in stable pool (stable curve resists movement)
    const buyInStableResult = calculateEffectiveRate(
      stablePool,
      baseToken,
      volatileToken,
      loanAmount
    );
    const intermediateAmount = buyInStableResult.amountOut;

    // Sell volatile in volatile pool (volatile curve overshoots)
    const sellInVolatileResult = calculateEffectiveRate(
      volatilePool,
      volatileToken,
      baseToken,
      intermediateAmount
    );

    // Calculate costs
    const flashFee = this.calculateFlashFee(loanAmount);
    const totalGas = buyInStableResult.gasEstimate + sellInVolatileResult.gasEstimate;
    const gasPrice = await this.provider.getFeeData();
    const gasCost = BigInt(totalGas) * (gasPrice.gasPrice || 2000000000n);

    // Calculate profit
    const finalAmount = sellInVolatileResult.amountOut;
    const grossProfit = finalAmount - loanAmount;
    const netProfit = grossProfit - flashFee - gasCost;

    if (netProfit <= 0n) return null;

    // Convert to USD
    const profitUSD = Number(netProfit) / 1e18 * 2000;

    // Build opportunity
    return {
      id: this.generateOpportunityId([baseToken, volatileToken, baseToken], blockNumber),
      baseToken,
      loanAmount,
      path: [baseToken, volatileToken, baseToken],
      dexes: [stablePool.dex, volatilePool.dex],
      pools: [stablePool, volatilePool],
      expectedProfit: netProfit,
      expectedProfitUSD: profitUSD,
      flashFee,
      gasCost,
      netProfit,
      timestamp: Date.now(),
      blockNumber,
      score: profitUSD / totalGas,
      entropy: 0.6, // Medium uniqueness
      dexTypes: [stablePool.dex.toLowerCase(), volatilePool.dex.toLowerCase()],
      dexIdentifiers: [stablePool.dex, volatilePool.dex],
    };
  }

  /**
   * Find multi-hop stable-volatile arbitrage opportunities
   * 
   * Example: USDC → DAI → WETH → USDC
   * - USDC → DAI: Stable → Stable (Curve, low slippage)
   * - DAI → WETH: Stable → Volatile (stable pool resists, volatile overshoots)
   * - WETH → USDC: Volatile → Stable (volatile overshoots back)
   */
  private async findMultiHopStableVolatileArbitrage(
    pools: Map<string, PoolState>,
    baseToken: Token,
    loanAmount: bigint,
    blockNumber: number
  ): Promise<ArbitrageOpportunity[]> {
    const opportunities: ArbitrageOpportunity[] = [];

    // Find all stable tokens
    const stableTokensArray = Array.from(this.stableTokens);
    const volatileTokensArray = Array.from(this.volatileTokens);

    // Try all 3-hop combinations: Stable → Stable → Volatile → Stable
    for (const stableToken1 of stableTokensArray) {
      for (const stableToken2 of stableTokensArray) {
        if (stableToken1 === stableToken2) continue;

        for (const volatileToken of volatileTokensArray) {
          // Find pools for each hop
          const hop1Pool = this.findBestPool(pools, baseToken.address, stableToken1, 'curve');
          const hop2Pool = this.findBestPool(pools, stableToken1, stableToken2, 'curve');
          const hop3Pool = this.findBestPool(pools, stableToken2, volatileToken, 'uniswap-v3');
          const hop4Pool = this.findBestPool(pools, volatileToken, baseToken.address, 'uniswap-v3');

          if (!hop1Pool || !hop2Pool || !hop3Pool || !hop4Pool) continue;

          // Simulate the 4-hop arbitrage
          let currentAmount = loanAmount;
          let totalGas = 0;
          const path: Token[] = [baseToken];
          const dexes: string[] = [];
          const routePools: PoolState[] = [];

          // Hop 1: Base → Stable1 (Curve)
          const result1 = calculateEffectiveRate(hop1Pool, baseToken, hop1Pool.token1, currentAmount);
          currentAmount = result1.amountOut;
          totalGas += result1.gasEstimate;
          path.push(hop1Pool.token1);
          dexes.push(hop1Pool.dex);
          routePools.push(hop1Pool);

          // Hop 2: Stable1 → Stable2 (Curve)
          const result2 = calculateEffectiveRate(hop2Pool, hop1Pool.token1, hop2Pool.token1, currentAmount);
          currentAmount = result2.amountOut;
          totalGas += result2.gasEstimate;
          path.push(hop2Pool.token1);
          dexes.push(hop2Pool.dex);
          routePools.push(hop2Pool);

          // Hop 3: Stable2 → Volatile (Uniswap V3 - volatile overshoots)
          const result3 = calculateEffectiveRate(hop3Pool, hop2Pool.token1, hop3Pool.token1, currentAmount);
          currentAmount = result3.amountOut;
          totalGas += result3.gasEstimate;
          path.push(hop3Pool.token1);
          dexes.push(hop3Pool.dex);
          routePools.push(hop3Pool);

          // Hop 4: Volatile → Base (Uniswap V3)
          const result4 = calculateEffectiveRate(hop4Pool, hop3Pool.token1, baseToken, currentAmount);
          currentAmount = result4.amountOut;
          totalGas += result4.gasEstimate;
          path.push(baseToken);
          dexes.push(hop4Pool.dex);
          routePools.push(hop4Pool);

          // Calculate costs
          const flashFee = this.calculateFlashFee(loanAmount);
          const gasPrice = await this.provider.getFeeData();
          const gasCost = BigInt(totalGas) * (gasPrice.gasPrice || 2000000000n);

          // Calculate profit
          const finalAmount = currentAmount;
          const grossProfit = finalAmount - loanAmount;
          const netProfit = grossProfit - flashFee - gasCost;

          if (netProfit > 0n) {
            const profitUSD = Number(netProfit) / 1e18 * 2000;

            opportunities.push({
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
              score: profitUSD / totalGas,
              entropy: 0.8, // High uniqueness for complex paths
              dexTypes: dexes.map(d => d.toLowerCase()),
              dexIdentifiers: dexes,
            });
          }
        }
      }
    }

    return opportunities;
  }

  /**
   * Find best pool for a token pair
   */
  private findBestPool(
    pools: Map<string, PoolState>,
    tokenA: string,
    tokenB: string,
    preferredDex?: string
  ): PoolState | null {
    let bestPool: PoolState | null = null;
    let bestScore = 0;

    for (const pool of pools.values()) {
      const token0Matches = pool.token0.address.toLowerCase() === tokenA.toLowerCase() ||
                           pool.token0.address.toLowerCase() === tokenB.toLowerCase();
      const token1Matches = pool.token1.address.toLowerCase() === tokenA.toLowerCase() ||
                           pool.token1.address.toLowerCase() === tokenB.toLowerCase();

      if (!token0Matches || !token1Matches) continue;

      // Prefer specified DEX
      if (preferredDex && pool.dex !== preferredDex) continue;

      // Score based on liquidity
      const liquidity = pool.liquidity || pool.reserve0 || pool.reserve1 || 0n;
      const score = Number(liquidity);

      if (score > bestScore) {
        bestScore = score;
        bestPool = pool;
      }
    }

    return bestPool;
  }

  /**
   * Validate opportunity before execution
   */
  async validateOpportunity(opportunity: ArbitrageOpportunity): Promise<boolean> {
    // Check minimum profit threshold
    if (opportunity.expectedProfitUSD < this.minProfitThreshold) {
      return false;
    }

    // Verify path includes both stable and volatile tokens
    const hasStable = opportunity.path.some(t => this.stableTokens.has(t.address.toLowerCase()));
    const hasVolatile = opportunity.path.some(t => this.volatileTokens.has(t.address.toLowerCase()));

    if (!hasStable || !hasVolatile) {
      return false;
    }

    // Verify at least one Curve pool (stable) and one Uniswap V3 (volatile)
    const hasCurve = opportunity.dexes.includes('curve');
    const hasV3 = opportunity.dexes.includes('uniswap-v3');

    if (!hasCurve || !hasV3) {
      return false;
    }

    return true;
  }
}