/**
 * Factory-Based Pool Fetcher
 * 
 * Queries DEX factory contracts directly to discover pool addresses
 * Implements pool validation and state fetching
 */

import { ethers } from 'ethers';
import { Token, PoolState } from '../../types/index';
import { RPC_CONFIG } from '../../config/constants';

// Factory contract ABIs
const UNISWAP_V2_FACTORY_ABI = [
  'function getPair(address tokenA, address tokenB) external view returns (address pair)',
  'function allPairs(uint256) external view returns (address)'
];

const UNISWAP_V3_FACTORY_ABI = [
  'function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)'
];

const CURVE_FACTORY_ABI = [
  'function find_pool_for_coins(address _coin0, address _coin1) external view returns (address)',
  'function get_n_coins(address _pool) external view returns (uint256, address[8])'
];

// Pool contract ABIs for state fetching
const UNISWAP_V2_POOL_ABI = [
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function totalSupply() external view returns (uint256)'
];

const UNISWAP_V3_POOL_ABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() external view returns (uint128)',
  'function fee() external view returns (uint24)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)'
];

export interface FactoryConfig {
  name: string;
  factoryAddress: string;
  factoryType: 'v2' | 'v3' | 'curve';
  feeTiers?: number[]; // For V3 factories
}

export interface DiscoveredPool {
  address: string;
  dex: string;
  dexVersion: string;
  token0: Token;
  token1: Token;
  fee?: number;
}

export interface PoolValidationResult {
  isValid: boolean;
  exists: boolean;
  hasValidABI: boolean;
  hasLiquidity: boolean;
  state?: PoolState;
  error?: string;
}

export class FactoryPoolFetcher {
  private provider: ethers.JsonRpcProvider;
  private factoryContracts: Map<string, ethers.Contract> = new Map();
  private poolContracts: Map<string, ethers.Contract> = new Map();

  constructor(private readonly rpcUrl: string = 'https://mainnet.base.org') {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
  }

  /**
   * Initialize factory contracts
   */
  async initialize(): Promise<void> {
    console.log('🏭 Initializing FactoryPoolFetcher...');
    // Factories will be initialized as needed
  }

  /**
   * Get or create factory contract
   */
  private getFactoryContract(config: FactoryConfig): ethers.Contract {
    if (this.factoryContracts.has(config.factoryAddress)) {
      return this.factoryContracts.get(config.factoryAddress)!;
    }

    let abi;
    switch (config.factoryType) {
      case 'v2':
        abi = UNISWAP_V2_FACTORY_ABI;
        break;
      case 'v3':
        abi = UNISWAP_V3_FACTORY_ABI;
        break;
      case 'curve':
        abi = CURVE_FACTORY_ABI;
        break;
      default:
        throw new Error(`Unknown factory type: ${config.factoryType}`);
    }

    const contract = new ethers.Contract(config.factoryAddress, abi, this.provider);
    this.factoryContracts.set(config.factoryAddress, contract);
    return contract;
  }

  /**
   * Discover V2 pool from factory
   */
  async discoverV2Pool(
    factory: FactoryConfig,
    tokenA: Token,
    tokenB: Token
  ): Promise<DiscoveredPool | null> {
    try {
      const contract = this.getFactoryContract(factory);
      const poolAddress = await contract.getPair(tokenA.address, tokenB.address);

      // Check if pool address is valid (not zero address)
      if (poolAddress === ethers.ZeroAddress) {
        return null;
      }

      // Sort tokens to ensure consistent ordering
      const sortedTokens = [tokenA, tokenB].sort((a, b) => 
        a.address.toLowerCase().localeCompare(b.address.toLowerCase())
      );

      return {
        address: poolAddress,
        dex: factory.name,
        dexVersion: 'v2',
        token0: sortedTokens[0],
        token1: sortedTokens[1],
      };
    } catch (error) {
      console.error(`Error discovering V2 pool for ${tokenA.symbol}/${tokenB.symbol}:`, error);
      return null;
    }
  }

  /**
   * Discover V3 pool from factory
   */
  async discoverV3Pool(
    factory: FactoryConfig,
    tokenA: Token,
    tokenB: Token,
    fee: number
  ): Promise<DiscoveredPool | null> {
    try {
      const contract = this.getFactoryContract(factory);
      const poolAddress = await contract.getPool(tokenA.address, tokenB.address, fee);

      // Check if pool address is valid (not zero address)
      if (poolAddress === ethers.ZeroAddress) {
        return null;
      }

      // Sort tokens to ensure consistent ordering
      const sortedTokens = [tokenA, tokenB].sort((a, b) => 
        a.address.toLowerCase().localeCompare(b.address.toLowerCase())
      );

      return {
        address: poolAddress,
        dex: factory.name,
        dexVersion: 'v3',
        token0: sortedTokens[0],
        token1: sortedTokens[1],
        fee: fee,
      };
    } catch (error) {
      console.error(`Error discovering V3 pool for ${tokenA.symbol}/${tokenB.symbol}:`, error);
      return null;
    }
  }

  /**
   * Discover Curve pool from factory
   */
  async discoverCurvePool(
    factory: FactoryConfig,
    tokenA: Token,
    tokenB: Token
  ): Promise<DiscoveredPool | null> {
    try {
      const contract = this.getFactoryContract(factory);
      const poolAddress = await contract.find_pool_for_coins(tokenA.address, tokenB.address);

      // Check if pool address is valid (not zero address)
      if (poolAddress === ethers.ZeroAddress) {
        return null;
      }

      return {
        address: poolAddress,
        dex: factory.name,
        dexVersion: 'curve',
        token0: tokenA,
        token1: tokenB,
      };
    } catch (error) {
      console.error(`Error discovering Curve pool for ${tokenA.symbol}/${tokenB.symbol}:`, error);
      return null;
    }
  }

  /**
   * Discover all pools for a token pair across all fee tiers
   */
  async discoverAllPoolsForPair(
    factory: FactoryConfig,
    tokenA: Token,
    tokenB: Token
  ): Promise<DiscoveredPool[]> {
    const pools: DiscoveredPool[] = [];

    if (factory.factoryType === 'v2' || factory.factoryType === 'curve') {
      const pool = factory.factoryType === 'v2'
        ? await this.discoverV2Pool(factory, tokenA, tokenB)
        : await this.discoverCurvePool(factory, tokenA, tokenB);
      
      if (pool) {
        pools.push(pool);
      }
    } else if (factory.factoryType === 'v3' && factory.feeTiers) {
      for (const fee of factory.feeTiers) {
        const pool = await this.discoverV3Pool(factory, tokenA, tokenB, fee);
        if (pool) {
          pools.push(pool);
        }
      }
    }

    return pools;
  }

  /**
   * Check if a pool exists on chain
   */
  async checkPoolExists(poolAddress: string): Promise<boolean> {
    try {
      const code = await this.provider.getCode(poolAddress);
      return code !== '0x';
    } catch (error) {
      return false;
    }
  }

  /**
   * Fetch V2 pool state
   */
  async fetchV2PoolState(poolAddress: string): Promise<PoolState | null> {
    try {
      const contract = new ethers.Contract(poolAddress, UNISWAP_V2_POOL_ABI, this.provider);
      
      const [reserves, token0Address, token1Address] = await Promise.all([
        contract.getReserves(),
        contract.token0(),
        contract.token1(),
      ]);

      return {
        dex: 'unknown',
        address: poolAddress,
        version: 'v2',
        token0: {
          address: token0Address,
          symbol: '',
          name: '',
          decimals: 18,
        },
        token1: {
          address: token1Address,
          symbol: '',
          name: '',
          decimals: 18,
        },
        reserve0: BigInt(reserves[0]),
        reserve1: BigInt(reserves[1]),
        fee: 300, // Default V2 fee
      };
    } catch (error) {
      console.error(`Error fetching V2 state for ${poolAddress}:`, error);
      return null;
    }
  }

  /**
   * Fetch V3 pool state
   */
  async fetchV3PoolState(poolAddress: string): Promise<PoolState | null> {
    try {
      const contract = new ethers.Contract(poolAddress, UNISWAP_V3_POOL_ABI, this.provider);
      
      const [slot0, liquidity, token0Address, token1Address] = await Promise.all([
        contract.slot0(),
        contract.liquidity(),
        contract.token0(),
        contract.token1(),
      ]);

      return {
        dex: 'unknown',
        address: poolAddress,
        version: 'v3',
        token0: {
          address: token0Address,
          symbol: '',
          name: '',
          decimals: 18,
        },
        token1: {
          address: token1Address,
          symbol: '',
          name: '',
          decimals: 18,
        },
        sqrtPriceX96: BigInt(slot0[0]),
        tick: Number(slot0[1]),
        liquidity: BigInt(liquidity),
        fee: 300, // Will be updated with actual fee
      };
    } catch (error) {
      console.error(`Error fetching V3 state for ${poolAddress}:`, error);
      return null;
    }
  }

  /**
   * Validate pool and fetch state
   */
  async validateAndFetchPoolState(
    discoveredPool: DiscoveredPool
  ): Promise<PoolValidationResult> {
    const result: PoolValidationResult = {
      isValid: false,
      exists: false,
      hasValidABI: false,
      hasLiquidity: false,
    };

    // Check if pool exists
    const exists = await this.checkPoolExists(discoveredPool.address);
    if (!exists) {
      result.error = 'Pool does not exist on chain';
      return result;
    }
    result.exists = true;

    // Try to fetch state based on pool version
    let state: PoolState | null;
    if (discoveredPool.dexVersion === 'v2') {
      state = await this.fetchV2PoolState(discoveredPool.address);
    } else if (discoveredPool.dexVersion === 'v3') {
      state = await this.fetchV3PoolState(discoveredPool.address);
    } else if (discoveredPool.dexVersion === 'curve') {
      // Curve pools not yet implemented
      result.error = 'Curve pools not yet supported';
      return result;
    } else {
      result.error = `Unsupported pool version: ${discoveredPool.dexVersion}`;
      return result;
    }

    if (!state) {
      result.error = 'Failed to fetch pool state (invalid ABI)';
      return result;
    }
    result.hasValidABI = true;

    // Check if pool has liquidity
    const hasLiquidity = discoveredPool.dexVersion === 'v2'
      ? (state.reserve0 !== undefined && (state.reserve0 > 0n || state.reserve1! > 0n))
      : (state.liquidity !== undefined && state.liquidity > 0n);

    if (!hasLiquidity) {
      result.error = 'Pool has no liquidity';
      return result;
    }
    result.hasLiquidity = true;

    // All checks passed
    result.isValid = true;
    result.state = state;
    return result;
  }

  /**
   * Discover and validate pools for multiple token pairs
   */
  async discoverAndValidatePools(
    factoryConfigs: FactoryConfig[],
    tokens: Token[],
    options: {
      batchSize?: number;
      delayBetweenBatches?: number;
    } = {}
  ): Promise<DiscoveredPool[]> {
    const {
      batchSize = 50,
      delayBetweenBatches = 100,
    } = options;

    const validPools: DiscoveredPool[] = [];
    let processed = 0;
    const totalPairs = (tokens.length * (tokens.length - 1)) / 2;

    console.log(`🔍 Discovering ${totalPairs} token pairs across ${factoryConfigs.length} factories...`);

    // Process tokens in batches
    for (let i = 0; i < tokens.length; i++) {
      for (let j = i + 1; j < tokens.length; j++) {
        const tokenA = tokens[i];
        const tokenB = tokens[j];

        for (const factory of factoryConfigs) {
          // Discover pool
          const pools = await this.discoverAllPoolsForPair(factory, tokenA, tokenB);

          for (const pool of pools) {
            // Validate pool
            const validation = await this.validateAndFetchPoolState(pool);

            if (validation.isValid && validation.state) {
              console.log(`✅ Valid pool found: ${pool.dex} ${tokenA.symbol}/${tokenB.symbol}`);
              validPools.push({
                ...pool,
                // Add state data to pool
              } as any);
            } else {
              console.log(`⏭️  Skipping pool: ${pool.dex} ${tokenA.symbol}/${tokenB.symbol} - ${validation.error}`);
            }
          }

          processed++;

          // Delay between batches
          if (processed % batchSize === 0) {
            console.log(`📊 Processed ${processed}/${totalPairs} pairs...`);
            await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
          }
        }
      }
    }

    console.log(`\n✨ Discovery complete: ${validPools.length} valid pools found`);
    return validPools;
  }
}