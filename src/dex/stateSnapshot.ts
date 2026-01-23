import { ethers } from 'ethers';
import { PoolState, BlockSnapshot, Token } from '../types';
import { UniswapV3Pool, UniswapV3Factory } from './uniswapV3';
import { UniswapV2Pair, UniswapV2Factory } from './uniswapV2';
import { CurvePool, CurveRegistry } from './curve';
import { UniswapV4 } from './uniswapV4';
import { AerodromePool, AerodromeFactory } from './aerodrome';
import { PancakeSwapV3Pool, PancakeSwapV2Pair, PancakeSwapV3Factory, PancakeSwapV2Factory } from './pancakeSwap';
import { TOKENS, DEX_CONFIG } from '../config/constants';

/**
 * DEX State Snapshot Manager
 * 
 * Captures the state of all relevant DEX pools at a specific block height.
 * This is critical for accurate opportunity detection and replay logic.
 */
export class StateSnapshotManager {
  private provider: ethers.JsonRpcProvider;
  private uniswapV3Factory: UniswapV3Factory;
  private uniswapV2Factory: UniswapV2Factory;
  private curveRegistry: CurveRegistry;
  private uniswapV4: UniswapV4;
  private sushiswapV3Factory: UniswapV3Factory;
  private pancakeSwapV3Factory: PancakeSwapV3Factory;
  private pancakeSwapV2Factory: PancakeSwapV2Factory;
  private aerodromeFactory: AerodromeFactory; // Aerodrome Finance (V2-style)
  private aerodromeSlipStreamFactory: UniswapV3Factory; // Aerodrome SlipStream (V3-style)
  private aerodromeSlipStream2Factory: UniswapV3Factory; // Aerodrome SlipStream 2 (V3-style)
  private baseSwapFactory: UniswapV2Factory; // BaseSwap (V2-style)

  constructor(provider: ethers.JsonRpcProvider) {
    this.provider = provider;
    this.uniswapV3Factory = new UniswapV3Factory(provider);
    this.uniswapV2Factory = new UniswapV2Factory(provider);
    this.curveRegistry = new CurveRegistry(provider);
    this.uniswapV4 = new UniswapV4(provider);
    this.sushiswapV3Factory = new UniswapV3Factory(provider, DEX_CONFIG.sushiswapV3.factory);
    this.pancakeSwapV3Factory = new PancakeSwapV3Factory(provider);
    this.pancakeSwapV2Factory = new PancakeSwapV2Factory(provider);
    this.aerodromeFactory = new AerodromeFactory(provider);
    this.aerodromeSlipStreamFactory = new UniswapV3Factory(provider, DEX_CONFIG.aerodromeSlipStream.factory);
    this.aerodromeSlipStream2Factory = new UniswapV3Factory(provider, DEX_CONFIG.aerodromeSlipStream2.factory);
    this.baseSwapFactory = new UniswapV2Factory(provider, DEX_CONFIG.baseSwap.factory);
  }

  /**
   * Build a complete state snapshot for a block
   */
  async buildBlockSnapshot(
    blockNumber: number,
    tokens: string[] = Object.values(TOKENS)
  ): Promise<BlockSnapshot> {
    console.log(`Building snapshot for block ${blockNumber}...`);

    const block = await this.provider.getBlock(blockNumber);
    if (!block) {
      throw new Error(`Block ${blockNumber} not found`);
    }

    const poolStates = new Map<string, PoolState>();

    // Snapshot Uniswap V3 pools
    await this.snapshotUniswapV3(blockNumber, tokens, poolStates);

    // Snapshot Uniswap V2 pairs
    await this.snapshotUniswapV2(blockNumber, tokens, poolStates);

    // Snapshot Curve pools
    await this.snapshotCurve(blockNumber, tokens, poolStates);

    // Snapshot additional DEXs
    await this.snapshotAdditionalDEXs(blockNumber, tokens, poolStates);

    // Snapshot Uniswap V4 pools
    await this.snapshotUniswapV4(blockNumber, tokens, poolStates);

    const snapshot: BlockSnapshot = {
      blockNumber,
      timestamp: block.timestamp,
      baseFee: block.baseFeePerGas || 0n,
      gasUsed: block.gasUsed,
      gasLimit: block.gasLimit,
      poolStates,
    };

    console.log(`Snapshot complete: ${poolStates.size} pools captured`);
    return snapshot;
  }

  /**
   * Snapshot Uniswap V3 pools
   */
  private async snapshotUniswapV3(
    blockNumber: number,
    tokens: string[],
    poolStates: Map<string, PoolState>
  ): Promise<void> {
    console.log('Snapshotting Uniswap V3 pools...');

    for (const feeTier of DEX_CONFIG.uniswapV3.feeTiers) {
      for (let i = 0; i < tokens.length; i++) {
        for (let j = i + 1; j < tokens.length; j++) {
          try {
            const poolAddress = await this.uniswapV3Factory.getPool(
              tokens[i],
              tokens[j],
              feeTier
            );

            if (poolAddress !== ethers.ZeroAddress) {
              const pool = new UniswapV3Pool(this.provider, poolAddress);
              const state = await pool.getPoolState(blockNumber);
              const key = `${state.dex}-${state.token0.address}-${state.token1.address}-${feeTier}`;
              poolStates.set(key, state);
            }
          } catch (error) {
            // Pool doesn't exist or error fetching state
            continue;
          }
        }
      }
    }

    console.log(`Uniswap V3: ${[...poolStates.values()].filter(s => s.dex === 'uniswap-v3').length} pools snapshot`);
  }

  /**
   * Snapshot Uniswap V2 pairs
   */
  private async snapshotUniswapV2(
    blockNumber: number,
    tokens: string[],
    poolStates: Map<string, PoolState>
  ): Promise<void> {
    console.log('Snapshotting Uniswap V2 pairs...');

    for (let i = 0; i < tokens.length; i++) {
      for (let j = i + 1; j < tokens.length; j++) {
        try {
          const pairAddress = await this.uniswapV2Factory.getPair(
            tokens[i],
            tokens[j]
          );

          if (pairAddress !== ethers.ZeroAddress) {
            const pair = new UniswapV2Pair(this.provider, pairAddress);
            const state = await pair.getPoolState(blockNumber);
            const key = `${state.dex}-${state.token0.address}-${state.token1.address}`;
            poolStates.set(key, state);
          }
        } catch (error) {
          // Pair doesn't exist or error fetching state
          continue;
        }
      }
    }

    console.log(`Uniswap V2: ${[...poolStates.values()].filter(s => s.dex === 'uniswap-v2').length} pairs snapshot`);
  }

  /**
   * Snapshot Curve pools
   */
  private async snapshotCurve(
    blockNumber: number,
    tokens: string[],
    poolStates: Map<string, PoolState>
  ): Promise<void> {
    console.log('Snapshotting Curve pools...');

    // Check known Curve pools
    // For now, skip Curve as we don't have pool addresses for Base
    const curvePoolAddresses: string[] = [];

    for (const poolAddress of curvePoolAddresses) {
      try {
        const pool = new CurvePool(this.provider, poolAddress);
        const state = await pool.getPoolState(blockNumber);
        const key = `${state.dex}-${state.token0.address}-${state.token1.address}`;
        poolStates.set(key, state);
      } catch (error) {
        // Pool doesn't exist or error fetching state
        continue;
      }
    }

    console.log(`Curve: ${[...poolStates.values()].filter(s => s.dex === 'curve').length} pools snapshot`);
  }

  /**
   * Snapshot Uniswap V4 pools (new architecture)
   */
  private async snapshotUniswapV4(
    blockNumber: number,
    tokens: string[],
    poolStates: Map<string, PoolState>
  ): Promise<void> {
    console.log('Snapshotting Uniswap V4 pools...');

    for (const feeTier of DEX_CONFIG.uniswapV4.feeTiers || [100, 500, 2500, 3000, 10000]) {
      for (let i = 0; i < tokens.length; i++) {
        for (let j = i + 1; j < tokens.length; j++) {
          try {
            const state = await this.uniswapV4.getPoolState(
              tokens[i],
              tokens[j],
              feeTier
            );
            
            if (state && state.sqrtPriceX96 !== 0n) {
              const poolState: PoolState = {
                dex: 'uniswap-v4',
                address: DEX_CONFIG.uniswapV4.poolManager,
                token0: { address: tokens[i], symbol: '', decimals: 18, name: '' },
                token1: { address: tokens[j], symbol: '', decimals: 18, name: '' },
                fee: feeTier,
                sqrtPriceX96: state.sqrtPriceX96,
                tick: state.tick,
                liquidity: state.liquidity,
                reserve0: 0n,
                reserve1: 0n,
                version: 'v4',
              };
              
              const key = `uniswap-v4-${tokens[i]}-${tokens[j]}-${feeTier}`;
              poolStates.set(key, poolState);
            }
          } catch (error) {
            // Pool doesn't exist or error fetching state
            continue;
          }
        }
      }
    }
  }

  /**
   * Snapshot additional DEXs (only 10 required DEXs)
   */
  private async snapshotAdditionalDEXs(
    blockNumber: number,
    tokens: string[],
    poolStates: Map<string, PoolState>
  ): Promise<void> {
    console.log('Snapshotting additional DEXs...');

    // Import dynamically to avoid circular dependencies
    const { DEXManager } = require('./dexManager');
    const dexManager = new DEXManager(this.provider);

    // For each token pair, get all pools from all DEXs
    for (let i = 0; i < tokens.length; i++) {
      for (let j = i + 1; j < tokens.length; j++) {
        try {
          const allPools = await dexManager.getAllPoolStates(
            tokens[i],
            tokens[j],
            blockNumber
          );

          for (const pool of allPools) {
            // Skip Uniswap V2/V3 and Curve (already captured)
            if (['uniswap-v2', 'uniswap-v3', 'curve'].includes(pool.dex)) {
              continue;
            }

            // Create unique key
            let key: string;
            if (pool.dex === 'pancakeswap-v3' || pool.dex === 'sushiswap-v3' || pool.dex === 'aerodrome') {
              key = `${pool.dex}-${pool.token0.address}-${pool.token1.address}-${pool.fee}`;
            } else {
              key = `${pool.dex}-${pool.token0.address}-${pool.token1.address}`;
            }

            poolStates.set(key, pool);
          }
        } catch (error) {
          continue;
        }
      }
    }

    const additionalDEXs = [...poolStates.values()].filter(s => 
      !['uniswap-v2', 'uniswap-v3', 'curve'].includes(s.dex)
    );
    console.log(`Additional DEXs: ${additionalDEXs.length} pools snapshot`);

    // Count pools per DEX
    const dexCounts = new Map<string, number>();
    for (const pool of additionalDEXs) {
      dexCounts.set(pool.dex, (dexCounts.get(pool.dex) || 0) + 1);
    }

    for (const [dex, count] of dexCounts) {
      console.log(`  ${dex}: ${count} pools`);
    }
  }

  /**
   * Build a range of block snapshots
   */
  async buildBlockSnapshots(
    startBlock: number,
    endBlock: number,
    tokens?: string[]
  ): Promise<BlockSnapshot[]> {
    const snapshots: BlockSnapshot[] = [];

    for (let block = startBlock; block <= endBlock; block++) {
      try {
        const snapshot = await this.buildBlockSnapshot(block, tokens);
        snapshots.push(snapshot);
      } catch (error) {
        console.error(`Error snapshotting block ${block}:`, error);
      }
    }

    return snapshots;
  }

  /**
   * Get pool state for a specific token pair at a block
   */
  async getPoolState(
    token0: string,
    token1: string,
    dex: string,
    blockNumber: number,
    feeTier?: number
  ): Promise<PoolState | null> {
    let poolAddress: string | null = null;

    switch (dex) {
      case 'uniswap-v3':
        if (feeTier) {
          poolAddress = await this.uniswapV3Factory.getPool(token0, token1, feeTier);
        }
        break;
      case 'uniswap-v2':
        poolAddress = await this.uniswapV2Factory.getPair(token0, token1);
        break;
      case 'curve':
        poolAddress = CurvePool.getPoolAddress(token0, token1);
        break;
    }

    if (!poolAddress || poolAddress === ethers.ZeroAddress) {
      return null;
    }

    try {
      let state: PoolState;
      switch (dex) {
        case 'uniswap-v3':
          state = await new UniswapV3Pool(this.provider, poolAddress).getPoolState(blockNumber);
          break;
        case 'uniswap-v2':
          state = await new UniswapV2Pair(this.provider, poolAddress).getPoolState(blockNumber);
          break;
        case 'curve':
          state = await new CurvePool(this.provider, poolAddress).getPoolState(blockNumber);
          break;
        default:
          return null;
      }
      return state;
    } catch (error) {
      return null;
    }
  }
}