/**
 * SushiSwap V3 Pool Fetcher
 * Fetches all V3 pools from SushiSwap V3 Factory (uses Uniswap V3 interface)
 */

import { ethers } from 'ethers';
import { Multicall } from '../multicall';
import type { Pool, DEXConfig, PoolFetchResult, FetchStats } from '../types';

// SushiSwap V3 uses the same interface as Uniswap V3
const SUSHISWAP_V3_FACTORY_ABI = [
  'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)',
  'function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)',
];

const SUSHISWAP_V3_POOL_ABI = [
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function fee() external view returns (uint24)',
  'function liquidity() external view returns (uint128)',
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
];

const ERC20_ABI = [
  'function symbol() external view returns (string)',
  'function decimals() external view returns (uint8)',
];

export class SushiSwapV3Fetcher {
  private provider: ethers.Provider;
  private multicall: Multicall;
  private factory: ethers.Contract;
  private config: DEXConfig;

  constructor(provider: ethers.Provider, config: DEXConfig) {
    this.provider = provider;
    this.multicall = new Multicall(provider);
    this.config = config;
    this.factory = new ethers.Contract(config.factory, SUSHISWAP_V3_FACTORY_ABI, provider);
  }

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
      console.log(`Fetching SushiSwap V3 pools from factory: ${this.config.factory}`);

      const currentBlock = await this.provider.getBlockNumber();
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

      const poolAddresses = events.map(event => ({
        address: 'args' in event ? event.args : null?.pool,
        token0: 'args' in event ? event.args : null?.token0,
        token1: 'args' in event ? event.args : null?.token1,
        fee: 'args' in event ? event.args : null?.fee,
        blockNumber: event.blockNumber
      })).filter(p => p.address);

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

      let filteredPools = pools;
      if (baseToken) {
        filteredPools = pools.filter(pool => 
          pool.token0.address.toLowerCase() === baseToken.toLowerCase() ||
          pool.token1.address.toLowerCase() === baseToken.toLowerCase()
        );
        console.log(`Filtered to ${filteredPools.length} pools with base token ${baseToken}`);
      }

      stats.executionTime = Date.now() - startTime;

      console.log(`SushiSwap V3 fetch complete: ${filteredPools.length} pools (${stats.executionTime}ms)`);

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

      console.error('Fatal error in SushiSwapV3Fetcher:', error);

      return {
        success: false,
        pools,
        errors,
        stats
      };
    }
  }

  private async fetchPoolStates(poolInfos: any[]): Promise<Pool[]> {
    if (poolInfos.length === 0) return [];

    const pools: Pool[] = [];
    const calls: any[] = [];

    const poolInterface = new ethers.Interface(SUSHISWAP_V3_POOL_ABI);
    const tokenInterface = new ethers.Interface(ERC20_ABI);

    for (const poolInfo of poolInfos) {
      calls.push({ target: poolInfo.address, callData: poolInterface.encodeFunctionData('liquidity') });
      calls.push({ target: poolInfo.address, callData: poolInterface.encodeFunctionData('slot0') });
      calls.push({ target: poolInfo.token0, callData: tokenInterface.encodeFunctionData('symbol') });
      calls.push({ target: poolInfo.token0, callData: tokenInterface.encodeFunctionData('decimals') });
      calls.push({ target: poolInfo.token1, callData: tokenInterface.encodeFunctionData('symbol') });
      calls.push({ target: poolInfo.token1, callData: tokenInterface.encodeFunctionData('decimals') });
    }

    const results = await this.multicall.aggregate3(calls);

    for (let i = 0; i < poolInfos.length; i++) {
      const poolInfo = poolInfos[i];
      const resultIndex = i * 6;

      try {
        const liquidityResult = results[resultIndex];
        const slot0Result = results[resultIndex + 1];
        const token0SymbolResult = results[resultIndex + 2];
        const token0DecimalsResult = results[resultIndex + 3];
        const token1SymbolResult = results[resultIndex + 4];
        const token1DecimalsResult = results[resultIndex + 5];

        if (!liquidityResult.success || !slot0Result.success) continue;

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
            name: token0Symbol,
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
}