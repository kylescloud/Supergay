import { ethers } from 'ethers';
import { ArbitrageOpportunity } from '../types';
import { MEV_CONFIG } from '../config/constants';

/**
 * Time-Decay Opportunity Scoring Strategy
 * 
 * Observation:
 * Old arbitrage opportunities get sandwiched by MEV bots.
 * 
 * Logic:
 * Each opportunity gets a score:
 * score = profit * e^(-latency * λ)
 * 
 * Only execute highest-score opportunities.
 * 
 * Where:
 * - latency = time since opportunity was discovered
 * - λ = decay constant (typically 0.1)
 * - e^(-latency * λ) = exponential decay factor
 */
export class TimeDecayScoring {
  private provider: ethers.JsonRpcProvider;
  private lambda: number; // Decay constant
  private currentBlock: number;

  constructor(
    provider: ethers.JsonRpcProvider,
    lambda: number = MEV_CONFIG.LATENCY_DECAY_LAMBDA
  ) {
    this.provider = provider;
    this.lambda = lambda;
    this.currentBlock = 0;
  }

  /**
   * Update current block number
   */
  async updateCurrentBlock(): Promise<void> {
    this.currentBlock = await this.provider.getBlockNumber();
  }

  /**
   * Score opportunities based on time decay
   */
  async scoreOpportunities(
    opportunities: ArbitrageOpportunity[]
  ): Promise<ArbitrageOpportunity[]> {
    // Update current block
    await this.updateCurrentBlock();

    // Score each opportunity
    const scored = opportunities.map(opp => ({
      ...opp,
      score: this.calculateTimeDecayScore(opp),
    }));

    // Sort by score (descending)
    scored.sort((a, b) => b.score - a.score);

    return scored;
  }

  /**
   * Calculate time decay score for an opportunity
   */
  private calculateTimeDecayScore(opportunity: ArbitrageOpportunity): number {
    // Calculate block latency
    const blockLatency = this.currentBlock - opportunity.blockNumber;

    // Calculate time latency (assuming 2 seconds per block)
    const timeLatency = blockLatency * 2;

    // Calculate decay factor
    const decayFactor = Math.exp(-this.lambda * timeLatency);

    // Calculate score
    const score = opportunity.expectedProfitUSD * decayFactor;

    return score;
  }

  /**
   * Filter out stale opportunities
   */
  filterStaleOpportunities(
    opportunities: ArbitrageOpportunity[],
    maxBlockAge: number = 3
  ): ArbitrageOpportunity[] {
    const currentBlock = this.currentBlock;

    return opportunities.filter(opp => {
      const blockAge = currentBlock - opp.blockNumber;
      return blockAge <= maxBlockAge;
    });
  }

  /**
   * Get top N opportunities by score
   */
  getTopOpportunities(
    opportunities: ArbitrageOpportunity[],
    topN: number = 5
  ): ArbitrageOpportunity[] {
    return opportunities.slice(0, topN);
  }

  /**
   * Calculate opportunity freshness (0 to 1, where 1 is fresh)
   */
  calculateFreshness(opportunity: ArbitrageOpportunity): number {
    const blockLatency = this.currentBlock - opportunity.blockNumber;
    const timeLatency = blockLatency * 2;

    // Freshness decays exponentially
    const freshness = Math.exp(-this.lambda * timeLatency);

    return freshness;
  }

  /**
   * Get execution priority for opportunities
   */
  async getExecutionPriority(
    opportunities: ArbitrageOpportunity[]
  ): Promise<Array<{ opportunity: ArbitrageOpportunity; priority: number }>> {
    const scored = await this.scoreOpportunities(opportunities);

    return scored.map((opp, index) => ({
      opportunity: opp,
      priority: scored.length - index, // Higher score = higher priority
    }));
  }

  /**
   * Batch score and filter opportunities
   */
  async processOpportunities(
    opportunities: ArbitrageOpportunity[],
    maxAge: number = 3,
    topN?: number
  ): Promise<ArbitrageOpportunity[]> {
    // Score opportunities
    let processed = await this.scoreOpportunities(opportunities);

    // Filter out stale opportunities
    processed = this.filterStaleOpportunities(processed, maxAge);

    // Get top N if specified
    if (topN) {
      processed = this.getTopOpportunities(processed, topN);
    }

    return processed;
  }

  /**
   * Calculate expected profit decay over time
   */
  calculateProfitDecay(
    opportunity: ArbitrageOpportunity,
    timeSeconds: number
  ): { remainingProfit: number; decayPercent: number } {
    const initialProfit = opportunity.expectedProfitUSD;
    const decayFactor = Math.exp(-this.lambda * timeSeconds);
    const remainingProfit = initialProfit * decayFactor;
    const decayPercent = (1 - decayFactor) * 100;

    return {
      remainingProfit,
      decayPercent,
    };
  }

  /**
   * Get optimal execution window for an opportunity
   */
  getOptimalExecutionWindow(
    opportunity: ArbitrageOpportunity,
    minProfitPercent: number = 50
  ): { start: number; end: number; duration: number } {
    const initialProfit = opportunity.expectedProfitUSD;
    const minProfit = initialProfit * (minProfitPercent / 100);

    // Find time when profit decays to minimum acceptable
    const decayFactor = minProfit / initialProfit;
    const timeToMin = -Math.log(decayFactor) / this.lambda;

    return {
      start: opportunity.timestamp,
      end: opportunity.timestamp + timeToMin * 1000,
      duration: timeToMin * 1000,
    };
  }

  /**
   * Compare two opportunities and return the better one based on time decay
   */
  compareOpportunities(
    opp1: ArbitrageOpportunity,
    opp2: ArbitrageOpportunity
  ): ArbitrageOpportunity {
    const score1 = this.calculateTimeDecayScore(opp1);
    const score2 = this.calculateTimeDecayScore(opp2);

    return score1 >= score2 ? opp1 : opp2;
  }

  /**
   * Group opportunities by freshness tiers
   */
  groupByFreshness(
    opportunities: ArbitrageOpportunity[]
  ): Map<string, ArbitrageOpportunity[]> {
    const groups = new Map<string, ArbitrageOpportunity[]>();

    for (const opp of opportunities) {
      const freshness = this.calculateFreshness(opp);
      let tier: string;

      if (freshness >= 0.8) {
        tier = 'fresh';
      } else if (freshness >= 0.5) {
        tier = 'moderate';
      } else if (freshness >= 0.2) {
        tier = 'aging';
      } else {
        tier = 'stale';
      }

      if (!groups.has(tier)) {
        groups.set(tier, []);
      }
      groups.get(tier)!.push(opp);
    }

    return groups;
  }

  /**
   * Update opportunity scores with current block information
   */
  updateScores(opportunities: ArbitrageOpportunity[]): ArbitrageOpportunity[] {
    return opportunities.map(opp => ({
      ...opp,
      score: this.calculateTimeDecayScore(opp),
      freshness: this.calculateFreshness(opp),
    }));
  }
}