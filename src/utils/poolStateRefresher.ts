import { ethers } from 'ethers';
import { PoolState } from '../types';
import { PoolRegistryManager } from '../pools/registry';
import { TOKENS, TOKEN_METADATA } from '../config/constants';

// V2 Pool ABI (minimal)
const V2_POOL_ABI = [
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)'
];

// V3 Pool ABI (minimal)
const V3_POOL_ABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() external view returns (uint128)'
];

interface PoolStateRefreshConfig {
  refreshInterval: number; // in milliseconds
  maxRetries: number;
  retryDelay: number; // in milliseconds
  enableHealthChecks: boolean;
  healthCheckInterval: number; // in milliseconds
}

interface RefreshStats {
  lastRefreshTime: number;
  poolsUpdated: number;
  poolsFailed: number;
  averageRefreshTime: number;
  totalRefreshes: number;
}

/**
 * Pool State Refresher
 * 
 * Automatically refreshes pool states at regular intervals.
 * Handles errors gracefully and provides health monitoring.
 */
export class PoolStateRefresher {
  private provider: ethers.JsonRpcProvider;
  private registry: PoolRegistryManager;
  private config: PoolStateRefreshConfig;
  private refreshIntervalId: NodeJS.Timeout | null = null;
  private healthCheckIntervalId: NodeJS.Timeout | null = null;
  private stats: RefreshStats;

  constructor(
    provider: ethers.JsonRpcProvider,
    registry: PoolRegistryManager,
    config?: Partial<PoolStateRefreshConfig>
  ) {
    this.provider = provider;
    this.registry = registry;
    this.config = {
      refreshInterval: 30000, // 30 seconds default
      maxRetries: 3,
      retryDelay: 1000, // 1 second
      enableHealthChecks: true,
      healthCheckInterval: 60000, // 1 minute
      ...config
    };

    this.stats = {
      lastRefreshTime: 0,
      poolsUpdated: 0,
      poolsFailed: 0,
      averageRefreshTime: 0,
      totalRefreshes: 0
    };
  }

  /**
   * Start automatic pool state refresh
   */
  start(): void {
    if (this.refreshIntervalId) {
      console.log('Pool state refresher is already running');
      return;
    }

    console.log(`🔄 Starting pool state refresher (interval: ${this.config.refreshInterval}ms)`);
    
    // Initial refresh
    this.refreshAllPools();

    // Schedule periodic refreshes
    this.refreshIntervalId = setInterval(() => {
      this.refreshAllPools();
    }, this.config.refreshInterval);

    // Start health checks if enabled
    if (this.config.enableHealthChecks) {
      this.startHealthChecks();
    }
  }

  /**
   * Stop automatic pool state refresh
   */
  stop(): void {
    if (this.refreshIntervalId) {
      clearInterval(this.refreshIntervalId);
      this.refreshIntervalId = null;
      console.log('⏹️ Pool state refresher stopped');
    }

    if (this.healthCheckIntervalId) {
      clearInterval(this.healthCheckIntervalId);
      this.healthCheckIntervalId = null;
    }
  }

  /**
   * Refresh all pools in the registry
   */
  async refreshAllPools(): Promise<void> {
    const startTime = Date.now();
    console.log(`\n🔄 Refreshing pool states at ${new Date().toISOString()}`);

    try {
      const pools = this.registry.getAllPools();
      let updated = 0;
      let failed = 0;

      for (const pool of pools) {
        try {
          await this.refreshPool(pool);
          updated++;
        } catch (error) {
          console.error(`❌ Failed to refresh pool ${pool.address}: ${error}`);
          failed++;
        }
      }

      // Update stats
      const refreshTime = Date.now() - startTime;
      this.stats.lastRefreshTime = startTime;
      this.stats.poolsUpdated = updated;
      this.stats.poolsFailed = failed;
      this.stats.totalRefreshes++;
      this.stats.averageRefreshTime = 
        (this.stats.averageRefreshTime * (this.stats.totalRefreshes - 1) + refreshTime) / 
        this.stats.totalRefreshes;

      console.log(`✅ Refresh complete: ${updated} updated, ${failed} failed (${refreshTime}ms)`);

    } catch (error) {
      console.error(`❌ Pool refresh failed: ${error}`);
    }
  }

  /**
   * Refresh a single pool with retries
   */
  private async refreshPool(pool: any, retryCount: number = 0): Promise<void> {
    try {
      const version = pool.version || pool.dexVersion;
      
      if (version === 'v2') {
        await this.refreshV2Pool(pool);
      } else if (version === 'v3') {
        await this.refreshV3Pool(pool);
      } else if (version === 'v4') {
        await this.refreshV4Pool(pool);
      }

      // Save updated pool to registry
      await this.registry.updatePoolStates([pool]);
    } catch (error) {
      if (retryCount < this.config.maxRetries) {
        console.log(`⚠️ Retrying pool ${pool.address} (attempt ${retryCount + 1}/${this.config.maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
        return this.refreshPool(pool, retryCount + 1);
      }
      throw error;
    }
  }

  /**
   * Refresh V2 pool state
   */
  private async refreshV2Pool(pool: any): Promise<void> {
    const poolContract = new ethers.Contract(pool.address, V2_POOL_ABI, this.provider);
    const reserves = await poolContract.getReserves();
    
    pool.reserve0 = BigInt(reserves[0]);
    pool.reserve1 = BigInt(reserves[1]);
    pool.lastUpdated = Date.now();
  }

  /**
   * Refresh V3 pool state
   */
  private async refreshV3Pool(pool: any): Promise<void> {
    const poolContract = new ethers.Contract(pool.address, V3_POOL_ABI, this.provider);
    const slot0 = await poolContract.slot0();
    const liquidity = await poolContract.liquidity();
    
    pool.sqrtPriceX96 = BigInt(slot0[0]);
    pool.tick = Number(slot0[1]);
    pool.liquidity = BigInt(liquidity);
    pool.lastUpdated = Date.now();
  }

  /**
   * Refresh V4 pool state
   */
  private async refreshV4Pool(pool: PoolState): Promise<void> {
    // V4 pool state refresh requires specialized logic
    // For now, skip V4 pools
    console.log(`⚠️ V4 pool refresh not implemented yet: ${pool.address}`);
  }

  /**
   * Start health checks
   */
  private startHealthChecks(): void {
    this.healthCheckIntervalId = setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckInterval);
  }

  /**
   * Perform health check
   */
  private performHealthCheck(): void {
    console.log('\n🏥 Pool Refresher Health Check:');
    console.log(`  Last refresh: ${new Date(this.stats.lastRefreshTime).toISOString()}`);
    console.log(`  Pools updated: ${this.stats.poolsUpdated}`);
    console.log(`  Pools failed: ${this.stats.poolsFailed}`);
    console.log(`  Average refresh time: ${this.stats.averageRefreshTime.toFixed(2)}ms`);
    console.log(`  Total refreshes: ${this.stats.totalRefreshes}`);

    // Check if refresh is running properly
    const timeSinceLastRefresh = Date.now() - this.stats.lastRefreshTime;
    if (timeSinceLastRefresh > this.config.refreshInterval * 2) {
      console.warn(`⚠️ Warning: Last refresh was ${timeSinceLastRefresh}ms ago (expected < ${this.config.refreshInterval * 2}ms)`);
    }
  }

  /**
   * Get refresh statistics
   */
  getStats(): RefreshStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      lastRefreshTime: 0,
      poolsUpdated: 0,
      poolsFailed: 0,
      averageRefreshTime: 0,
      totalRefreshes: 0
    };
  }

  /**
   * Check if refresher is running
   */
  isRunning(): boolean {
    return this.refreshIntervalId !== null;
  }
}