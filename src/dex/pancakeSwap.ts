import { ethers } from 'ethers';
import { PoolState, Token } from '../types';
import { DEX_CONFIG } from '../config/constants';

// PancakeSwap V3 Pool ABI (same as Uniswap V3)
const V3_POOL_ABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() external view returns (uint128)',
  'function fee() external view returns (uint24)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
];

// PancakeSwap V3 Quoter ABI
const V3_QUOTER_ABI = [
  'function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)',
];

// PancakeSwap V2 Pair ABI (same as Uniswap V2)
const V2_PAIR_ABI = [
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
];

// PancakeSwap V2 Router ABI
const V2_ROUTER_ABI = [
  'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)',
];

/**
 * PancakeSwap V3 Pool Interface
 */
export class PancakeSwapV3Pool {
  private provider: ethers.JsonRpcProvider;
  private poolAddress: string;
  private poolContract: ethers.Contract;
  private quoterContract: ethers.Contract;

  constructor(provider: ethers.JsonRpcProvider, poolAddress: string) {
    this.provider = provider;
    this.poolAddress = poolAddress;
    this.poolContract = new ethers.Contract(poolAddress, V3_POOL_ABI, provider);
    this.quoterContract = new ethers.Contract(
      DEX_CONFIG.pancakeSwapV3.quoter,
      V3_QUOTER_ABI,
      provider
    );
  }

  /**
   * Get pool state at a specific block
   */
  async getPoolState(blockTag: ethers.BlockTag = 'latest'): Promise<PoolState> {
    const [slot0, liquidity, fee, token0, token1] = await Promise.all([
      this.poolContract.slot0({ blockTag }),
      this.poolContract.liquidity({ blockTag }),
      this.poolContract.fee({ blockTag }),
      this.poolContract.token0({ blockTag }),
      this.poolContract.token1({ blockTag }),
    ]);

    return {
      dex: 'pancakeswap-v3',
      address: this.poolAddress,
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
      sqrtPriceX96: BigInt(slot0.sqrtPriceX96.toString()),
      liquidity: BigInt(liquidity.toString()),
      fee: parseInt(fee.toString()),
      tick: parseInt(slot0.tick.toString()),
      version: 'v3',
    };
  }

  /**
   * Quote a swap through the pool
   */
  async quoteSwap(
    tokenIn: Token,
    tokenOut: Token,
    amountIn: bigint,
    sqrtPriceLimitX96: bigint = 0n
  ): Promise<bigint> {
    try {
      const amountOut = await this.quoterContract.quoteExactInputSingle(
        tokenIn.address,
        tokenOut.address,
        this.poolContract.fee(),
        amountIn,
        sqrtPriceLimitX96
      );
      return BigInt(amountOut.toString());
    } catch (error) {
      console.error('PancakeSwap V3 quote swap error:', error);
      return 0n;
    }
  }

  /**
   * Calculate output amount for a swap (off-chain calculation)
   */
  calculateOutputAmount(
    amountIn: bigint,
    sqrtPriceX96: bigint,
    liquidity: bigint,
    tokenInIsToken0: boolean
  ): bigint {
    const Q96 = BigInt(2) ** BigInt(96);
    const price = (sqrtPriceX96 * sqrtPriceX96) / Q96;
    
    if (tokenInIsToken0) {
      const liquidityInvariant = liquidity * Q96 / sqrtPriceX96;
      const newLiquidity = liquidityInvariant - amountIn;
      const newSqrtPriceX96 = liquidity * Q96 / newLiquidity;
      const amountOut = liquidity * (sqrtPriceX96 - newSqrtPriceX96) / Q96;
      return amountOut;
    } else {
      const liquidityInvariant = liquidity * sqrtPriceX96 / Q96;
      const newLiquidity = liquidityInvariant - amountIn;
      const newSqrtPriceX96 = newLiquidity * Q96 / liquidity;
      const amountOut = liquidity * (newSqrtPriceX96 - sqrtPriceX96) / newSqrtPriceX96;
      return amountOut;
    }
  }
}

/**
 * PancakeSwap V2 Pair Interface
 */
export class PancakeSwapV2Pair {
  private provider: ethers.JsonRpcProvider;
  private pairAddress: string;
  private pairContract: ethers.Contract;
  private routerContract: ethers.Contract;

  constructor(provider: ethers.JsonRpcProvider, pairAddress: string) {
    this.provider = provider;
    this.pairAddress = pairAddress;
    this.pairContract = new ethers.Contract(pairAddress, V2_PAIR_ABI, provider);
    this.routerContract = new ethers.Contract(
      DEX_CONFIG.baseSwap.router,
      V2_ROUTER_ABI,
      provider
    );
  }

  /**
   * Get pool state at a specific block
   */
  async getPoolState(blockTag: ethers.BlockTag = 'latest'): Promise<PoolState> {
    const [reserves, token0, token1] = await Promise.all([
      this.pairContract.getReserves({ blockTag }),
      this.pairContract.token0({ blockTag }),
      this.pairContract.token1({ blockTag }),
    ]);

    return {
      dex: 'pancakeswap-v2',
      address: this.pairAddress,
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
      reserve0: BigInt(reserves.reserve0.toString()),
      reserve1: BigInt(reserves.reserve1.toString()),
      fee: 2500, // 0.25% standard fee
      version: 'v2',
    };
  }

  /**
   * Quote a swap through the pair
   */
  async quoteSwap(
    tokenIn: Token,
    tokenOut: Token,
    amountIn: bigint
  ): Promise<bigint> {
    try {
      const amounts = await this.routerContract.getAmountsOut(
        amountIn,
        [tokenIn.address, tokenOut.address]
      );
      return BigInt(amounts[1].toString());
    } catch (error) {
      console.error('PancakeSwap V2 quote swap error:', error);
      return 0n;
    }
  }

  /**
   * Calculate output amount using constant product formula
   */
  calculateOutputAmount(
    amountIn: bigint,
    reserveIn: bigint,
    reserveOut: bigint,
    fee: number = 0.0025
  ): bigint {
    const feeMultiplier = (1 - fee) * 1000000;
    const amountInWithFee = (amountIn * BigInt(Math.floor(feeMultiplier))) / BigInt(1000000);
    const numerator = reserveOut * amountInWithFee;
    const denominator = reserveIn + amountInWithFee;
    
    return numerator / denominator;
  }
}

/**
 * PancakeSwap V3 Factory Interface
 */
export class PancakeSwapV3Factory {
  private provider: ethers.JsonRpcProvider;
  private factoryAddress: string;
  private factoryContract: ethers.Contract;

  constructor(provider: ethers.JsonRpcProvider, factoryAddress?: string) {
    this.provider = provider;
    this.factoryAddress = factoryAddress || DEX_CONFIG.pancakeSwapV3.factory;
    
    const FACTORY_ABI = [
      'function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)',
    ];
    
    this.factoryContract = new ethers.Contract(
      this.factoryAddress,
      FACTORY_ABI,
      provider
    );
  }

  /**
   * Get pool address for a token pair and fee tier
   */
  async getPool(tokenA: string, tokenB: string, fee: number): Promise<string> {
    const poolAddress = await this.factoryContract.getPool(tokenA, tokenB, fee);
    return poolAddress;
  }

  /**
   * Check if a pool exists
   */
  async poolExists(tokenA: string, tokenB: string, fee: number): Promise<boolean> {
    const poolAddress = await this.getPool(tokenA, tokenB, fee);
    return poolAddress !== ethers.ZeroAddress;
  }
}

/**
 * PancakeSwap V2 Factory Interface
 */
export class PancakeSwapV2Factory {
  private provider: ethers.JsonRpcProvider;
  private factoryAddress: string;
  private factoryContract: ethers.Contract;

  constructor(provider: ethers.JsonRpcProvider, factoryAddress?: string) {
    this.provider = provider;
    this.factoryAddress = factoryAddress || DEX_CONFIG.baseSwap.factory;
    
    const FACTORY_ABI = [
      'function getPair(address tokenA, address tokenB) external view returns (address pair)',
      'function allPairsLength() external view returns (uint)',
    ];
    
    this.factoryContract = new ethers.Contract(
      this.factoryAddress,
      FACTORY_ABI,
      provider
    );
  }

  /**
   * Get pair address for a token pair
   */
  async getPair(tokenA: string, tokenB: string): Promise<string> {
    const pairAddress = await this.factoryContract.getPair(tokenA, tokenB);
    return pairAddress;
  }

  /**
   * Check if a pair exists
   */
  async pairExists(tokenA: string, tokenB: string): Promise<boolean> {
    const pairAddress = await this.getPair(tokenA, tokenB);
    return pairAddress !== ethers.ZeroAddress;
  }
}