/**
 * Uniswap V3 Pool Fetcher
 * Fetches all V3 pools from Uniswap V3 Factory using multicall
 */

import { ethers } from 'ethers';
import { Multicall } from '../multicall';
import type { Pool, DEXConfig, PoolFetchResult, FetchStats, TokenInfo } from '../types';

// Uniswap V3 Factory ABI (minimal interface)
const UNISWAP_V3_FACTORY_ABI = [
  'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)',
  'function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)',
];

// Uniswap V3 Pool ABI (minimal interface for state)
const UNISWAP_V3_POOL_ABI = [
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function fee() external view returns (uint24)',
  'function liquidity() external view returns (uint128)',
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
];

// ERC20 ABI for token info
const ERC20_ABI = [
  'function symbol() external view returns (string)',
  'function name() external view returns (string)',
  'function decimals() external view returns (uint8)',
];

export class UniswapV3Fetcher {
  private provider: ethers.Provider;
  private multicall: Multicall;
  private factory: ethers.Contract;
  private config: DEXConfig;

  constructor(provider: ethers.Provider, config: DEXConfig) {
    this.provider = provider;
    this.multicall = new Multicall(provider);
    this.config = config;
    this.factory = new ethers.Contract(config.factory, UNISWAP_V3_FACTORY_ABI, provider);
  }

  /**
   * Fetch all pools by querying PoolCreated events
   * This is the most reliable way to get all pools
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
      console.log(`Fetching Uniswap V3 pools from factory: ${this.config.factory}`);

      // Get current block number
      const currentBlock = await this.provider.getBlockNumber();
      console.log(`Current block: ${currentBlock}`);

      // Fetch PoolCreated events
      const poolCreatedFilter = this.factory.filters.PoolCreated();
      const events = await this.factory.queryFilter(poolCreatedFilter, 0, currentBlock);

      console.log(`Found ${events.length} PoolCreated events`);

      stats.totalRequested = events.length;

      if (events.length === 0) {
        return {
          success: true,
          pools: [],
          errors: ['No PoolCreated events found'],
          stats
        };
      }

      // Extract pool addresses from events
      const poolAddresses = events.map(event => {
        const args = 'args' in event ? 'args' in event ? event.args : null : null;
        if (!args) return null;
        return {
          address: args.pool,
          token0: args.token0,
          token1: args.token1,
          fee: args.fee,
          blockNumber: event.blockNumber
        };
      }).filter(p => p !== null);

      console.log(`Fetching state for ${poolAddresses.length} pools...`);

      // Fetch pool states in batches
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

      console.log(`Uniswap V3 fetch complete: ${filteredPools.length} pools (${stats.executionTime}ms)`);

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

      console.error('Fatal error in UniswapV3Fetcher:', error);

      return {
        success: false,
        pools,
        errors,
        stats
      };
    }
  }

  /**
   * Fetch pool states for a batch of pools using multicall
   */
  private async fetchPoolStates(poolInfos: Array<{
    address: string;
    token0: string;
    token1: string;
    fee: number;
    blockNumber: number;
  }>): Promise<Pool[]> {
    if (poolInfos.length === 0) {
      return [];
    }

    const pools: Pool[] = [];
    const calls: Array<{ target: string; callData: string }> = [];

    // Prepare multicall requests for pool state
    const poolInterface = new ethers.Interface(UNISWAP_V3_POOL_ABI);
    const tokenInterface = new ethers.Interface(ERC20_ABI);

    for (const poolInfo of poolInfos) {
      // Get pool state
      calls.push({
        target: poolInfo.address,
        callData: poolInterface.encodeFunctionData('liquidity')
      });
      
      calls.push({
        target: poolInfo.address,
        callData: poolInterface.encodeFunctionData('slot0')
      });

      // Get token info
      calls.push({
        target: poolInfo.token0,
        callData: tokenInterface.encodeFunctionData('symbol')
      });
      calls.push({
        target: poolInfo.token0,
        callData: tokenInterface.encodeFunctionData('decimals')
      });
      calls.push({
        target: poolInfo.token1,
        callData: tokenInterface.encodeFunctionData('symbol')
      });
      calls.push({
        target: poolInfo.token1,
        callData: tokenInterface.encodeFunctionData('decimals')
      });
    }

    // Execute multicall
    const results = await this.multicall.aggregate3(calls);

    // Process results
    for (let i = 0; i < poolInfos.length; i++) {
      const poolInfo = poolInfos[i];
      const resultIndex = i * 6;

      try {
        // Decode results
        const liquidityResult = results[resultIndex];
        const slot0Result = results[resultIndex + 1];
        const token0SymbolResult = results[resultIndex + 2];
        const token0DecimalsResult = results[resultIndex + 3];
        const token1SymbolResult = results[resultIndex + 4];
        const token1DecimalsResult = results[resultIndex + 5];

        if (!liquidityResult.success || !slot0Result.success) {
          console.warn(`Failed to fetch state for pool ${poolInfo.address}`);
          continue;
        }

        const liquidity = Multicall.decodeResult(liquidityResult.data, ['uint128'])[0];
        const slot0 = Multicall.decodeResult(slot0Result.data, ['uint160', 'int24', 'uint16', 'uint16', 'uint16', 'uint8', 'bool']);
        const token0Symbol = Multicall.decodeResult(token0SymbolResult.data, ['string'])[0];
        const token0Decimals = Multicall.decodeResult(token0DecimalsResult.data, ['uint8'])[0];
        const token1Symbol = Multicall.decodeResult(token1SymbolResult.data, ['string'])[0];
        const token1Decimals = Multicall.decodeResult(token1DecimalsResult.data, ['uint8'])[0];

        const pool: Pool = {
          address: poolInfo.address,
          dex: this.config.name,
          dexVersion: this.config.version,
          token0: {
            address: poolInfo.token0,
            symbol: token0Symbol,
            name: token0Symbol, // Simplified, could fetch name too
            decimals: Number(token0Decimals)
          },
          token1: {
            address: poolInfo.token1,
            symbol: token1Symbol,
            name: token1Symbol,
            decimals: Number(token1Decimals)
          },
          fee: poolInfo.fee,
          liquidity: liquidity,
          sqrtPriceX96: slot0[0],
          tick: slot0[1],
          blockNumber: poolInfo.blockNumber,
          lastUpdated: Date.now(),
          isActive: liquidity > 0n
        };

        pools.push(pool);
      } catch (error) {
        console.error(`Error processing pool ${poolInfo.address}:`, error);
      }
    }

    return pools;
  }

  /**
   * Get pool address for a specific pair and fee tier
   */
  async getPoolAddress(token0: string, token1: string, fee: number): Promise<string> {
    return await this.factory.getPool(token0, token1, fee);
  }
}