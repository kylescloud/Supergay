import { ethers } from 'ethers';
import { PoolState, Token } from '../types';
import { UniswapV3Pool, UniswapV3Factory } from './uniswapV3';
import { UniswapV2Pair, UniswapV2Factory } from './uniswapV2';
import { CurvePool, CurveRegistry } from './curve';
import { UniswapV4 } from './uniswapV4';
import { AerodromePool, AerodromeFactory } from './aerodrome';
import { PancakeSwapV3Pool, PancakeSwapV2Pair, PancakeSwapV3Factory, PancakeSwapV2Factory } from './pancakeSwap';
import { DEX_CONFIG } from '../config/constants';

/**
 * DEX Manager
 * 
 * Centralized interface for interacting with all DEXs on Base.
 * Supports: Uniswap V4, V3, V2, Curve, SushiSwap V3, PancakeSwap V3, Aerodrome Finance, Aerodrome SlipStream, Aerodrome SlipStream 2, BaseSwap
 */
export class DEXManager {
  private provider: ethers.JsonRpcProvider;
  
  // DEX instances - Only 10 required DEXs
  private uniswapV4: UniswapV4;
  private uniswapV3Factory: UniswapV3Factory;
  private uniswapV2Factory: UniswapV2Factory;
  private sushiswapV3Factory: UniswapV3Factory;
  private pancakeSwapV3Factory: PancakeSwapV3Factory;
  private aerodromeFactory: AerodromeFactory; // Aerodrome Finance (V2-style)
  private aerodromeSlipStreamFactory: UniswapV3Factory; // Aerodrome SlipStream (V3-style)
  private aerodromeSlipStream2Factory: UniswapV3Factory; // Aerodrome SlipStream 2 (V3-style)
  private baseSwapFactory: UniswapV2Factory; // BaseSwap (V2-style)
  private curveRegistry: CurveRegistry;

  constructor(provider: ethers.JsonRpcProvider) {
    this.provider = provider;

    // Initialize DEX factories - Only 10 required DEXs
    this.uniswapV4 = new UniswapV4(provider);
    this.uniswapV3Factory = new UniswapV3Factory(provider);
    this.uniswapV2Factory = new UniswapV2Factory(provider);
    this.sushiswapV3Factory = new UniswapV3Factory(provider, DEX_CONFIG.sushiswapV3.factory);
    this.pancakeSwapV3Factory = new PancakeSwapV3Factory(provider);
    this.aerodromeFactory = new AerodromeFactory(provider);
    this.aerodromeSlipStreamFactory = new UniswapV3Factory(provider, DEX_CONFIG.aerodromeSlipStream.factory);
    this.aerodromeSlipStream2Factory = new UniswapV3Factory(provider, DEX_CONFIG.aerodromeSlipStream2.factory);
    this.baseSwapFactory = new UniswapV2Factory(provider, DEX_CONFIG.baseSwap.factory);
    this.curveRegistry = new CurveRegistry(provider);
  }

  /**
   * Get pool state for a token pair across all DEXs
   */
  async getAllPoolStates(
    token0: string,
    token1: string,
    blockTag: ethers.BlockTag = 'latest'
  ): Promise<PoolState[]> {
    const poolStates: PoolState[] = [];

    // Uniswap V4 pools (new architecture)
    try {
      for (const feeTier of DEX_CONFIG.uniswapV4.feeTiers || [100, 500, 2500, 3000, 10000]) {
        const state = await this.uniswapV4.getPoolState(token0, token1, feeTier);
        if (state) {
          poolStates.push({
            dex: 'uniswap-v4',
            address: DEX_CONFIG.uniswapV4.poolManager,
            token0: {
              address: token0,
              symbol: '',
              decimals: 18,
              name: '',
            },
            token1: {
              address: token1,
              symbol: '',
              decimals: 18,
              name: '',
            },
            fee: feeTier,
            sqrtPriceX96: state.sqrtPriceX96,
            tick: state.tick,
            liquidity: state.liquidity,
            reserve0: 0n,
            reserve1: 0n,
            version: 'v4',
          });
        }
      }
    } catch (error) {
      // V4 pool doesn't exist
    }

    // Uniswap V3 pools (all fee tiers)
    for (const feeTier of DEX_CONFIG.uniswapV3.feeTiers) {
      try {
        const poolAddress = await this.uniswapV3Factory.getPool(token0, token1, feeTier);
        if (poolAddress !== ethers.ZeroAddress) {
          const pool = new UniswapV3Pool(this.provider, poolAddress);
          const state = await pool.getPoolState(blockTag);
          poolStates.push(state);
        }
      } catch (error) {
        continue;
      }
    }

    // Uniswap V2 pair
    try {
      const pairAddress = await this.uniswapV2Factory.getPair(token0, token1);
      if (pairAddress !== ethers.ZeroAddress) {
        const pair = new UniswapV2Pair(this.provider, pairAddress);
        const state = await pair.getPoolState(blockTag);
        poolStates.push(state);
      }
    } catch (error) {
      // Pool doesn't exist
    }

    // SushiSwap V3 pools (all fee tiers)
    for (const feeTier of DEX_CONFIG.sushiswapV3.feeTiers) {
      try {
        const poolAddress = await this.sushiswapV3Factory.getPool(token0, token1, feeTier);
        if (poolAddress !== ethers.ZeroAddress) {
          const pool = new UniswapV3Pool(this.provider, poolAddress);
          const state = await pool.getPoolState(blockTag);
          state.dex = 'sushiswap-v3';
          poolStates.push(state);
        }
      } catch (error) {
        continue;
      }
    }

    // PancakeSwap V3 pools (all fee tiers)
    for (const feeTier of DEX_CONFIG.pancakeSwapV3.feeTiers) {
      try {
        const poolAddress = await this.pancakeSwapV3Factory.getPool(token0, token1, feeTier);
        if (poolAddress !== ethers.ZeroAddress) {
          const pool = new PancakeSwapV3Pool(this.provider, poolAddress);
          const state = await pool.getPoolState(blockTag);
          poolStates.push(state);
        }
      } catch (error) {
        continue;
      }
    }

    // Aerodrome Finance pools (V2-style)
    try {
      const pairAddress = await this.aerodromeFactory.getPair(token0, token1);
      if (pairAddress !== ethers.ZeroAddress) {
        const pool = new AerodromePool(this.provider, pairAddress);
        const state = await pool.getPoolState(blockTag);
        state.dex = 'aerodrome';
        poolStates.push(state);
      }
    } catch (error) {
      // Pool doesn't exist
    }

    // Aerodrome SlipStream pools (V3-style)
    for (const feeTier of DEX_CONFIG.aerodromeSlipStream.feeTiers) {
      try {
        const poolAddress = await this.aerodromeSlipStreamFactory.getPool(token0, token1, feeTier);
        if (poolAddress !== ethers.ZeroAddress) {
          const pool = new UniswapV3Pool(this.provider, poolAddress);
          const state = await pool.getPoolState(blockTag);
          state.dex = 'aerodrome-slipstream';
          poolStates.push(state);
        }
      } catch (error) {
        continue;
      }
    }

    // Aerodrome SlipStream 2 pools (V3-style)
    for (const feeTier of DEX_CONFIG.aerodromeSlipStream2.feeTiers) {
      try {
        const poolAddress = await this.aerodromeSlipStream2Factory.getPool(token0, token1, feeTier);
        if (poolAddress !== ethers.ZeroAddress) {
          const pool = new UniswapV3Pool(this.provider, poolAddress);
          const state = await pool.getPoolState(blockTag);
          state.dex = 'aerodrome-slipstream-2';
          poolStates.push(state);
        }
      } catch (error) {
        continue;
      }
    }

    // BaseSwap pairs (V2-style)
    try {
      const pairAddress = await this.baseSwapFactory.getPair(token0, token1);
      if (pairAddress !== ethers.ZeroAddress) {
        const pair = new UniswapV2Pair(this.provider, pairAddress);
        const state = await pair.getPoolState(blockTag);
        state.dex = 'baseswap';
        poolStates.push(state);
      }
    } catch (error) {
      // Pool doesn't exist
    }

    // Curve pool (if exists)
    const curvePoolAddress = CurvePool.getPoolAddress(token0, token1);
    if (curvePoolAddress && curvePoolAddress !== ethers.ZeroAddress) {
      try {
        const pool = new CurvePool(this.provider, curvePoolAddress);
        const state = await pool.getPoolState(blockTag);
        poolStates.push(state);
      } catch (error) {
        // Pool doesn't exist
      }
    }

    return poolStates;
  }

  /**
   * Get best pool for a swap (highest rate)
   */
  async getBestPoolForSwap(
    tokenIn: Token,
    tokenOut: Token,
    amountIn: bigint,
    blockTag: ethers.BlockTag = 'latest'
  ): Promise<PoolState | null> {
    const poolStates = await this.getAllPoolStates(
      tokenIn.address,
      tokenOut.address,
      blockTag
    );

    let bestPool: PoolState | null = null;
    let bestRate = 0;

    for (const pool of poolStates) {
      try {
        const rate = await this.getPoolRate(pool, tokenIn, tokenOut, amountIn);
        if (rate > bestRate) {
          bestRate = rate;
          bestPool = pool;
        }
      } catch (error) {
        continue;
      }
    }

    return bestPool;
  }

  /**
   * Get rate for a specific pool
   */
  private async getPoolRate(
    pool: PoolState,
    tokenIn: Token,
    tokenOut: Token,
    amountIn: bigint
  ): Promise<number> {
    // This would call the appropriate DEX's quote function
    // For now, return 0 (needs implementation)
    return 0;
  }

  /**
   * Get all supported DEX names
   */
  getSupportedDEXs(): string[] {
    return [
      'uniswap-v4',
      'uniswap-v3',
      'uniswap-v2',
      'curve',
      'sushiswap-v3',
      'pancakeswap-v3',
      'aerodrome',
      'aerodrome-slipstream',
      'aerodrome-slipstream-2',
      'baseswap',
    ];
  }

  /**
   * Check if a DEX is supported
   */
  isDEXSupported(dex: string): boolean {
    return this.getSupportedDEXs().includes(dex);
  }
}