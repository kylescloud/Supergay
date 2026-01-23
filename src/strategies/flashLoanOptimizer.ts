import { ethers } from 'ethers';
import { ArbitrageOpportunity, Token, PoolState } from '../types';
import { optimizeFlashLoanSize } from '../math/effectiveRate';

/**
 * Flash Loan Size Optimization Strategy
 * 
 * Key Insight:
 * Most arbitrage bots fail because they use fixed loan sizes.
 * 
 * Profit function: π(x) = x * Π(rate(x)) - x - costs(x)
 * 
 * Optimality condition:
 * dπ/dx = 0 and d²π/dx² < 0
 * 
 * This strategy optimizes the flash loan size for maximum profit, accounting for:
 * - Diminishing returns from slippage
 * - Linearly increasing flash loan fees
 * - Convex gas costs
 */
export class FlashLoanOptimizer {
  private provider: ethers.JsonRpcProvider;
  private minLoanAmount: bigint;
  private maxLoanAmount: bigint;
  private flashFeePremium: number;

  constructor(
    provider: ethers.JsonRpcProvider,
    minLoanAmount: bigint = BigInt('100000000000000000'), // 0.1 ETH
    maxLoanAmount: bigint = BigInt('100000000000000000000'), // 100 ETH
    flashFeePremium: number = 0.0009
  ) {
    this.provider = provider;
    this.minLoanAmount = minLoanAmount;
    this.maxLoanAmount = maxLoanAmount;
    this.flashFeePremium = flashFeePremium;
  }

  /**
   * Optimize loan size for a specific opportunity
   */
  async optimizeLoanSize(
    opportunity: ArbitrageOpportunity
  ): Promise<{ optimalAmount: bigint; optimizedProfit: bigint; improvementPercent: number }> {
    // Calculate profit function for this opportunity
    const calculateProfit = (loanAmount: bigint): bigint => {
      // Simulate the arbitrage with the given loan amount
      return this.simulateArbitrageProfit(opportunity, loanAmount);
    };

    // Find optimal loan size using binary search
    const result = optimizeFlashLoanSize(
      calculateProfit,
      this.minLoanAmount,
      this.maxLoanAmount,
      BigInt('1000000000000000') // 0.001 ETH precision
    );

    // Calculate improvement over original loan amount
    const originalProfit = opportunity.netProfit;
    const improvement = Number(result.expectedProfit - originalProfit) / Number(originalProfit);

    return {
      optimalAmount: result.optimalAmount,
      optimizedProfit: result.expectedProfit,
      improvementPercent: improvement * 100,
    };
  }

  /**
   * Simulate arbitrage profit with different loan sizes
   */
  private simulateArbitrageProfit(
    opportunity: ArbitrageOpportunity,
    loanAmount: bigint
  ): bigint {
    // This is a simplified simulation
    // In production, this would use the actual pool calculations

    let currentAmount = loanAmount;
    let totalGas = 0;

    // Simulate each hop
    for (let i = 0; i < opportunity.pools.length; i++) {
      const pool = opportunity.pools[i];
      const tokenIn = opportunity.path[i];
      const tokenOut = opportunity.path[i + 1];

      // Calculate output with slippage
      const slippage = this.calculateSlippage(pool, currentAmount);
      const effectiveRate = 1.0 - pool.fee / 10000 - slippage;
      currentAmount = (currentAmount * BigInt(Math.floor(effectiveRate * 10000))) / BigInt(10000);
      totalGas += pool.fee; // Simplified gas estimate
    }

    // Calculate flash loan fee
    const flashFee = (loanAmount * BigInt(Math.floor(this.flashFeePremium * 10000))) / BigInt(10000);

    // Calculate gas cost
    const gasPrice = 2000000000n; // 2 gwei (simplified)
    const gasCost = BigInt(totalGas) * gasPrice;

    // Net profit
    const grossProfit = currentAmount - loanAmount;
    const netProfit = grossProfit - flashFee - gasCost;

    return netProfit;
  }

  /**
   * Calculate slippage for a given trade size
   */
  private calculateSlippage(pool: PoolState, amount: bigint): number {
    const liquidity = pool.liquidity || pool.reserve0 || pool.reserve1 || 0n;
    if (liquidity === 0n) return 1.0;

    // Simplified slippage calculation
    const tradeImpact = Number(amount) / Number(liquidity);
    return Math.min(tradeImpact * 0.5, 0.1); // Cap at 10%
  }

  /**
   * Batch optimize multiple opportunities
   */
  async batchOptimizeOpportunities(
    opportunities: ArbitrageOpportunity[]
  ): Promise<ArbitrageOpportunity[]> {
    const optimized: ArbitrageOpportunity[] = [];

    for (const opportunity of opportunities) {
      const result = await this.optimizeLoanSize(opportunity);

      // Update opportunity with optimized parameters
      const updatedOpportunity: ArbitrageOpportunity = {
        ...opportunity,
        loanAmount: result.optimalAmount,
        expectedProfit: result.optimizedProfit,
        netProfit: result.optimizedProfit,
        flashFee: (result.optimalAmount * BigInt(Math.floor(this.flashFeePremium * 10000))) / BigInt(10000),
        // Recalculate expected profit USD
        expectedProfitUSD: Number(result.optimizedProfit) / 1e18 * 2000,
      };

      optimized.push(updatedOpportunity);
    }

    return optimized;
  }

  /**
   * Validate that optimal loan size doesn't exceed pool liquidity
   */
  validateLoanSize(
    loanAmount: bigint,
    pools: PoolState[]
  ): boolean {
    for (const pool of pools) {
      const liquidity = pool.liquidity || pool.reserve0 || pool.reserve1 || 0n;
      
      // Loan should not exceed 10% of pool liquidity to avoid excessive slippage
      const maxSafeLoan = liquidity / BigInt(10);
      
      if (loanAmount > maxSafeLoan) {
        return false;
      }
    }

    return true;
  }

  /**
   * Calculate optimal loan size range for a set of pools
   */
  calculateSafeLoanRange(pools: PoolState[]): { min: bigint; max: bigint } {
    let minLiquidity = BigInt('0');
    let maxLiquidity = BigInt('0');

    for (const pool of pools) {
      const liquidity = pool.liquidity || pool.reserve0 || pool.reserve1 || 0n;
      
      if (liquidity < minLiquidity || minLiquidity === 0n) {
        minLiquidity = liquidity;
      }
      
      if (liquidity > maxLiquidity) {
        maxLiquidity = liquidity;
      }
    }

    // Safe range: 1% to 10% of minimum pool liquidity
    return {
      min: minLiquidity / BigInt(100),
      max: minLiquidity / BigInt(10),
    };
  }

  /**
   * Get profit curve for an opportunity (for analysis)
   */
  getProfitCurve(
    opportunity: ArbitrageOpportunity,
    steps: number = 20
  ): Array<{ loanAmount: bigint; profit: bigint }> {
    const curve: Array<{ loanAmount: bigint; profit: bigint }> = [];
    const stepSize = (this.maxLoanAmount - this.minLoanAmount) / BigInt(steps);

    for (let i = 0; i <= steps; i++) {
      const loanAmount = this.minLoanAmount + (stepSize * BigInt(i));
      const profit = this.simulateArbitrageProfit(opportunity, loanAmount);
      curve.push({ loanAmount, profit });
    }

    return curve;
  }
}