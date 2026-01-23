/**
 * Pool Discovery Orchestrator
 * Coordinates pool fetching from all DEXs and manages the registry
 */

import { ethers } from 'ethers';
import { PoolRegistryManager } from './registry';
import { UniswapV3Fetcher } from './fetchers/uniswapV3';
import { UniswapV2Fetcher } from './fetchers/uniswapV2';
import { CurveFetcher } from './fetchers/curve';
import { SushiSwapV3Fetcher } from './fetchers/sushiswapV3';
import { PancakeSwapV3Fetcher } from './fetchers/pancakeswapV3';
import { AerodromeFetcher } from './fetchers/aerodrome';
import type { Pool, DEXConfig } from './types';
import { TOKENS } from '../config/constants';

// DEX Configurations for Base
const DEX_CONFIGS: DEXConfig[] = [
  {
    name: 'Uniswap V3',
    version: 'V3',
    factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
  },
  {
    name: 'Uniswap V2',
    version: 'V2',
    factory: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6',
  },
  {
    name: 'Curve Finance',
    version: 'V2',
    factory: '0x98EE851a8cE4887Aa5F3f8dDc0fC521D3F5610d8',
  },
  {
    name: 'SushiSwap',
    version: 'V3',
    factory: '0x1af7C5dBc1a364952E2945A6bD9024C4C7F48F89',
  },
  {
    name: 'PancakeSwap',
    version: 'V3',
    factory: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
  },
  {
    name: 'Aerodrome',
    version: 'V2/V3',
    factory: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da',
  },
];

export class PoolDiscovery {
  private provider: ethers.Provider;
  private registry: PoolRegistryManager;
  private baseToken: string;

  constructor(provider: ethers.Provider, baseToken?: string) {
    this.provider = provider;
    this.registry = new PoolRegistryManager();
    this.baseToken = baseToken || TOKENS.WETH;
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
   */
  async discoverAllPools(): Promise<void> {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     POOL DISCOVERY - FETCHING FROM ALL DEXs              ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    const startTime = Date.now();
    let totalPools = 0;
    let totalErrors = 0;

    for (const dexConfig of DEX_CONFIGS) {
      console.log(`\n═════════════════════════════════════════════════════════════`);
      console.log(`Fetching from: ${dexConfig.name} ${dexConfig.version}`);
      console.log(`═════════════════════════════════════════════════════════════\n`);

      try {
        const result = await this.fetchFromDEX(dexConfig);
        
        if (result.success) {
          await this.registry.addPools(result.pools);
          totalPools += result.pools.length;
          
          console.log(`\n✅ ${dexConfig.name}: Found ${result.pools.length} pools`);
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
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                 DISCOVERY SUMMARY                         ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    console.log(`Total Pools Found:  ${totalPools}`);
    console.log(`Total Errors:       ${totalErrors}`);
    console.log(`Execution Time:     ${executionTime}ms`);
    console.log(`Current Block:      ${blockNumber}\n`);

    this.registry.printSummary();
  }

  /**
   * Fetch pools from a specific DEX
   */
  private async fetchFromDEX(dexConfig: DEXConfig) {
    switch (dexConfig.name) {
      case 'Uniswap V3':
        return new UniswapV3Fetcher(this.provider, dexConfig).fetchAllPools(this.baseToken);
      
      case 'Uniswap V2':
        return new UniswapV2Fetcher(this.provider, dexConfig).fetchAllPools(this.baseToken);
      
      case 'Curve Finance':
        return new CurveFetcher(this.provider, dexConfig).fetchAllPools(this.baseToken);
      
      case 'SushiSwap':
        return new SushiSwapV3Fetcher(this.provider, dexConfig).fetchAllPools(this.baseToken);
      
      case 'PancakeSwap':
        return new PancakeSwapV3Fetcher(this.provider, dexConfig).fetchAllPools(this.baseToken);
      
      case 'Aerodrome':
        return new AerodromeFetcher(this.provider, dexConfig).fetchAllPools(this.baseToken);
      
      default:
        throw new Error(`Unknown DEX: ${dexConfig.name}`);
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