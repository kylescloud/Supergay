import { ethers } from 'ethers';
import { ArbitrageOpportunity, PoolState, Token } from '../types';
import { StateSnapshotManager } from '../dex/stateSnapshot';
import {
  MultiHopArbitrageStrategy,
  FeeTierArbitrageStrategy,
  LiquidityFragmentationStrategy,
  StableVolatileArbitrageStrategy,
} from '../strategies';
import { FlashLoanOptimizer } from '../strategies/flashLoanOptimizer';
import { GasConvexityFilter } from '../strategies/gasConvexityFilter';
import { TimeDecayScoring } from '../strategies/timeDecayScoring';
import { TOKENS } from '../config/constants';

/**
 * Opportunity Finder
 * 
 * Coordinates all arbitrage strategies to find profitable opportunities.
 * This is the main entry point for opportunity discovery.
 */
export class OpportunityFinder {
  private provider: ethers.JsonRpcProvider;
  private stateSnapshotManager: StateSnapshotManager;
  
  // Strategies
  private multiHopStrategy: MultiHopArbitrageStrategy;
  private feeTierStrategy: FeeTierArbitrageStrategy;
  private liquidityFragmentationStrategy: LiquidityFragmentationStrategy;
  private stableVolatileStrategy: StableVolatileArbitrageStrategy;
  
  // Filters and optimizers
  private flashLoanOptimizer: FlashLoanOptimizer;
  private gasConvexityFilter: GasConvexityFilter;
  private timeDecayScoring: TimeDecayScoring;

  constructor(provider: ethers.JsonRpcProvider) {
    this.provider = provider;
    this.stateSnapshotManager = new StateSnapshotManager(provider);

    // Initialize strategies
    this.multiHopStrategy = new MultiHopArbitrageStrategy(provider, 4, 0.01);
    this.feeTierStrategy = new FeeTierArbitrageStrategy(provider, 0.01);
    this.liquidityFragmentationStrategy = new LiquidityFragmentationStrategy(provider, 0.01);
    this.stableVolatileStrategy = new StableVolatileArbitrageStrategy(provider, 0.01);

    // Initialize filters and optimizers
    this.flashLoanOptimizer = new FlashLoanOptimizer(provider);
    this.gasConvexityFilter = new GasConvexityFilter(provider);
    this.timeDecayScoring = new TimeDecayScoring(provider);
  }

  /**
   * Find all arbitrage opportunities in current block
   */
  async findOpportunities(
    baseTokenSymbol: string = 'WETH',
    loanAmount: bigint = BigInt('10000000000000000000') // 10 ETH
  ): Promise<ArbitrageOpportunity[]> {
    console.log(`\n=== Finding Arbitrage Opportunities ===`);
    console.log(`Base Token: ${baseTokenSymbol}`);
    console.log(`Loan Amount: ${ethers.formatEther(loanAmount)} ETH`);

    const baseToken = this.getBaseToken(baseTokenSymbol);
    const currentBlock = await this.provider.getBlockNumber();

    // Build block snapshot
    console.log('\nBuilding block snapshot...');
    const snapshot = await this.stateSnapshotManager.buildBlockSnapshot(currentBlock);
    console.log(`Snapshot: ${snapshot.poolStates.size} pools captured`);

    // Find opportunities using all strategies
    const allOpportunities: ArbitrageOpportunity[] = [];

    // Strategy 1: Multi-hop cyclic arbitrage
    console.log('\n[Strategy 1] Running Multi-Hop Cyclic Arbitrage...');
    const multiHopOpps = await this.multiHopStrategy.findOpportunities(
      snapshot.poolStates,
      baseToken,
      loanAmount
    );
    console.log(`Found ${multiHopOpps.length} multi-hop opportunities`);
    allOpportunities.push(...multiHopOpps);

    // Strategy 2: Fee-tier mispricing arbitrage
    console.log('\n[Strategy 2] Running Fee-Tier Mispricing Arbitrage...');
    const feeTierOpps = await this.feeTierStrategy.findOpportunities(
      snapshot.poolStates,
      baseToken,
      loanAmount
    );
    console.log(`Found ${feeTierOpps.length} fee-tier opportunities`);
    allOpportunities.push(...feeTierOpps);

    // Strategy 3: Liquidity fragmentation arbitrage
    console.log('\n[Strategy 3] Running Liquidity Fragmentation Arbitrage...');
    const fragmentationOpps = await this.liquidityFragmentationStrategy.findOpportunities(
      snapshot.poolStates,
      baseToken,
      loanAmount
    );
    console.log(`Found ${fragmentationOpps.length} fragmentation opportunities`);
    allOpportunities.push(...fragmentationOpps);

    // Strategy 4: Stable-volatile curve arbitrage
    console.log('\n[Strategy 4] Running Stable-Volatile Curve Arbitrage...');
    const stableVolatileOpps = await this.stableVolatileStrategy.findOpportunities(
      snapshot.poolStates,
      baseToken,
      loanAmount
    );
    console.log(`Found ${stableVolatileOpps.length} stable-volatile opportunities`);
    allOpportunities.push(...stableVolatileOpps);

    // Remove duplicates
    const uniqueOpps = this.removeDuplicateOpportunities(allOpportunities);
    console.log(`\nTotal unique opportunities: ${uniqueOpps.length}`);

    // Optimize flash loan sizes
    console.log('\nOptimizing flash loan sizes...');
    const optimizedOpps = await this.flashLoanOptimizer.batchOptimizeOpportunities(uniqueOpps);
    console.log(`Optimized ${optimizedOpps.length} opportunities`);

    // Filter by gas convexity
    console.log('\nFiltering by gas convexity...');
    const gasFilteredOpps = await this.gasConvexityFilter.filterOpportunities(optimizedOpps);
    console.log(`After gas filter: ${gasFilteredOpps.length} opportunities`);

    // Filter out MEV bait
    console.log('\nFiltering out MEV bait...');
    const mevFilteredOpps = this.gasConvexityFilter.filterMEVBait(gasFilteredOpps);
    console.log(`After MEV filter: ${mevFilteredOpps.length} opportunities`);

    // Score by time decay
    console.log('\nScoring by time decay...');
    const scoredOpps = await this.timeDecayScoring.scoreOpportunities(mevFilteredOpps);
    console.log(`Scored ${scoredOpps.length} opportunities`);

    // Sort by score (descending) and profit (descending)
    scoredOpps.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return b.expectedProfitUSD - a.expectedProfitUSD;
    });

    // Return top opportunities
    const topOpps = scoredOpps.slice(0, 10);
    console.log(`\n=== Top ${topOpps.length} Opportunities ===`);
    for (let i = 0; i < topOpps.length; i++) {
      const opp = topOpps[i];
      console.log(`\n[${i + 1}] ${opp.id}`);
      console.log(`    Profit: $${opp.expectedProfitUSD.toFixed(4)}`);
      console.log(`    Score: ${opp.score.toFixed(4)}`);
      console.log(`    Path: ${opp.path.map(t => t.symbol).join(' → ')}`);
      console.log(`    DEXs: ${opp.dexes.join(' → ')}`);
    }

    return topOpps;
  }

  /**
   * Find opportunities for a specific block (for backtesting)
   */
  async findOpportunitiesAtBlock(
    blockNumber: number,
    baseTokenSymbol: string = 'WETH',
    loanAmount: bigint = BigInt('10000000000000000000')
  ): Promise<ArbitrageOpportunity[]> {
    console.log(`\n=== Finding Opportunities at Block ${blockNumber} ===`);

    const baseToken = this.getBaseToken(baseTokenSymbol);

    // Build snapshot at specific block
    const snapshot = await this.stateSnapshotManager.buildBlockSnapshot(blockNumber);
    console.log(`Snapshot: ${snapshot.poolStates.size} pools captured`);

    // Find opportunities using all strategies (same as above but with block number)
    const allOpportunities: ArbitrageOpportunity[] = [];

    const strategies = [
      this.multiHopStrategy,
      this.feeTierStrategy,
      this.liquidityFragmentationStrategy,
      this.stableVolatileStrategy,
    ];

    for (const strategy of strategies) {
      const opps = await strategy.findOpportunities(
        snapshot.poolStates,
        baseToken,
        loanAmount
      );
      allOpportunities.push(...opps);
    }

    // Process opportunities
    const uniqueOpps = this.removeDuplicateOpportunities(allOpportunities);
    const optimizedOpps = await this.flashLoanOptimizer.batchOptimizeOpportunities(uniqueOpps);
    const gasFilteredOpps = await this.gasConvexityFilter.filterOpportunities(optimizedOpps);
    const mevFilteredOpps = this.gasConvexityFilter.filterMEVBait(gasFilteredOpps);
    const scoredOpps = await this.timeDecayScoring.scoreOpportunities(mevFilteredOpps);

    scoredOpps.sort((a, b) => b.score - a.score);

    return scoredOpps;
  }

  /**
   * Get base token object
   */
  private getBaseToken(symbol: string): Token {
    const tokenMap: Record<string, Token> = {
      WETH: {
        address: TOKENS.WETH,
        symbol: 'WETH',
        decimals: 18,
        name: 'Wrapped Ether',
      },
      USDC: {
        address: TOKENS.USDC,
        symbol: 'USDC',
        decimals: 6,
        name: 'USD Coin',
      },
    };

    const token = tokenMap[symbol];
    if (!token) {
      throw new Error(`Unknown base token: ${symbol}`);
    }

    return token;
  }

  /**
   * Remove duplicate opportunities
   */
  private removeDuplicateOpportunities(
    opportunities: ArbitrageOpportunity[]
  ): ArbitrageOpportunity[] {
    const seen = new Set<string>();
    const unique: ArbitrageOpportunity[] = [];

    for (const opp of opportunities) {
      const key = `${opp.path.map(t => t.symbol).join('-')}-${opp.dexes.join('-')}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(opp);
      }
    }

    return unique;
  }

  /**
   * Validate opportunity before execution
   */
  async validateOpportunity(opportunity: ArbitrageOpportunity): Promise<boolean> {
    // Check if opportunity is still valid
    const currentBlock = await this.provider.getBlockNumber();
    const blockAge = currentBlock - opportunity.blockNumber;

    if (blockAge > 3) {
      console.log('Opportunity is stale');
      return false;
    }

    // Validate with each strategy
    const strategies = [
      this.multiHopStrategy,
      this.feeTierStrategy,
      this.liquidityFragmentationStrategy,
      this.stableVolatileStrategy,
    ];

    for (const strategy of strategies) {
      try {
        const isValid = await strategy.validateOpportunity(opportunity);
        if (!isValid) {
          console.log(`Validation failed for ${strategy.getName()}`);
          return false;
        }
      } catch (error) {
        continue;
      }
    }

    return true;
  }
}