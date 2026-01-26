/**
 * Aerodrome Pool Fetcher
 * Fetches all pools from Aerodrome (aerodrome.finance) which uses a hybrid V2/V3 model
 */

import { ethers } from 'ethers';
import { Multicall } from '../multicall';
import type { Pool, DEXConfig, PoolFetchResult, FetchStats } from '../types';

// Aerodrome Factory ABI (supports both V2 and V3 style pools)
const AERODROME_FACTORY_ABI = [
  'event PairCreated(address indexed token0, address indexed token1, address pair, bool, uint256)',
  'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)',
  'function allPairsLength() external view returns (uint256)',
  'function allPairs(uint) external view returns (address pair)',
  'function getPair(address tokenA, address tokenB) external view returns (address pair)',
];

// Aerodrome Pool ABI (supports both V2 and V3)
const AERODROME_POOL_ABI = [
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function liquidity() external view returns (uint128)',
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function fee() external view returns (uint24)',
];

const ERC20_ABI = [
  'function symbol() external view returns (string)',
  'function decimals() external view returns (uint8)',
];

export class AerodromeFetcher {
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
    
    this.factory = new ethers.Contract(config.factory, AERODROME_FACTORY_ABI, provider);
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
      console.log(`Fetching Aerodrome pools from factory: ${this.config.factory}`);

      // Try to get pools from allPairs (V2 style)
      let poolAddresses: string[] = [];
      try {
        const totalPairs = await this.factory.allPairsLength();
        console.log(`Total pairs: ${totalPairs.toString()}`);
        stats.totalRequested = Number(totalPairs);

        if (totalPairs > 0n) {
          const batchSize = 500;
          for (let i = 0n; i < totalPairs; i += BigInt(batchSize)) {
            const batch = [];
            for (let j = 0n; j < BigInt(batchSize) && (i + j) < totalPairs; j++) {
              batch.push(this.factory.allPairs(i + j));
            }
            const addresses = await Promise.all(batch);
            poolAddresses.push(...addresses.map(a => a.toLowerCase()));
            console.log(`Fetched ${addresses.length} pool addresses (${poolAddresses.length}/${totalPairs})`);
          }
        }
      } catch (error) {
        console.log('allPairs not available, trying events...');
      }

      // If no pairs from allPairs, try events
      if (poolAddresses.length === 0) {
        const currentBlock = await this.provider.getBlockNumber();
        const pairCreatedFilter = this.factory.filters.PairCreated();
        const events = await this.factory.queryFilter(pairCreatedFilter, 0, currentBlock);
        
        console.log(`Found ${events.length} PairCreated events`);
        poolAddresses = events
          .filter((e): e is ethers.EventLog => 'args' in e && e.args !== null)
          .map(e => e.args!.pair)
          .filter(Boolean) as string[];
        stats.totalRequested = events.length;
      }

      if (poolAddresses.length === 0) {
        return {
          success: true,
          pools: [],
          errors: ['No pools found'],
          stats
        };
      }

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

      console.log(`Aerodrome fetch complete: ${filteredPools.length} pools (${stats.executionTime}ms)`);

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

      console.error('Fatal error in AerodromeFetcher:', error);

      return {
        success: false,
        pools,
        errors,
        stats
      };
    }
  }

  private async fetchPoolStates(poolAddresses: string[]): Promise<Pool[]> {
    if (poolAddresses.length === 0) return [];

    const pools: Pool[] = [];
    const poolInterface = new ethers.Interface(AERODROME_POOL_ABI);
    const tokenInterface = new ethers.Interface(ERC20_ABI);

    for (const poolAddress of poolAddresses) {
      try {
        // Get pool info
        const calls = [
          { target: poolAddress, callData: poolInterface.encodeFunctionData('token0') },
          { target: poolAddress, callData: poolInterface.encodeFunctionData('token1') },
        ];

        const results = await this.multicall.aggregate3(calls);

        if (!results[0].success || !results[1].success) {
          continue;
        }

        const token0Address = Multicall.decodeResult(results[0].data, ['address'])[0];
        const token1Address = Multicall.decodeResult(results[1].data, ['address'])[0];

        // Try to get reserves (V2 style)
        let pool: Pool;
        try {
          const reservesCall = await this.multicall.aggregate3([{
            target: poolAddress,
            callData: poolInterface.encodeFunctionData('getReserves')
          }]);

          if (reservesCall[0].success) {
            const reserves = Multicall.decodeResult(reservesCall[0].data, ['uint112', 'uint112', 'uint32']);

            // Get token info
            const tokenInfoResults = await this.multicall.aggregate3([
              { target: token0Address, callData: tokenInterface.encodeFunctionData('symbol') },
              { target: token0Address, callData: tokenInterface.encodeFunctionData('decimals') },
              { target: token1Address, callData: tokenInterface.encodeFunctionData('symbol') },
              { target: token1Address, callData: tokenInterface.encodeFunctionData('decimals') },
            ]);

            const token0Symbol = Multicall.decodeResult(tokenInfoResults[0].data, ['string'])[0];
            const token0Decimals = Multicall.decodeResult(tokenInfoResults[1].data, ['uint8'])[0];
            const token1Symbol = Multicall.decodeResult(tokenInfoResults[2].data, ['string'])[0];
            const token1Decimals = Multicall.decodeResult(tokenInfoResults[3].data, ['uint8'])[0];

            pool = {
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
              reserve0: reserves[0],
              reserve1: reserves[1],
              blockNumber: await this.provider.getBlockNumber(),
              lastUpdated: Date.now(),
              isActive: reserves[0] > 0n || reserves[1] > 0n
            };

            pools.push(pool);
          }
        } catch (error) {
          // Try V3 style
          try {
            const v3Calls = [
              { target: poolAddress, callData: poolInterface.encodeFunctionData('liquidity') },
              { target: poolAddress, callData: poolInterface.encodeFunctionData('slot0') },
              { target: poolAddress, callData: poolInterface.encodeFunctionData('fee') },
            ];

            const v3Results = await this.multicall.aggregate3(v3Calls);

            if (v3Results.every(r => r.success)) {
              const liquidity = Multicall.decodeResult(v3Results[0].data, ['uint128'])[0];
              const slot0 = Multicall.decodeResult(v3Results[1].data, ['uint160', 'int24', 'uint16', 'uint16', 'uint16', 'uint8', 'bool']);
              const fee = Multicall.decodeResult(v3Results[2].data, ['uint24'])[0];

              const tokenInfoResults = await this.multicall.aggregate3([
                { target: token0Address, callData: tokenInterface.encodeFunctionData('symbol') },
                { target: token0Address, callData: tokenInterface.encodeFunctionData('decimals') },
                { target: token1Address, callData: tokenInterface.encodeFunctionData('symbol') },
                { target: token1Address, callData: tokenInterface.encodeFunctionData('decimals') },
              ]);

              const token0Symbol = Multicall.decodeResult(tokenInfoResults[0].data, ['string'])[0];
              const token0Decimals = Multicall.decodeResult(tokenInfoResults[1].data, ['uint8'])[0];
              const token1Symbol = Multicall.decodeResult(tokenInfoResults[2].data, ['string'])[0];
              const token1Decimals = Multicall.decodeResult(tokenInfoResults[3].data, ['uint8'])[0];

              pool = {
                address: poolAddress,
                dex: this.config.name,
                dexVersion: 'V3',
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
                fee: Number(fee),
                liquidity: liquidity,
                sqrtPriceX96: slot0[0],
                tick: slot0[1],
                blockNumber: await this.provider.getBlockNumber(),
                lastUpdated: Date.now(),
                isActive: liquidity > 0n
              };

              pools.push(pool);
            }
          } catch (error) {
            console.error(`Error processing pool ${poolAddress}:`, error);
          }
        }
      } catch (error) {
        console.error(`Error processing pool ${poolAddress}:`, error);
      }
    }

    return pools;
  }
}