/**
 * Enhanced Pool Discovery with Rate Limiting and Intelligent Retry
 * 
 * Uses the EnhancedRPCManager to handle RPC rate limiting and retries
 * Provides a robust pool discovery system that can handle large-scale operations
 */

import { ethers } from 'ethers';
import type { Pool, DEXConfig, PoolFetchResult } from './types';
import type { Token } from '../types';
import { EnhancedRPCManager } from '../utils/enhancedRpcManager';
import { UniswapV2Fetcher } from './fetchers/uniswapV2';
import { UniswapV3Fetcher } from './fetchers/uniswapV3';
import { UniswapV4Fetcher } from './fetchers/uniswapV4';
import { CurveFetcher } from './fetchers/curve';
import { SushiSwapV3Fetcher } from './fetchers/sushiswapV3';
import { PancakeSwapV3Fetcher } from './fetchers/pancakeswapV3';
import { AerodromeFetcher } from './fetchers/aerodrome';
import { BaseSwapFetcher } from './fetchers/baseSwap';

export class EnhancedPoolDiscovery {
  private rpcManager: EnhancedRPCManager;
  private dexConfigs: Map<string, DEXConfig>;
  private fetchers: Map<string, any>;
  private tokenCache: Map<string, Token> = new Map();

  constructor(
    rpcUrls: string[],
    dexConfigs: DEXConfig[]
  ) {
    // Initialize RPC manager with rate limiting
    this.rpcManager = new EnhancedRPCManager(rpcUrls, {
      maxRetries: 3,
      retryDelay: 1000,
      retryBackoffMultiplier: 2,
      maxRetryDelay: 10000,
      timeout: 15000,
      rateLimitPerSecond: 10,
      rateLimitBurst: 20
    });

    // Initialize DEX configurations
    this.dexConfigs = new Map();
    dexConfigs.forEach(config => {
      this.dexConfigs.set(config.name, config);
    });

    // Initialize fetchers
    this.fetchers = new Map();
  }

  /**
   * Discover pools from all configured DEXs with rate limiting
   */
  async discoverAllPools(options: {
    baseToken?: string;
    batchDelay?: number;
    skipDEXs?: string[];
  } = {}): Promise<{
    success: boolean;
    pools: Pool[];
    errors: string[];
    stats: {
      totalDEXs: number;
      successfulDEXs: number;
      failedDEXs: number;
      totalPools: number;
      totalRPCs: number;
      executionTime: number;
    };
  }> {
    const startTime = Date.now();
    const { baseToken, batchDelay = 200, skipDEXs = [] } = options;

    const allPools: Pool[] = [];
    const allErrors: string[] = [];
    const stats = {
      totalDEXs: this.dexConfigs.size,
      successfulDEXs: 0,
      failedDEXs: 0,
      totalPools: 0,
      totalRPCs: 0,
      executionTime: 0
    };

    console.log(`\n${'='.repeat(80)}`);
    console.log(`Enhanced Pool Discovery - All DEXs`);
    console.log(`${'='.repeat(80)}`);
    console.log(`Total DEXs: ${this.dexConfigs.size}`);
    console.log(`Skipping: ${skipDEXs.join(', ') || 'None'}`);
    console.log(`Base Token: ${baseToken || 'All tokens'}`);
    console.log(`${'='.repeat(80)}\n`);

    // Discover pools from each DEX
    for (const [dexName, config] of this.dexConfigs.entries()) {
      if (skipDEXs.includes(dexName)) {
        console.log(`Skipping ${dexName} (in skip list)`);
        continue;
      }

      console.log(`\n[${dexName}] Starting pool discovery...`);

      try {
        const result = await this.discoverPoolsForDEX(dexName, baseToken);
        
        if (result.success) {
          allPools.push(...result.pools);
          stats.successfulDEXs++;
          stats.totalPools += result.pools.length;
          console.log(`[${dexName}] ✓ Found ${result.pools.length} pools`);
        } else {
          stats.failedDEXs++;
          allErrors.push(...result.errors);
          console.log(`[${dexName}] ✗ Failed: ${result.errors.join(', ')}`);
        }

        // Delay between DEXs to avoid rate limiting
        if (batchDelay > 0) {
          await this.sleep(batchDelay);
        }

      } catch (error) {
        stats.failedDEXs++;
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        allErrors.push(`${dexName}: ${errMsg}`);
        console.error(`[${dexName}] Error: ${errMsg}`);
      }
    }

    // Remove duplicate pools (same address and version)
    const uniquePools = this.removeDuplicatePools(allPools);
    console.log(`\nRemoved ${allPools.length - uniquePools.length} duplicate pools`);

    stats.executionTime = Date.now() - startTime;

    console.log(`\n${'='.repeat(80)}`);
    console.log(`Pool Discovery Complete`);
    console.log(`${'='.repeat(80)}`);
    console.log(`Successful DEXs: ${stats.successfulDEXs}/${stats.totalDEXs}`);
    console.log(`Total Pools: ${uniquePools.length}`);
    console.log(`Execution Time: ${stats.executionTime}ms`);
    console.log(`${'='.repeat(80)}\n`);

    return {
      success: stats.successfulDEXs > 0,
      pools: uniquePools,
      errors: allErrors,
      stats
    };
  }

  /**
   * Discover pools for a specific DEX
   */
  async discoverPoolsForDEX(
    dexName: string,
    baseToken?: string
  ): Promise<PoolFetchResult> {
    const config = this.dexConfigs.get(dexName);
    if (!config) {
      throw new Error(`DEX config not found: ${dexName}`);
    }

    // Get or create fetcher
    const fetcher = this.getFetcher(dexName);
    if (!fetcher) {
      throw new Error(`Fetcher not implemented for: ${dexName}`);
    }

    // Execute fetch with retry logic
    return await this.rpcManager.executeWithRetry(
      async (provider) => {
        // Recreate fetcher with the provider from RPC manager
        const fetcherWithProvider = this.createFetcher(dexName, provider, config);
        return await fetcherWithProvider.fetchAllPools(baseToken);
      },
      {
        maxRetries: 3,
        priority: 0,
        allowPrivateNodes: false // Use public nodes for discovery
      }
    );
  }

  /**
   * Get a fetcher instance for a DEX
   */
  private getFetcher(dexName: string): any {
    return this.fetchers.get(dexName);
  }

  /**
   * Create a fetcher instance with a specific provider
   */
  private createFetcher(
    dexName: string,
    provider: ethers.Provider,
    config: DEXConfig
  ): any {
    switch (dexName) {
      case 'Uniswap V2':
        return new UniswapV2Fetcher(provider, config);
      case 'Uniswap V3':
        return new UniswapV3Fetcher(provider, config);
      case 'Uniswap V4':
        return new UniswapV4Fetcher(provider, config);
      case 'Curve':
        return new CurveFetcher(provider, config);
      case 'SushiSwap V3':
        return new SushiSwapV3Fetcher(provider, config);
      case 'PancakeSwap V3':
        return new PancakeSwapV3Fetcher(provider, config);
      case 'Aerodrome':
        return new AerodromeFetcher(provider, config);
      case 'BaseSwap':
        return new BaseSwapFetcher(provider, config);
      default:
        throw new Error(`Unsupported DEX: ${dexName}`);
    }
  }

  /**
   * Remove duplicate pools based on address
   */
  private removeDuplicatePools(pools: Pool[]): Pool[] {
    const seen = new Set<string>();
    const unique: Pool[] = [];

    for (const pool of pools) {
      const key = `${pool.address}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(pool);
      }
    }

    return unique;
  }

  /**
   * Get RPC manager statistics
   */
  getRPCStatistics() {
    return this.rpcManager.getStatistics();
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}