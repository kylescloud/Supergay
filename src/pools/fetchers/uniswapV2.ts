/**
 * Uniswap V2 Pair Fetcher
 * Fetches all V2 pairs from Uniswap V2 Factory using multicall
 */

import { ethers } from 'ethers';
import { Multicall } from '../multicall';
import type { Pool, DEXConfig, PoolFetchResult, FetchStats } from '../types';

// Uniswap V2 Factory ABI (minimal interface)
const UNISWAP_V2_FACTORY_ABI = [
  'event PairCreated(address indexed token0, address indexed token1, address pair, uint)',
  'function allPairsLength() external view returns (uint)',
  'function allPairs(uint) external view returns (address pair)',
  'function getPair(address tokenA, address tokenB) external view returns (address pair)',
];

// Uniswap V2 Pair ABI (minimal interface for state)
const UNISWAP_V2_PAIR_ABI = [
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
];

// ERC20 ABI for token info
const ERC20_ABI = [
  'function symbol() external view returns (string)',
  'function decimals() external view returns (uint8)',
];

export class UniswapV2Fetcher {
  private provider: ethers.Provider;
  private multicall: Multicall;
  private factory: ethers.Contract;
  private config: DEXConfig;

  constructor(provider: ethers.Provider, config: DEXConfig) {
    this.provider = provider;
    this.multicall = new Multicall(provider);
    this.config = config;
    
    if (!config.factory) {
      throw new Error(`Factory address is required for ${config.name}`);
    }
    
    this.factory = new ethers.Contract(config.factory, UNISWAP_V2_FACTORY_ABI, provider);
  }

  /**
   * Fetch all pairs by querying allPairsLength and iterating
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
      console.log(`Fetching Uniswap V2 pairs from factory: ${this.config.factory}`);

      // Get total number of pairs
      const totalPairs = await this.factory.allPairsLength();
      console.log(`Total pairs: ${totalPairs.toString()}`);

      stats.totalRequested = Number(totalPairs);

      if (totalPairs === 0n) {
        return {
          success: true,
          pools: [],
          errors: ['No pairs found'],
          stats
        };
      }

      // Fetch pair addresses in batches
      const batchSize = 500;
      const allPairAddresses: string[] = [];

      for (let i = 0n; i < totalPairs; i += BigInt(batchSize)) {
        const batch = [];
        for (let j = 0n; j < BigInt(batchSize) && (i + j) < totalPairs; j++) {
          batch.push(this.factory.allPairs(i + j));
        }
        const addresses = await Promise.all(batch);
        allPairAddresses.push(...addresses.map(a => a.toLowerCase()));
        console.log(`Fetched ${addresses.length} pair addresses (${allPairAddresses.length}/${totalPairs})`);
      }

      console.log(`Fetching state for ${allPairAddresses.length} pairs...`);

      // Fetch pair states in batches
      for (let i = 0; i < allPairAddresses.length; i += batchSize) {
        const batch = allPairAddresses.slice(i, i + batchSize);
        stats.batches++;

        try {
          const batchPools = await this.fetchPairStates(batch);
          pools.push(...batchPools);
          stats.successful += batch.length;
          
          console.log(`Processed batch ${Math.floor(i / batchSize) + 1}: ${batchPools.length} pairs`);
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : 'Unknown error';
          errors.push(`Batch ${Math.floor(i / batchSize) + 1} failed: ${errMsg}`);
          stats.failed += batch.length;
          console.error(`Error in batch ${Math.floor(i / batchSize) + 1}:`, errMsg);
        }
      }

      // Filter pairs by base token if specified
      let filteredPools = pools;
      if (baseToken) {
        filteredPools = pools.filter(pool => 
          pool.token0.address.toLowerCase() === baseToken.toLowerCase() ||
          pool.token1.address.toLowerCase() === baseToken.toLowerCase()
        );
        console.log(`Filtered to ${filteredPools.length} pairs with base token ${baseToken}`);
      }

      stats.executionTime = Date.now() - startTime;

      console.log(`Uniswap V2 fetch complete: ${filteredPools.length} pairs (${stats.executionTime}ms)`);

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

      console.error('Fatal error in UniswapV2Fetcher:', error);

      return {
        success: false,
        pools,
        errors,
        stats
      };
    }
  }

  /**
   * Fetch pair states for a batch of pairs using multicall
   */
  private async fetchPairStates(pairAddresses: string[]): Promise<Pool[]> {
    if (pairAddresses.length === 0) {
      return [];
    }

    const pools: Pool[] = [];
    const calls: Array<{ target: string; callData: string }> = [];

    const pairInterface = new ethers.Interface(UNISWAP_V2_PAIR_ABI);
    const tokenInterface = new ethers.Interface(ERC20_ABI);

    for (const pairAddress of pairAddresses) {
      // Get pair state
      calls.push({
        target: pairAddress,
        callData: pairInterface.encodeFunctionData('token0')
      });
      calls.push({
        target: pairAddress,
        callData: pairInterface.encodeFunctionData('token1')
      });
      calls.push({
        target: pairAddress,
        callData: pairInterface.encodeFunctionData('getReserves')
      });
    }

    // Execute multicall
    const results = await this.multicall.aggregate3(calls);

    // Process results
    for (let i = 0; i < pairAddresses.length; i++) {
      const pairAddress = pairAddresses[i];
      const resultIndex = i * 3;

      try {
        const token0Result = results[resultIndex];
        const token1Result = results[resultIndex + 1];
        const reservesResult = results[resultIndex + 2];

        if (!token0Result.success || !token1Result.success || !reservesResult.success) {
          console.warn(`Failed to fetch state for pair ${pairAddress}`);
          continue;
        }

        const token0Address = Multicall.decodeResult(token0Result.data, ['address'])[0];
        const token1Address = Multicall.decodeResult(token1Result.data, ['address'])[0];
        const reserves = Multicall.decodeResult(reservesResult.data, ['uint112', 'uint112', 'uint32']);

        // Get token info
        const token0SymbolResult = await this.multicall.aggregate3([{
          target: token0Address,
          callData: tokenInterface.encodeFunctionData('symbol')
        }]);
        const token0DecimalsResult = await this.multicall.aggregate3([{
          target: token0Address,
          callData: tokenInterface.encodeFunctionData('decimals')
        }]);
        const token1SymbolResult = await this.multicall.aggregate3([{
          target: token1Address,
          callData: tokenInterface.encodeFunctionData('symbol')
        }]);
        const token1DecimalsResult = await this.multicall.aggregate3([{
          target: token1Address,
          callData: tokenInterface.encodeFunctionData('decimals')
        }]);

        const token0Symbol = Multicall.decodeResult(token0SymbolResult[0].data, ['string'])[0];
        const token0Decimals = Multicall.decodeResult(token0DecimalsResult[0].data, ['uint8'])[0];
        const token1Symbol = Multicall.decodeResult(token1SymbolResult[0].data, ['string'])[0];
        const token1Decimals = Multicall.decodeResult(token1DecimalsResult[0].data, ['uint8'])[0];

        const pool: Pool = {
          address: pairAddress,
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
          reserve0: reserves[0],
          reserve1: reserves[1],
          blockNumber: await this.provider.getBlockNumber(),
          lastUpdated: Date.now(),
          isActive: reserves[0] > 0n || reserves[1] > 0n
        };

        pools.push(pool);
      } catch (error) {
        console.error(`Error processing pair ${pairAddress}:`, error);
      }
    }

    return pools;
  }

  /**
   * Get pair address for a specific token pair
   */
  async getPairAddress(token0: string, token1: string): Promise<string> {
    return await this.factory.getPair(token0, token1);
  }
}