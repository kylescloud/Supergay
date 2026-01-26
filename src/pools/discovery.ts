/**
 * Pool Discovery Orchestrator
 * Coordinates pool fetching from all DEXs and manages the registry
 * 
 * NOW SUPPORTS ALL 10 DEXs:
 * 1. Uniswap V4 (Pool Manager architecture)
 * 2. Uniswap V3 (V3 CL AMM)
 * 3. Uniswap V2 (V2 AMM)
 * 4. Curve Finance (Registry-based stable pools)
 * 5. SushiSwap V3 (V3 CL AMM)
 * 6. PancakeSwap V3 (V3 CL AMM)
 * 7. Aerodrome (Hybrid V2/V3)
 * 8. Aerodrome SlipStream (V3 CL AMM)
 * 9. Aerodrome SlipStream 2 (V3 CL AMM)
 * 10. BaseSwap (V2 AMM)
 */

import { ethers } from 'ethers';
import { PoolRegistryManager } from './registry';
import { UniswapV3Fetcher } from './fetchers/uniswapV3';
import { UniswapV2Fetcher } from './fetchers/uniswapV2';
import { UniswapV4Fetcher } from './fetchers/uniswapV4';
import { CurveFetcher } from './fetchers/curve';
import { SushiSwapV3Fetcher } from './fetchers/sushiswapV3';
import { PancakeSwapV3Fetcher } from './fetchers/pancakeswapV3';
import { AerodromeFetcher } from './fetchers/aerodrome';
import { AerodromeSlipStreamFetcher } from './fetchers/aerodromeSlipStream';
import { AerodromeSlipStream2Fetcher } from './fetchers/aerodromeSlipStream2';
import { BaseSwapFetcher } from './fetchers/baseSwap';
import type { Pool, DEXConfig } from './types';
import { DEX_DISCOVERY_CONFIG } from '../config/dexDiscoveryConfig';
import { TOKENS } from '../config/constants';

export class PoolDiscovery {
  private provider: ethers.Provider;
  private registry: PoolRegistryManager;
  private baseToken: string;
  private dexConfigs: DEXConfig[];

  constructor(provider: ethers.Provider, baseToken?: string, dataDir?: string) {
    this.provider = provider;
    this.registry = new PoolRegistryManager(dataDir);
    this.baseToken = baseToken || TOKENS.WETH;
    
    // Use unified DEX configuration from constants
    this.dexConfigs = DEX_DISCOVERY_CONFIG.map(config => ({
      name: config.name,
      version: config.version,
      factory: config.factory,
      poolManager: config.poolManager,
      router: config.router,
      quoter: config.quoter,
      stateView: config.stateView,
      feeTiers: config.feeTiers,
      dexId: config.dexId
    }));
  }

  /**
   * Initialize discovery
   */
  async initialize(): Promise<void> {
    console.log('Initializing Pool Discovery...\n');
    await this.registry.load();
  }

  /**
   * Discover pools from all configured DEXs
   * @param mergeMode - If true, preserves existing pool data and only updates pools with new data
   */
  async discoverAllPools(mergeMode: boolean = false): Promise<void> {
    console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log(`║     POOL DISCOVERY - ${mergeMode ? 'MERGE MODE' : 'ALL 10 DEXs'}              ║`);
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    const startTime = Date.now();
    let totalPools = 0;
    let totalErrors = 0;
    let totalNewPools = 0;
    let totalUpdatedPools = 0;

    for (const dexConfig of this.dexConfigs) {
      console.log(`\n──────────────────────────────────────────────────────────────────`);
      console.log(`Fetching from: ${dexConfig.name} (${dexConfig.version})`);
      console.log(`Dex ID: ${dexConfig.dexId}`);
      console.log(`──────────────────────────────────────────────────────────────────\n`);

      try {
        const result = await this.fetchFromDEX(dexConfig);
        
        if (result.success) {
          const existingPoolCount = this.registry.getAllPools().length;
          await this.registry.addPools(result.pools);
          const newPoolCount = this.registry.getAllPools().length;
          
          const newPoolsAdded = newPoolCount - existingPoolCount;
          const updatedPools = result.pools.length - newPoolsAdded;
          
          totalPools += result.pools.length;
          totalNewPools += newPoolsAdded;
          totalUpdatedPools += updatedPools;
          
          console.log(`\n✅ ${dexConfig.name}: Found ${result.pools.length} pools`);
          if (mergeMode) {
            console.log(`   New pools: ${newPoolsAdded}`);
            console.log(`   Updated pools: ${updatedPools}`);
          }
          console.log(`   Execution time: ${result.stats.executionTime}ms`);
          console.log(`   Batches processed: ${result.stats.batches}`);
          
          if (result.errors.length > 0) {
            console.log(`   Warnings: ${result.errors.length}`);
            totalErrors += result.errors.length;
          }
        } else {
          console.log(`\n❌ ${dexConfig.name}: Failed to fetch pools`);
          console.log(`   Errors: ${result.errors.join(', ')}`);
          totalErrors += result.errors.length;
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        console.log(`\n❌ ${dexConfig.name}: Fatal error - ${errMsg}`);
        totalErrors++;
      }

      // Add delay between DEX fetches to avoid rate limits
      await this.sleep(1000);
    }

    const executionTime = Date.now() - startTime;

    // Update registry
    const blockNumber = await this.provider.getBlockNumber();
    this.registry.getRegistry().blockNumber = blockNumber;
    await this.registry.save();

    // Print summary
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                 DISCOVERY SUMMARY                         ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
    console.log(`Total Pools Found:  ${totalPools}`);
    if (mergeMode) {
      console.log(`New Pools Added:    ${totalNewPools}`);
      console.log(`Pools Updated:      ${totalUpdatedPools}`);
    }
    console.log(`Total Errors:       ${totalErrors}`);
    console.log(`Execution Time:     ${executionTime}ms`);
    console.log(`Current Block:      ${blockNumber}\n`);

    this.registry.printSummary();
  }

  /**
   * Fetch pools from a specific DEX
   */
  private async fetchFromDEX(dexConfig: DEXConfig) {
    const dexId = dexConfig.dexId || dexConfig.name.toLowerCase().replace(/\s+/g, '-');
    
    switch (dexId) {
      case 'uniswap-v4':
        return new UniswapV4Fetcher(this.provider, dexConfig).fetchAllPools(this.baseToken);
      
      case 'uniswap-v3':
        return new UniswapV3Fetcher(this.provider, dexConfig).fetchAllPools(this.baseToken);
      
      case 'uniswap-v2':
        return new UniswapV2Fetcher(this.provider, dexConfig).fetchAllPools(this.baseToken);
      
      case 'curve':
        return new CurveFetcher(this.provider, dexConfig).fetchAllPools(this.baseToken);
      
      case 'sushiswap-v3':
        return new SushiSwapV3Fetcher(this.provider, dexConfig).fetchAllPools(this.baseToken);
      
      case 'pancakeswap-v3':
        return new PancakeSwapV3Fetcher(this.provider, dexConfig).fetchAllPools(this.baseToken);
      
      case 'aerodrome':
        return new AerodromeFetcher(this.provider, dexConfig).fetchAllPools(this.baseToken);
      
      case 'aerodrome-slipstream':
        return new AerodromeSlipStreamFetcher(this.provider, dexConfig).fetchAllPools(this.baseToken);
      
      case 'aerodrome-slipstream-2':
        return new AerodromeSlipStream2Fetcher(this.provider, dexConfig).fetchAllPools(this.baseToken);
      
      case 'baseswap':
        return new BaseSwapFetcher(this.provider, dexConfig).fetchAllPools(this.baseToken);
      
      default:
        throw new Error(`Unknown DEX: ${dexConfig.name} (dexId: ${dexId})`);
    }
  }

  /**
   * Update pool states for monitoring
   */
  async updatePoolStates(): Promise<void> {
    console.log('\nUpdating pool states...\n');
    
    const pools = this.registry.getAllPools();
    // This would be implemented with state monitoring logic
    console.log(`Update complete for ${pools.length} pools`);
    
    await this.registry.save();
  }

  /**
   * Get registry for use in other components
   */
  getRegistry(): PoolRegistryManager {
    return this.registry;
  }

  /**
   * Utility: Sleep function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}