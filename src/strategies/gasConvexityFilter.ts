import { ethers } from 'ethers';
import { ArbitrageOpportunity } from '../types';
import { GAS_LIMITS, GAS_PRICES, MEV_CONFIG } from '../config/constants';

/**
 * Gas Convexity Filter Strategy
 * 
 * Observation:
 * Gas is stepwise, not linear. Most scanners treat it as linear.
 * 
 * Logic:
 * Scanner computes profit / gasUsed and rejects trades where:
 * Δprofit < Δgas * riskFactor
 * 
 * This avoids MEV bait and ensures profitable execution.
 */
export class GasConvexityFilter {
  private provider: ethers.JsonRpcProvider;
  private riskFactor: number;

  constructor(
    provider: ethers.JsonRpcProvider,
    riskFactor: number = MEV_CONFIG.RISK_FACTOR
  ) {
    this.provider = provider;
    this.riskFactor = riskFactor;
  }

  /**
   * Filter opportunities based on gas convexity
   */
  async filterOpportunities(
    opportunities: ArbitrageOpportunity[]
  ): Promise<ArbitrageOpportunity[]> {
    const filtered: ArbitrageOpportunity[] = [];

    for (const opportunity of opportunities) {
      if (await this.passesGasFilter(opportunity)) {
        filtered.push(opportunity);
      }
    }

    return filtered;
  }

  /**
   * Check if opportunity passes gas filter
   */
  private async passesGasFilter(opportunity: ArbitrageOpportunity): Promise<boolean> {
    // Get current gas price
    const feeData = await this.provider.getFeeData();
    const gasPrice = feeData.gasPrice || BigInt(GAS_PRICES.MEDIUM);

    // Estimate total gas for this opportunity
    const totalGas = this.estimateTotalGas(opportunity);

    // Calculate gas cost
    const gasCost = BigInt(totalGas) * gasPrice;

    // Calculate profit after gas
    const profitAfterGas = opportunity.netProfit - gasCost;

    // Must be profitable after gas
    if (profitAfterGas <= 0n) {
      return false;
    }

    // Calculate profit per gas
    const profitPerGas = Number(profitAfterGas) / Number(totalGas);

    // Profit per gas must exceed minimum threshold
    // This threshold accounts for gas price volatility
    const minProfitPerGas = 100; // 100 wei per gas unit (adjust based on network)

    if (profitPerGas < minProfitPerGas) {
      return false;
    }

    // Check gas price limits
    if (gasPrice > BigInt(GAS_PRICES.MAX)) {
      return false;
    }

    // Check for gas convexity issues
    if (this.hasGasConvexityIssue(opportunity, gasPrice)) {
      return false;
    }

    return true;
  }

  /**
   * Estimate total gas for an opportunity
   */
  private estimateTotalGas(opportunity: ArbitrageOpportunity): number {
    let totalGas: number = Number(GAS_LIMITS.FLASH_LOAN_OVERHEAD);

    // Add gas for each swap hop
    for (const pool of opportunity.pools) {
      switch (pool.version) {
        case 'v3':
          totalGas += Number(GAS_LIMITS.SWAP_PER_HOP) * 1.5; // V3 uses more gas
          break;
        case 'v2':
          totalGas += Number(GAS_LIMITS.SWAP_PER_HOP);
          break;
        case 'curve':
          totalGas += Number(GAS_LIMITS.SWAP_PER_HOP) * 2; // Curve uses more gas
          break;
      }
    }

    // Add buffer for safety
    totalGas = Math.floor(totalGas * 1.1);

    // Cap at maximum
    const maxGas: number = Number(GAS_LIMITS.TOTAL_MAX);
    return Math.min(totalGas, maxGas);
  }

  /**
   * Check for gas convexity issues
   * 
   * Gas convexity occurs when small changes in gas price cause large
   * changes in profitability, making the trade risky.
   */
  private hasGasConvexityIssue(
    opportunity: ArbitrageOpportunity,
    currentGasPrice: bigint
  ): boolean {
    // Calculate profit at current gas price
    const profitAtCurrent = opportunity.netProfit - opportunity.gasCost;

    // Calculate profit at slightly higher gas price (+10%)
    const higherGasPrice = currentGasPrice * BigInt(11) / BigInt(10);
    const gasCostAtHigher = (opportunity.gasCost / (currentGasPrice || 1n)) * higherGasPrice;
    const profitAtHigher = opportunity.netProfit - gasCostAtHigher;

    // Calculate profit at slightly lower gas price (-10%)
    const lowerGasPrice = currentGasPrice * BigInt(9) / BigInt(10);
    const gasCostAtLower = (opportunity.gasCost / (currentGasPrice || 1n)) * lowerGasPrice;
    const profitAtLower = opportunity.netProfit - gasCostAtLower;

    // Check convexity: profit should not change too drastically with gas price
    const profitChange = Number(profitAtHigher - profitAtLower);
    const profitChangePercent = Math.abs(profitChange) / Number(profitAtCurrent);

    // If profit changes by more than 50% with 20% gas price swing, it's too convex
    if (profitChangePercent > 0.5) {
      return true;
    }

    // Check second derivative (convexity)
    // If d²π/dx² is too negative, small gas price increases can kill profitability
    const convexity = profitAtHigher - profitAtCurrent - (profitAtCurrent - profitAtLower);
    
    // Negative convexity is bad
    if (convexity < 0n) {
      return true;
    }

    return false;
  }

  /**
   * Calculate minimum profitable gas price for an opportunity
   */
  calculateMaxProfitableGasPrice(opportunity: ArbitrageOpportunity): bigint {
    const totalGas = this.estimateTotalGas(opportunity);
    const maxGasCost = opportunity.netProfit;
    return maxGasCost / BigInt(totalGas);
  }

  /**
   * Score opportunity based on gas efficiency
   */
  scoreGasEfficiency(opportunity: ArbitrageOpportunity): number {
    const totalGas = this.estimateTotalGas(opportunity);
    const profitPerGas = Number(opportunity.netProfit) / totalGas;

    // Normalize score (higher is better)
    // Typical profit per gas might be 100-1000 wei
    const normalizedScore = Math.min(profitPerGas / 1000, 1.0);

    return normalizedScore;
  }

  /**
   * Get gas price recommendation
   */
  async getGasPriceRecommendation(opportunity: ArbitrageOpportunity): Promise<{
    recommendedGasPrice: bigint;
    maxGasPrice: bigint;
    gasCostEstimate: bigint;
    isProfitable: boolean;
  }> {
    const feeData = await this.provider.getFeeData();
    const currentGasPrice = feeData.gasPrice || BigInt(GAS_PRICES.MEDIUM);

    const totalGas = this.estimateTotalGas(opportunity);
    const maxProfitableGasPrice = this.calculateMaxProfitableGasPrice(opportunity);

    // Recommended gas price: current price, capped at max profitable
    const recommendedGasPrice = currentGasPrice > maxProfitableGasPrice 
      ? maxProfitableGasPrice 
      : currentGasPrice;

    const gasCostEstimate = BigInt(totalGas) * recommendedGasPrice;
    const profitAfterGas = opportunity.netProfit - gasCostEstimate;

    return {
      recommendedGasPrice,
      maxGasPrice: maxProfitableGasPrice,
      gasCostEstimate,
      isProfitable: profitAfterGas > 0n,
    };
  }

  /**
   * Filter out opportunities that are MEV bait
   * 
   * MEV bait are opportunities that look profitable but will be
   * frontrun by MEV bots before execution.
   */
  filterMEVBait(opportunities: ArbitrageOpportunity[]): ArbitrageOpportunity[] {
    const filtered: ArbitrageOpportunity[] = [];

    for (const opportunity of opportunities) {
      // Check if opportunity has low entropy (common path)
      if (opportunity.entropy < 0.3) {
        // Low entropy =容易被MEV = easy to MEV
        // Only execute if profit is very high
        if (opportunity.expectedProfitUSD < 10) {
          continue; // Skip low-profit, low-entropy opportunities
        }
      }

      // Check if profit margin is too thin
      const profitMargin = Number(opportunity.netProfit) / Number(opportunity.loanAmount);
      if (profitMargin < 0.001) { // Less than 0.1% margin
        continue; // Too risky, will be frontrun
      }

      filtered.push(opportunity);
    }

    return filtered;
  }
}