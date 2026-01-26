import { ethers } from 'ethers';
import { ArbitrageOpportunity, PoolState, Token } from '../types';
import { StateSnapshotManager } from '../dex/stateSnapshot';
import { PoolDiscovery } from '../pools/discovery';
import {
  MultiHopArbitrageStrategy,
  FeeTierArbitrageStrategy,
  LiquidityFragmentationStrategy,
  StableVolatileArbitrageStrategy,
} from '../strategies';
import { FlashLoanOptimizer } from '../strategies/flashLoanOptimizer';
import { GasConvexityFilter } from '../strategies/gasConvexityFilter';
import { TimeDecayScoring } from '../strategies/timeDecayScoring';
import { TOKENS, isProfitReasonable } from '../config/constants';
import type { Pool } from '../pools/types';

/**
 * Opportunity Finder
 * 
 * Coordinates all arbitrage strategies to find profitable opportunities.
 * This is the main entry point for opportunity discovery.
 * 
 * Enhanced with pool discovery system for real-time pool state management.
 */
export class OpportunityFinder {
  private provider: ethers.JsonRpcProvider;
  private stateSnapshotManager: StateSnapshotManager;
  private poolDiscovery: PoolDiscovery;
  private skipPoolDiscovery: boolean;
  
  // Strategies
  private multiHopStrategy: MultiHopArbitrageStrategy;
  private feeTierStrategy: FeeTierArbitrageStrategy;
  private liquidityFragmentationStrategy: LiquidityFragmentationStrategy;
  private stableVolatileStrategy: StableVolatileArbitrageStrategy;
  
  // Filters and optimizers
  private flashLoanOptimizer: FlashLoanOptimizer;
  private gasConvexityFilter: GasConvexityFilter;
  private timeDecayScoring: TimeDecayScoring;

  private isInitialized: boolean = false;

  constructor(
    provider: ethers.JsonRpcProvider, 
    baseToken?: string,
    options?: {
      skipPoolDiscovery?: boolean;
      dataDir?: string;
    }
  ) {
    this.provider = provider;
    this.stateSnapshotManager = new StateSnapshotManager(provider);
    this.poolDiscovery = new PoolDiscovery(provider, baseToken, options?.dataDir);
    this.skipPoolDiscovery = options?.skipPoolDiscovery || false;

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
   * Initialize the opportunity finder with pool discovery
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    console.log('Initializing OpportunityFinder...\n');
    await this.poolDiscovery.initialize();
    
    // Skip pool discovery if flag is set
    if (this.skipPoolDiscovery) {
      console.log('Skipping automatic pool discovery (using existing registry)\n');
    } else {
      // Check if registry has pools, if not discover them
      const registry = this.poolDiscovery.getRegistry();
      if (registry.getAllPools().length === 0) {
        console.log('Registry is empty, discovering pools from all DEXs...\n');
        await this.poolDiscovery.discoverAllPools();
      } else {
        console.log(`Using existing registry with ${registry.getAllPools().length} pools\n`);
      }
    }
    
    this.isInitialized = true;
    console.log('OpportunityFinder initialized successfully!\n');
  }

  /**
   * Find all arbitrage opportunities in current block
   */
  async findOpportunities(
    baseTokenSymbol: string = 'WETH',
    loanAmount: bigint = BigInt('10000000000000000000'), // 10 ETH
    refreshPools: boolean = false
  ): Promise<ArbitrageOpportunity[]> {
    console.log(`\n=== Finding Arbitrage Opportunities ===`);
    console.log(`Base Token: ${baseTokenSymbol}`);
    console.log(`Loan Amount: ${ethers.formatEther(loanAmount)} ETH`);
    console.log(`Refresh Pools: ${refreshPools}`);

    // Ensure initialization
    if (!this.isInitialized) {
      await this.initialize();
    }

    const baseToken = this.getBaseToken(baseTokenSymbol);
    const currentBlock = await this.provider.getBlockNumber();

    // Refresh pools if requested
    if (refreshPools) {
      console.log('\nRefreshing pool states...');
      await this.poolDiscovery.discoverAllPools(true); // Pass true for merge mode
    }

    // Build block snapshot using pool discovery
    console.log('\nBuilding block snapshot from pool registry...');
    const snapshot = await this.buildSnapshotFromPoolRegistry(currentBlock);
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

    // Strategy 4: Stable-volatile arbitrage
    console.log('\n[Strategy 4] Running Stable-Volatile Arbitrage...');
    const stableVolatileOpps = await this.stableVolatileStrategy.findOpportunities(
      snapshot.poolStates,
      baseToken,
      loanAmount
    );
    console.log(`Found ${stableVolatileOpps.length} stable-volatile opportunities`);
    allOpportunities.push(...stableVolatileOpps);

    console.log(`\n[Validation] Running profit reasonableness checks...`);

    // Process opportunities
    const uniqueOpps = this.removeDuplicateOpportunities(allOpportunities);
    
    // Filter out unrealistic profit opportunities
    const profitValidatedOpps = uniqueOpps.filter(opp => {
      const isReasonable = isProfitReasonable(opp.loanAmount, opp.netProfit);
      if (!isReasonable) {
        console.log(`  ⚠️  Filtered out unrealistic opportunity: ${opp.id}`);
        console.log(`     Loan: ${ethers.formatEther(opp.loanAmount)} ETH`);
        console.log(`     Profit: ${ethers.formatEther(opp.netProfit)} ETH (${(Number(opp.netProfit) / Number(opp.loanAmount) * 100).toFixed(2)}%)`);
      }
      return isReasonable;
    });
    
    console.log(`  ✅ Profit validation: ${profitValidatedOpps.length}/${uniqueOpps.length} opportunities passed`);
    
    const optimizedOpps = await this.flashLoanOptimizer.batchOptimizeOpportunities(profitValidatedOpps);
    const gasFilteredOpps = await this.gasConvexityFilter.filterOpportunities(optimizedOpps);
    const mevFilteredOpps = this.gasConvexityFilter.filterMEVBait(gasFilteredOpps);
    const scoredOpps = await this.timeDecayScoring.scoreOpportunities(mevFilteredOpps);

    scoredOpps.sort((a, b) => b.score - a.score);

    return scoredOpps;
  }

  /**
   * Build snapshot from pool registry
   */
  private async buildSnapshotFromPoolRegistry(blockNumber: number) {
    const registry = this.poolDiscovery.getRegistry();
    const allPools = registry.getAllPools();
    
    const poolStates = new Map<string, PoolState>();

    const versionMap: Record<string, 'v2' | 'v3' | 'v4' | 'curve'> = {
      'V2': 'v2',
      'V3': 'v3',
      'V4': 'v4',
      'Curve': 'curve',
    };

    for (const pool of allPools) {
      try {
        // Skip pools without required state data (check both uppercase and lowercase)
        if ((pool.dexVersion === 'V3' || pool.dexVersion === 'v3') && (!pool.sqrtPriceX96 || !pool.liquidity)) {
          console.log(`Skipping V3 pool ${pool.address} - missing sqrtPriceX96 or liquidity`);
          continue;
        }
        
        if ((pool.dexVersion === 'V2' || pool.dexVersion === 'v2') && (!pool.reserve0 || !pool.reserve1)) {
          console.log(`Skipping V2 pool ${pool.address} - missing reserves`);
          continue;
        }
        
        // Convert Pool to PoolState
        const poolState: PoolState = {
          address: pool.address,
          dex: pool.dex,
          token0: pool.token0,
          token1: pool.token1,
          reserve0: pool.reserve0,
          reserve1: pool.reserve1,
          fee: pool.fee || 0,
          sqrtPriceX96: pool.sqrtPriceX96,
          tick: pool.tick || 0,
          liquidity: pool.liquidity,
          version: versionMap[pool.dexVersion] || 'v3',
        };
        
        poolStates.set(pool.address, poolState);
      } catch (error) {
        console.error(`Error converting pool ${pool.address}:`, error);
      }
    }

    return {
      blockNumber,
      poolStates,
      timestamp: Date.now(),
    };
  }

  /**
   * Find opportunities at a specific block (for backtesting)
   */
  async findOpportunitiesAtBlock(
    blockNumber: number,
    baseTokenSymbol: string = 'WETH',
    loanAmount: bigint = BigInt('10000000000000000000')
  ): Promise<ArbitrageOpportunity[]> {
    console.log(`\n=== Finding Opportunities at Block ${blockNumber} ===`);

    // Build block snapshot at specific block
    const snapshot = await this.stateSnapshotManager.buildBlockSnapshot(blockNumber);
    console.log(`Snapshot: ${snapshot.poolStates.size} pools captured`);

    const baseToken = this.getBaseToken(baseTokenSymbol);
    const allOpportunities: ArbitrageOpportunity[] = [];

    // Run all strategies
    for (const strategy of [
      this.multiHopStrategy,
      this.feeTierStrategy,
      this.liquidityFragmentationStrategy,
      this.stableVolatileStrategy,
    ]) {
      try {
        const opps = await strategy.findOpportunities(
          snapshot.poolStates,
          baseToken,
          loanAmount
        );
        allOpportunities.push(...opps);
      } catch (error) {
        console.error(`Error in ${strategy.getName()}:`, error);
      }
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

  /**
   * Get pool discovery instance
   */
  getPoolDiscovery(): PoolDiscovery {
    return this.poolDiscovery;
  }
}