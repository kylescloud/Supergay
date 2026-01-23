/**
 * Curve Pool Fetcher
 * Fetches all Curve pools from Curve Factory using multicall
 */

import { ethers } from 'ethers';
import { Multicall } from '../multicall';
import type { Pool, DEXConfig, PoolFetchResult, FetchStats } from '../types';

// Curve Factory ABI (simplified interface)
const CURVE_FACTORY_ABI = [
  'event PoolAdded(address indexed pool, address indexed token0, address indexed token1, uint256)',
  'function pool_count() external view returns (uint256)',
  'function pool_list(uint256) external view returns (address)',
];

// Curve Pool ABI (simplified interface for stableswap pools)
const CURVE_POOL_ABI = [
  'function coins(uint256) external view returns (address)',
  'function balances(uint256) external view returns (uint256)',
  'function get_balances() external view returns (uint256[2])',
  'function A() external view returns (uint256)',
  'function fee() external view returns (uint256)',
];

// ERC20 ABI
const ERC20_ABI = [
  'function symbol() external view returns (string)',
  'function decimals() external view returns (uint8)',
];

export class CurveFetcher {
  private provider: ethers.Provider;
  private multicall: Multicall;
  private factory: ethers.Contract;
  private config: DEXConfig;

  constructor(provider: ethers.Provider, config: DEXConfig) {
    this.provider = provider;
    this.multicall = new Multicall(provider);
    this.config = config;
    this.factory = new ethers.Contract(config.factory, CURVE_FACTORY_ABI, provider);
  }

  /**
   * Fetch all Curve pools from factory
   */
  async fetchAllPools(baseToken?: string): Promise<PoolFetchResult> {
    const startTime = Date.now();
    const stats: FetchStats = {
      totalRequested: 0,
      successful: 0,
      failed: 0,
      executionTime: 0,
      batches: 0,
      rpcCalls: 0
    };

    const pools: Pool[] = [];
    const errors: string[] = [];

    try {
      console.log(`Fetching Curve pools from factory: ${this.config.factory}`);

      // Get total number of pools
      let poolCount: bigint;
      try {
        poolCount = await this.factory.pool_count();
        console.log(`Total pools: ${poolCount.toString()}`);
      } catch (error) {
        // Some Curve factories might not have pool_count, try events
        console.log('pool_count not available, trying events...');
        return this.fetchPoolsFromEvents(baseToken, startTime, stats);
      }

      stats.totalRequested = Number(poolCount);

      if (poolCount === 0n) {
        return {
          success: true,
          pools: [],
          errors: ['No pools found'],
          stats
        };
      }

      // Fetch pool addresses
      const poolAddresses: string[] = [];
      const batchSize = 500;

      for (let i = 0n; i < poolCount; i += BigInt(batchSize)) {
        const batch = [];
        for (let j = 0n; j < BigInt(batchSize) && (i + j) < poolCount; j++) {
          batch.push(this.factory.pool_list(i + j));
        }
        const addresses = await Promise.all(batch);
        poolAddresses.push(...addresses.map(a => a.toLowerCase()));
        console.log(`Fetched ${addresses.length} pool addresses (${poolAddresses.length}/${poolCount})`);
      }

      console.log(`Fetching state for ${poolAddresses.length} pools...`);

      // Fetch pool states in batches
      for (let i = 0; i < poolAddresses.length; i += batchSize) {
        const batch = poolAddresses.slice(i, i + batchSize);
        stats.batches++;

        try {
          const batchPools = await this.fetchPoolStates(batch);
          pools.push(...batchPools);
          stats.successful += batch.length;
          
          console.log(`Processed batch ${Math.floor(i / batchSize) + 1}: ${batchPools.length} pools`);
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : 'Unknown error';
          errors.push(`Batch ${Math.floor(i / batchSize) + 1} failed: ${errMsg}`);
          stats.failed += batch.length;
          console.error(`Error in batch ${Math.floor(i / batchSize) + 1}:`, errMsg);
        }
      }

      // Filter pools by base token if specified
      let filteredPools = pools;
      if (baseToken) {
        filteredPools = pools.filter(pool => 
          pool.token0.address.toLowerCase() === baseToken.toLowerCase() ||
          pool.token1.address.toLowerCase() === baseToken.toLowerCase()
        );
        console.log(`Filtered to ${filteredPools.length} pools with base token ${baseToken}`);
      }

      stats.executionTime = Date.now() - startTime;

      console.log(`Curve fetch complete: ${filteredPools.length} pools (${stats.executionTime}ms)`);

      return {
        success: true,
        pools: filteredPools,
        errors,
        stats
      };

    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Fatal error: ${errMsg}`);
      stats.executionTime = Date.now() - startTime;

      console.error('Fatal error in CurveFetcher:', error);

      return {
        success: false,
        pools,
        errors,
        stats
      };
    }
  }

  /**
   * Fetch pools from PoolAdded events as fallback
   */
  private async fetchPoolsFromEvents(
    baseToken: string | undefined,
    startTime: number,
    stats: FetchStats
  ): Promise<PoolFetchResult> {
    const pools: Pool[] = [];
    const errors: string[] = [];

    try {
      const currentBlock = await this.provider.getBlockNumber();
      console.log(`Current block: ${currentBlock}`);

      const poolAddedFilter = this.factory.filters.PoolAdded();
      const events = await this.factory.queryFilter(poolAddedFilter, 0, currentBlock);

      console.log(`Found ${events.length} PoolAdded events`);
      stats.totalRequested = events.length;

      if (events.length === 0) {
        return {
          success: true,
          pools: [],
          errors: ['No PoolAdded events found'],
          stats
        };
      }

      const poolAddresses = events
        .map(event => {
          const args = 'args' in event ? event.args : null;
          return args?.pool;
        })
        .filter((p): p is string => p !== undefined && p !== null);
      console.log(`Fetching state for ${poolAddresses.length} pools...`);

      const batchSize = 500;
      for (let i = 0; i < poolAddresses.length; i += batchSize) {
        const batch = poolAddresses.slice(i, i + batchSize);
        stats.batches++;

        try {
          const batchPools = await this.fetchPoolStates(batch);
          pools.push(...batchPools);
          stats.successful += batch.length;
          
          console.log(`Processed batch ${Math.floor(i / batchSize) + 1}: ${batchPools.length} pools`);
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : 'Unknown error';
          errors.push(`Batch ${Math.floor(i / batchSize) + 1} failed: ${errMsg}`);
          stats.failed += batch.length;
        }
      }

      stats.executionTime = Date.now() - startTime;

      return {
        success: true,
        pools,
        errors,
        stats
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Error fetching from events: ${errMsg}`);
      stats.executionTime = Date.now() - startTime;

      return {
        success: false,
        pools,
        errors,
        stats
      };
    }
  }

  /**
   * Fetch pool states for a batch of pools
   */
  private async fetchPoolStates(poolAddresses: string[]): Promise<Pool[]> {
    if (poolAddresses.length === 0) {
      return [];
    }

    const pools: Pool[] = [];
    const poolInterface = new ethers.Interface(CURVE_POOL_ABI);
    const tokenInterface = new ethers.Interface(ERC20_ABI);

    for (const poolAddress of poolAddresses) {
      try {
        // Get coins (tokens)
        const coin0Call = await this.multicall.aggregate3([{
          target: poolAddress,
          callData: poolInterface.encodeFunctionData('coins', [0])
        }]);
        const coin1Call = await this.multicall.aggregate3([{
          target: poolAddress,
          callData: poolInterface.encodeFunctionData('coins', [1])
        }]);

        if (!coin0Call[0].success || !coin1Call[0].success) {
          continue;
        }

        const token0Address = Multicall.decodeResult(coin0Call[0].data, ['address'])[0];
        const token1Address = Multicall.decodeResult(coin1Call[0].data, ['address'])[0];

        // Get balances
        let balances: bigint[];
        try {
          const balancesCall = await this.multicall.aggregate3([{
            target: poolAddress,
            callData: poolInterface.encodeFunctionData('get_balances')
          }]);
          if (balancesCall[0].success) {
            balances = Multicall.decodeResult(balancesCall[0].data, ['uint256', 'uint256']);
          } else {
            // Fallback to individual balance calls
            const balance0Call = await this.multicall.aggregate3([{
              target: poolAddress,
              callData: poolInterface.encodeFunctionData('balances', [0])
            }]);
            const balance1Call = await this.multicall.aggregate3([{
              target: poolAddress,
              callData: poolInterface.encodeFunctionData('balances', [1])
            }]);
            balances = [
              Multicall.decodeResult(balance0Call[0].data, ['uint256'])[0],
              Multicall.decodeResult(balance1Call[0].data, ['uint256'])[0]
            ];
          }
        } catch (error) {
          console.error(`Error fetching balances for ${poolAddress}:`, error);
          continue;
        }

        // Get token info
        const token0SymbolCall = await this.multicall.aggregate3([{
          target: token0Address,
          callData: tokenInterface.encodeFunctionData('symbol')
        }]);
        const token0DecimalsCall = await this.multicall.aggregate3([{
          target: token0Address,
          callData: tokenInterface.encodeFunctionData('decimals')
        }]);
        const token1SymbolCall = await this.multicall.aggregate3([{
          target: token1Address,
          callData: tokenInterface.encodeFunctionData('symbol')
        }]);
        const token1DecimalsCall = await this.multicall.aggregate3([{
          target: token1Address,
          callData: tokenInterface.encodeFunctionData('decimals')
        }]);

        const token0Symbol = Multicall.decodeResult(token0SymbolCall[0].data, ['string'])[0];
        const token0Decimals = Multicall.decodeResult(token0DecimalsCall[0].data, ['uint8'])[0];
        const token1Symbol = Multicall.decodeResult(token1SymbolCall[0].data, ['string'])[0];
        const token1Decimals = Multicall.decodeResult(token1DecimalsCall[0].data, ['uint8'])[0];

        const pool: Pool = {
          address: poolAddress,
          dex: this.config.name,
          dexVersion: this.config.version,
          token0: {
            address: token0Address,
            symbol: token0Symbol,
            name: token0Symbol,
            decimals: Number(token0Decimals)
          },
          token1: {
            address: token1Address,
            symbol: token1Symbol,
            name: token1Symbol,
            decimals: Number(token1Decimals)
          },
          reserve0: balances[0],
          reserve1: balances[1],
          blockNumber: await this.provider.getBlockNumber(),
          lastUpdated: Date.now(),
          isActive: balances[0] > 0n || balances[1] > 0n
        };

        pools.push(pool);
      } catch (error) {
        console.error(`Error processing pool ${poolAddress}:`, error);
      }
    }

    return pools;
  }
}