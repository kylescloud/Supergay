import { ethers } from 'ethers';
import { PoolRegistryManager } from './registry';
import { PoolDiscovery } from './discovery';
import { TOKENS as FLASH_LOAN_TOKENS_ADDRESSES } from '../config/constants';
import { QUOTE_TOKENS as QUOTE_TOKENS_ADDRESSES } from '../config/top-200-tokens';
import { EnhancedRPCManager } from '../utils/enhancedRpcManager';
import { DEX_DISCOVERY_CONFIG } from '../config/dexDiscoveryConfig';
import { Token } from '../types';
import { PUBLIC_RPC_NODES, PRIVATE_RPC_NODES } from '../config/constants';

// Convert address objects to Token arrays
const FLASH_LOAN_TOKENS: Token[] = Object.entries(FLASH_LOAN_TOKENS_ADDRESSES).map(([symbol, address]) => ({
  address,
  symbol,
  decimals: 18, // Default decimals, will be fetched if needed
  name: symbol,
}));

const QUOTE_TOKENS: Token[] = Object.entries(QUOTE_TOKENS_ADDRESSES).map(([symbol, address]) => ({
  address,
  symbol,
  decimals: 18, // Default decimals, will be fetched if needed
  name: symbol,
}));

// Simple console logger for discovery
const logger = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  debug: (msg: string) => console.log(`[DEBUG] ${msg}`),
  error: (msg: string) => console.error(`[ERROR] ${msg}`),
  warn: (msg: string) => console.warn(`[WARN] ${msg}`),
};

interface DiscoveryProgress {
  totalPairs: number;
  processed: number;
  successful: number;
  failed: number;
  skipped: number;
  startTime: Date;
}

/**
 * Pool discovery system for top 200 Base tokens
 * 
 * This system discovers pools for all 14 Aave V3 flash loan tokens
 * paired with the top 200 Base tokens across all 10 configured DEXs.
 */
export class DiscoveryTop200 {
  private registry: PoolRegistryManager;
  private discovery: PoolDiscovery;
  private rpcManager: EnhancedRPCManager;
  private progress: DiscoveryProgress;

  constructor() {
    // Combine public and private RPC URLs
    const allRpcUrls = [...PUBLIC_RPC_NODES, ...PRIVATE_RPC_NODES];
    
    this.rpcManager = new EnhancedRPCManager(allRpcUrls);
    const provider = this.rpcManager.getProvider();
    if (!provider) {
      throw new Error('Failed to get RPC provider');
    }
    this.registry = new PoolRegistryManager('./data');
    this.discovery = new PoolDiscovery(provider);
    this.progress = {
      totalPairs: 0,
      processed: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
      startTime: new Date(),
    };
  }

  /**
   * Discover pools for all flash loan tokens paired with top 200 tokens
   * across all 10 DEXs
   */
  async discoverAll(): Promise<void> {
    logger.info('Starting pool discovery for top 200 tokens across all 10 DEXs');
    logger.info(`Flash loan tokens: ${FLASH_LOAN_TOKENS.length}`);
    logger.info(`Quote tokens: ${QUOTE_TOKENS.length}`);
    
    // Calculate total pairs: 14 flash loan tokens * 200 quote tokens * 10 DEXs
    const totalPairs = FLASH_LOAN_TOKENS.length * QUOTE_TOKENS.length * 10;
    this.progress.totalPairs = totalPairs;
    
    logger.info(`Total pairs to check: ${totalPairs}`);

    // RPC manager is auto-initialized on first provider request

    // Iterate through all flash loan tokens
    for (const baseToken of FLASH_LOAN_TOKENS) {
      logger.info(`Processing base token: ${baseToken.symbol}`);
      
      // Iterate through all quote tokens
      for (const quoteToken of QUOTE_TOKENS) {
        // Skip duplicate pairs (same token)
        if (baseToken.address.toLowerCase() === quoteToken.address.toLowerCase()) {
          this.progress.skipped++;
          continue;
        }

        // Get pool address from all 10 DEXs
        const poolAddresses = await this.getAllDexPoolAddresses(baseToken, quoteToken);
        
        // Fetch pool states for all found pools
        for (const poolInfo of poolAddresses) {
          try {
            const poolState = await this.getPoolState(poolInfo.dexType, poolInfo.address);
            
            if (poolState) {
              await this.registry.addPools([{
                address: poolInfo.address,
                dex: poolInfo.dexType,
                dexVersion: poolInfo.dexVersion,
                token0: baseToken.address.toLowerCase() < quoteToken.address.toLowerCase() 
                  ? {
                      address: baseToken.address,
                      symbol: baseToken.symbol,
                      name: baseToken.name,
                      decimals: baseToken.decimals,
                    }
                  : {
                      address: quoteToken.address,
                      symbol: quoteToken.symbol,
                      name: quoteToken.name,
                      decimals: quoteToken.decimals,
                    },
                token1: baseToken.address.toLowerCase() < quoteToken.address.toLowerCase() 
                  ? {
                      address: quoteToken.address,
                      symbol: quoteToken.symbol,
                      name: quoteToken.name,
                      decimals: quoteToken.decimals,
                    }
                  : {
                      address: baseToken.address,
                      symbol: baseToken.symbol,
                      name: baseToken.name,
                      decimals: baseToken.decimals,
                    },
                fee: poolInfo.fee,
                liquidity: poolState.liquidity,
                sqrtPriceX96: poolState.sqrtPriceX96,
                reserve0: poolState.reserve0,
                reserve1: poolState.reserve1,
                lastUpdated: Date.now(),
                isActive: true,
              }]);
              
              this.progress.successful++;
              logger.debug(`Added pool: ${poolInfo.dexType} ${baseToken.symbol}/${quoteToken.symbol}`);
            } else {
              this.progress.skipped++;
            }
          } catch (error) {
            this.progress.failed++;
            logger.error(`Failed to fetch state for ${poolInfo.address}: ${error}`);
          }
          
          this.progress.processed++;
          
          // Log progress every 100 pools
          if (this.progress.processed % 100 === 0) {
            this.logProgress();
          }
        }
      }
    }

    this.logProgress();
    logger.info('Pool discovery completed');
  }

  /**
   * Get pool addresses from all 10 DEXs for a token pair
   */
  private async getAllDexPoolAddresses(
    baseToken: any,
    quoteToken: any
  ): Promise<Array<{
    address: string;
    dexType: string;
    dexVersion: string;
    fee?: number;
  }>> {
    const results: Array<{
      address: string;
      dexType: string;
      dexVersion: string;
      fee?: number;
    }> = [];

    // All 10 DEXs to check
    const dexConfigs = [
      { name: 'uniswapV4', version: 'v4' },
      { name: 'uniswapV3', version: 'v3' },
      { name: 'uniswapV2', version: 'v2' },
      { name: 'curve', version: 'v2' },
      { name: 'sushiswapV3', version: 'v3' },
      { name: 'pancakeswapV3', version: 'v3' },
      { name: 'aerodrome', version: 'v3' },
      { name: 'aerodromeSlipStream', version: 'v3' },
      { name: 'aerodromeSlipStream2', version: 'v3' },
      { name: 'baseSwap', version: 'v2' },
    ];

    for (const dexConfig of dexConfigs) {
      try {
        const address = await this.getPoolAddress(
          dexConfig.name,
          baseToken,
          quoteToken
        );
        
        if (address && address !== ethers.ZeroAddress) {
          results.push({
            address,
            dexType: dexConfig.name,
            dexVersion: dexConfig.version,
            fee: dexConfig.version === 'v3' ? 3000 : undefined, // Default 0.3% for V3
          });
        }
      } catch (error) {
        logger.debug(`Failed to get ${dexConfig.name} pool: ${error}`);
      }
    }

    return results;
  }

  /**
   * Get pool address from a specific DEX
   */
  private async getPoolAddress(
    dexName: string,
    tokenA: any,
    tokenB: any
  ): Promise<string | null> {
    const provider = this.rpcManager.getProvider();
    
    // Ensure proper token order (address0 < address1)
    const [token0, token1] = tokenA.address.toLowerCase() < tokenB.address.toLowerCase()
      ? [tokenA, tokenB]
      : [tokenB, tokenA];

    switch (dexName) {
      case 'uniswapV4':
        // V4 uses Pool Manager - returns pool ID not address
        return await this.getV4PoolId(token0, token1);
      
      case 'uniswapV3':
        return await this.getV3PoolAddress(token0, token1);
      
      case 'uniswapV2':
        return await this.getV2PoolAddress(token0, token1);
      
      case 'curve':
        return await this.getCurvePoolAddress(token0, token1);
      
      case 'sushiswapV3':
        return await this.getSushiSwapV3PoolAddress(token0, token1);
      
      case 'pancakeswapV3':
        return await this.getPancakeSwapV3PoolAddress(token0, token1);
      
      case 'aerodrome':
        return await this.getAerodromePoolAddress(token0, token1);
      
      case 'aerodromeSlipStream':
        return await this.getAerodromeSlipStreamPoolAddress(token0, token1);
      
      case 'aerodromeSlipStream2':
        return await this.getAerodromeSlipStream2PoolAddress(token0, token1);
      
      case 'baseSwap':
        return await this.getBaseSwapPoolAddress(token0, token1);
      
      default:
        logger.warn(`Unknown DEX: ${dexName}`);
        return null;
    }
  }

  /**
   * Get Uniswap V4 pool ID
   */
  private async getV4PoolId(token0: any, token1: any): Promise<string | null> {
    try {
      const provider = this.rpcManager.getProvider();
      
      // V4 uses Pool Manager singleton
      // For now, return null as V4 discovery requires complex event querying
      // This will be implemented separately with incremental block range queries
      return null;
    } catch (error) {
      logger.error(`Error getting V4 pool ID: ${error}`);
      return null;
    }
  }

  /**
   * Get Uniswap V3 pool address
   */
  private async getV3PoolAddress(token0: any, token1: any): Promise<string | null> {
    try {
      const provider = this.rpcManager.getProvider();
      const dexConfig = DEX_DISCOVERY_CONFIG.find(d => d.dexId === 'uniswap-v3');
      
      if (!dexConfig || !dexConfig.factory) {
        return null;
      }

      const factory = new ethers.Contract(
        dexConfig.factory,
        ['function getPool(address,address,uint24) external view returns (address)'],
        provider
      );

      // Try common fee tiers
      const feeTiers = [100, 500, 3000, 10000];
      
      for (const fee of feeTiers) {
        try {
          const poolAddress = await factory.getPool(token0.address, token1.address, fee);
          if (poolAddress !== ethers.ZeroAddress) {
            return poolAddress;
          }
        } catch (error) {
          continue;
        }
      }
      
      return null;
    } catch (error) {
      logger.error(`Error getting V3 pool address: ${error}`);
      return null;
    }
  }

  /**
   * Get Uniswap V2 pool address
   */
  private async getV2PoolAddress(token0: any, token1: any): Promise<string | null> {
    try {
      const provider = this.rpcManager.getProvider();
      const dexConfig = DEX_DISCOVERY_CONFIG.find(d => d.dexId === 'uniswap-v2');
      
      if (!dexConfig || !dexConfig.factory) {
        return null;
      }

      const factory = new ethers.Contract(
        dexConfig.factory,
        ['function getPair(address,address) external view returns (address)'],
        provider
      );

      const pairAddress = await factory.getPair(token0.address, token1.address);
      
      return pairAddress !== ethers.ZeroAddress ? pairAddress : null;
    } catch (error) {
      logger.error(`Error getting V2 pool address: ${error}`);
      return null;
    }
  }

  /**
   * Get Curve pool address
   */
  private async getCurvePoolAddress(token0: any, token1: any): Promise<string | null> {
    try {
      const provider = this.rpcManager.getProvider();
      const dexConfig = DEX_DISCOVERY_CONFIG.find(d => d.dexId === 'curve');
      
      if (!dexConfig || !dexConfig.factory) {
        return null;
      }

      const factory = new ethers.Contract(
        dexConfig.factory,
        [
          'function find_pool_for_coins(address,address) external view returns (address)',
          'function get_pool_from_lp_address(address) external view returns (address)'
        ],
        provider
      );

      try {
        const poolAddress = await factory.find_pool_for_coins(token0.address, token1.address);
        if (poolAddress && poolAddress !== ethers.ZeroAddress) {
          return poolAddress;
        }
      } catch (error) {
        // Curve may not have a pool for this pair
      }
      
      return null;
    } catch (error) {
      logger.error(`Error getting Curve pool address: ${error}`);
      return null;
    }
  }

  /**
   * Get SushiSwap V3 pool address
   */
  private async getSushiSwapV3PoolAddress(token0: any, token1: any): Promise<string | null> {
    try {
      const provider = this.rpcManager.getProvider();
      const dexConfig = DEX_DISCOVERY_CONFIG.find(d => d.dexId === 'sushiswap-v3');
      
      if (!dexConfig || !dexConfig.factory) {
        return null;
      }

      const factory = new ethers.Contract(
        dexConfig.factory,
        ['function getPool(address,address,uint24) external view returns (address)'],
        provider
      );

      const feeTiers = [100, 500, 3000, 10000];
      
      for (const fee of feeTiers) {
        try {
          const poolAddress = await factory.getPool(token0.address, token1.address, fee);
          if (poolAddress !== ethers.ZeroAddress) {
            return poolAddress;
          }
        } catch (error) {
          continue;
        }
      }
      
      return null;
    } catch (error) {
      logger.error(`Error getting SushiSwap V3 pool address: ${error}`);
      return null;
    }
  }

  /**
   * Get PancakeSwap V3 pool address
   */
  private async getPancakeSwapV3PoolAddress(token0: any, token1: any): Promise<string | null> {
    try {
      const provider = this.rpcManager.getProvider();
      const dexConfig = DEX_DISCOVERY_CONFIG.find(d => d.dexId === 'pancakeswap-v3');
      
      if (!dexConfig || !dexConfig.factory) {
        return null;
      }

      const factory = new ethers.Contract(
        dexConfig.factory,
        ['function getPool(address,address,uint24) external view returns (address)'],
        provider
      );

      const feeTiers = [100, 500, 2500, 10000];
      
      for (const fee of feeTiers) {
        try {
          const poolAddress = await factory.getPool(token0.address, token1.address, fee);
          if (poolAddress !== ethers.ZeroAddress) {
            return poolAddress;
          }
        } catch (error) {
          continue;
        }
      }
      
      return null;
    } catch (error) {
      logger.error(`Error getting PancakeSwap V3 pool address: ${error}`);
      return null;
    }
  }

  /**
   * Get Aerodrome pool address
   */
  private async getAerodromePoolAddress(token0: any, token1: any): Promise<string | null> {
    try {
      const provider = this.rpcManager.getProvider();
      const dexConfig = DEX_DISCOVERY_CONFIG.find(d => d.dexId === 'aerodrome');
      
      if (!dexConfig || !dexConfig.factory) {
        return null;
      }

      const factory = new ethers.Contract(
        dexConfig.factory,
        ['function getPool(address,address,uint24) external view returns (address)'],
        provider
      );

      const feeTiers = [100, 500, 3000, 10000];
      
      for (const fee of feeTiers) {
        try {
          const poolAddress = await factory.getPool(token0.address, token1.address, fee);
          if (poolAddress !== ethers.ZeroAddress) {
            return poolAddress;
          }
        } catch (error) {
          continue;
        }
      }
      
      return null;
    } catch (error) {
      logger.error(`Error getting Aerodrome pool address: ${error}`);
      return null;
    }
  }

  /**
   * Get Aerodrome SlipStream pool address
   */
  private async getAerodromeSlipStreamPoolAddress(token0: any, token1: any): Promise<string | null> {
    try {
      const provider = this.rpcManager.getProvider();
      const dexConfig = DEX_DISCOVERY_CONFIG.find(d => d.dexId === 'aerodrome-slipstream');
      
      if (!dexConfig || !dexConfig.factory) {
        return null;
      }

      const factory = new ethers.Contract(
        dexConfig.factory,
        ['function getPool(address,address,uint24) external view returns (address)'],
        provider
      );

      const feeTiers = [100, 500, 3000, 10000];
      
      for (const fee of feeTiers) {
        try {
          const poolAddress = await factory.getPool(token0.address, token1.address, fee);
          if (poolAddress !== ethers.ZeroAddress) {
            return poolAddress;
          }
        } catch (error) {
          continue;
        }
      }
      
      return null;
    } catch (error) {
      logger.error(`Error getting Aerodrome SlipStream pool address: ${error}`);
      return null;
    }
  }

  /**
   * Get Aerodrome SlipStream 2 pool address
   */
  private async getAerodromeSlipStream2PoolAddress(token0: any, token1: any): Promise<string | null> {
    try {
      const provider = this.rpcManager.getProvider();
      const dexConfig = DEX_DISCOVERY_CONFIG.find(d => d.dexId === 'aerodrome-slipstream-2');
      
      if (!dexConfig || !dexConfig.factory) {
        return null;
      }

      const factory = new ethers.Contract(
        dexConfig.factory,
        ['function getPool(address,address,uint24) external view returns (address)'],
        provider
      );

      const feeTiers = [100, 500, 3000, 10000];
      
      for (const fee of feeTiers) {
        try {
          const poolAddress = await factory.getPool(token0.address, token1.address, fee);
          if (poolAddress !== ethers.ZeroAddress) {
            return poolAddress;
          }
        } catch (error) {
          continue;
        }
      }
      
      return null;
    } catch (error) {
      logger.error(`Error getting Aerodrome SlipStream 2 pool address: ${error}`);
      return null;
    }
  }

  /**
   * Get BaseSwap pool address
   */
  private async getBaseSwapPoolAddress(token0: any, token1: any): Promise<string | null> {
    try {
      const provider = this.rpcManager.getProvider();
      const dexConfig = DEX_DISCOVERY_CONFIG.find(d => d.dexId === 'baseswap');
      
      if (!dexConfig || !dexConfig.factory) {
        return null;
      }

      const factory = new ethers.Contract(
        dexConfig.factory,
        ['function getPair(address,address) external view returns (address)'],
        provider
      );

      const pairAddress = await factory.getPair(token0.address, token1.address);
      
      return pairAddress !== ethers.ZeroAddress ? pairAddress : null;
    } catch (error) {
      logger.error(`Error getting BaseSwap pool address: ${error}`);
      return null;
    }
  }

  /**
   * Get pool state from a specific DEX
   */
  private async getPoolState(
    dexType: string,
    poolAddress: string
  ): Promise<{
    liquidity?: bigint;
    sqrtPriceX96?: bigint;
    reserve0?: bigint;
    reserve1?: bigint;
  } | null> {
    const provider = this.rpcManager.getProvider();

    try {
      switch (dexType) {
        case 'uniswapV4':
          return await this.getV4PoolState(poolAddress);
        
        case 'uniswapV3':
        case 'sushiswapV3':
        case 'pancakeswapV3':
        case 'aerodrome':
        case 'aerodromeSlipStream':
        case 'aerodromeSlipStream2':
          return await this.getV3PoolState(poolAddress);
        
        case 'uniswapV2':
        case 'baseSwap':
          return await this.getV2PoolState(poolAddress);
        
        case 'curve':
          return await this.getCurvePoolState(poolAddress);
        
        default:
          logger.warn(`Unknown DEX type for state: ${dexType}`);
          return null;
      }
    } catch (error) {
      logger.error(`Error getting ${dexType} pool state: ${error}`);
      return null;
    }
  }

  /**
   * Get V3 pool state
   */
  private async getV3PoolState(poolAddress: string): Promise<{
    liquidity?: bigint;
    sqrtPriceX96?: bigint;
    reserve0?: bigint;
    reserve1?: bigint;
  } | null> {
    try {
      const provider = this.rpcManager.getProvider();
      
      const pool = new ethers.Contract(
        poolAddress,
        [
          'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
          'function liquidity() external view returns (uint128)',
          'function token0() external view returns (address)',
          'function token1() external view returns (address)'
        ],
        provider
      );

      const [slot0, liquidity] = await Promise.all([
        pool.slot0(),
        pool.liquidity()
      ]);

      return {
        sqrtPriceX96: slot0.sqrtPriceX96,
        liquidity: liquidity,
      };
    } catch (error) {
      logger.error(`Error getting V3 pool state for ${poolAddress}: ${error}`);
      return null;
    }
  }

  /**
   * Get V2 pool state
   */
  private async getV2PoolState(poolAddress: string): Promise<{
    liquidity?: bigint;
    sqrtPriceX96?: bigint;
    reserve0?: bigint;
    reserve1?: bigint;
  } | null> {
    try {
      const provider = this.rpcManager.getProvider();
      
      const pair = new ethers.Contract(
        poolAddress,
        [
          'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
          'function token0() external view returns (address)',
          'function token1() external view returns (address)'
        ],
        provider
      );

      const reserves = await pair.getReserves();

      return {
        reserve0: reserves.reserve0,
        reserve1: reserves.reserve1,
      };
    } catch (error) {
      logger.error(`Error getting V2 pool state for ${poolAddress}: ${error}`);
      return null;
    }
  }

  /**
   * Get V4 pool state
   */
  private async getV4PoolState(poolAddress: string): Promise<{
    liquidity?: bigint;
    sqrtPriceX96?: bigint;
    reserve0?: bigint;
    reserve1?: bigint;
  } | null> {
    // V4 pool state fetching requires StateView contract
    // For now, return null as this needs separate implementation
    return null;
  }

  /**
   * Get Curve pool state
   */
  private async getCurvePoolState(poolAddress: string): Promise<{
    liquidity?: bigint;
    sqrtPriceX96?: bigint;
    reserve0?: bigint;
    reserve1?: bigint;
  } | null> {
    try {
      const provider = this.rpcManager.getProvider();
      
      const pool = new ethers.Contract(
        poolAddress,
        [
          'function balances(uint256) external view returns (uint256)',
          'function get_balances() external view returns (uint256[2])',
          'function coins(uint256) external view returns (address)'
        ],
        provider
      );

      const balances = await pool.get_balances();

      return {
        reserve0: balances[0],
        reserve1: balances[1],
      };
    } catch (error) {
      logger.error(`Error getting Curve pool state for ${poolAddress}: ${error}`);
      return null;
    }
  }

  /**
   * Log progress
   */
  private logProgress(): void {
    const elapsed = Date.now() - this.progress.startTime.getTime();
    const elapsedSeconds = Math.floor(elapsed / 1000);
    const perSecond = Math.floor(this.progress.processed / elapsedSeconds) || 0;
    const remaining = this.progress.totalPairs - this.progress.processed;
    const eta = perSecond > 0 ? Math.floor(remaining / perSecond) : 0;

    logger.info(`Progress: ${this.progress.processed}/${this.progress.totalPairs} ` +
      `(✓${this.progress.successful} ✗${this.progress.failed} ⊘${this.progress.skipped}) ` +
      `${perSecond}/s ETA: ${Math.floor(eta / 60)}m ${eta % 60}s`);
  }

  /**
   * Get discovery statistics
   */
  getStats(): DiscoveryProgress {
    return { ...this.progress };
  }
}