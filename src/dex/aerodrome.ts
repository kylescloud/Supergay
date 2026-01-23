import { ethers } from 'ethers';
import { PoolState, Token } from '../types';
import { DEX_CONFIG } from '../config/constants';

// Aerodrome Pool ABI (similar to Uniswap V3)
const POOL_ABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() external view returns (uint128)',
  'function fee() external view returns (uint24)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function ticks(int24 tick) external view returns (uint128 liquidityGross, int128 liquidityNet, uint256 feeGrowthOutside0X128, uint256 feeGrowthOutside1X128, int56 tickCumulativeOutside, uint160 secondsPerLiquidityOutsideX128, uint32 secondsOutside, bool initialized)',
];

// Aerodrome Router ABI
const ROUTER_ABI = [
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)',
  'function exactInput((bytes path, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum)) external payable returns (uint256 amountOut)',
];

/**
 * Aerodrome Pool Interface
 * 
 * Aerodrome is a DEX on Base that uses concentrated liquidity
 * similar to Uniswap V3.
 */
export class AerodromePool {
  private provider: ethers.JsonRpcProvider;
  private poolAddress: string;
  private poolContract: ethers.Contract;
  private routerContract: ethers.Contract;

  constructor(provider: ethers.JsonRpcProvider, poolAddress: string) {
    this.provider = provider;
    this.poolAddress = poolAddress;
    this.poolContract = new ethers.Contract(poolAddress, POOL_ABI, provider);
    this.routerContract = new ethers.Contract(
      DEX_CONFIG.aerodrome.router,
      ROUTER_ABI,
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
      dex: 'aerodrome',
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
      const fee = await this.poolContract.fee();
      
      const params = {
        tokenIn: tokenIn.address,
        tokenOut: tokenOut.address,
        fee: fee,
        recipient: ethers.ZeroAddress,
        deadline: Math.floor(Date.now() / 1000) + 300,
        amountIn: amountIn,
        amountOutMinimum: 0n,
        sqrtPriceLimitX96: sqrtPriceLimitX96,
      };

      const amountOut = await this.routerContract.exactInputSingle.staticCall(params);
      return BigInt(amountOut.toString());
    } catch (error) {
      console.error('Aerodrome quote swap error:', error);
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
    // Similar to Uniswap V3 calculation
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

  /**
   * Build swap transaction data
   */
  buildSwapData(
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    recipient: string,
    minAmountOut: bigint,
    fee: number
  ): string {
    const params = {
      tokenIn: tokenIn,
      tokenOut: tokenOut,
      fee: fee,
      recipient: recipient,
      deadline: Math.floor(Date.now() / 1000) + 300,
      amountIn: amountIn,
      amountOutMinimum: minAmountOut,
      sqrtPriceLimitX96: 0n,
    };

    return this.routerContract.interface.encodeFunctionData('exactInputSingle', [params]);
  }

  /**
   * Estimate gas for swap
   */
  async estimateGas(
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    fee: number
  ): Promise<number> {
    try {
      const swapData = this.buildSwapData(
        tokenIn,
        tokenOut,
        amountIn,
        ethers.ZeroAddress,
        0n,
        fee
      );

      const gasEstimate = await this.routerContract.exactInputSingle.estimateGas({
        tokenIn: tokenIn,
        tokenOut: tokenOut,
        fee: fee,
        recipient: ethers.ZeroAddress,
        deadline: Math.floor(Date.now() / 1000) + 300,
        amountIn: amountIn,
        amountOutMinimum: 0n,
        sqrtPriceLimitX96: 0n,
      });

      return Number(gasEstimate) || 150000;
    } catch (error) {
      return 150000; // Default gas estimate
    }
  }
}

/**
 * Aerodrome Factory Interface
 */
export class AerodromeFactory {
  private provider: ethers.JsonRpcProvider;
  private factoryAddress: string;
  private factoryContract: ethers.Contract;

  constructor(provider: ethers.JsonRpcProvider, factoryAddress?: string) {
    this.provider = provider;
    this.factoryAddress = factoryAddress || DEX_CONFIG.aerodrome.factory;
    
    const FACTORY_ABI = [
      'function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)',
      'function createPool(address tokenA, address tokenB, uint24 fee) external returns (address pool)',
      'function getPair(address tokenA, address tokenB) external view returns (address pair)',
      'function allPairs(uint) external view returns (address pair)',
      'function allPairsLength() external view returns (uint)',
    ];
    
    this.factoryContract = new ethers.Contract(
      this.factoryAddress,
      FACTORY_ABI,
      provider
    );
  }

  /**
   * Get pool address for a token pair and fee tier (V3-style)
   */
  async getPool(tokenA: string, tokenB: string, fee: number): Promise<string> {
    const poolAddress = await this.factoryContract.getPool(tokenA, tokenB, fee);
    return poolAddress;
  }

  /**
   * Get pair address for a token pair (V2-style)
   */
  async getPair(tokenA: string, tokenB: string): Promise<string> {
    const pairAddress = await this.factoryContract.getPair(tokenA, tokenB);
    return pairAddress;
  }

  /**
   * Check if a pool exists
   */
  async poolExists(tokenA: string, tokenB: string, fee: number): Promise<boolean> {
    const poolAddress = await this.getPool(tokenA, tokenB, fee);
    return poolAddress !== ethers.ZeroAddress;
  }

  /**
   * Compute pool address (same as Uniswap V3)
   */
  static getPoolAddress(
    factory: string,
    token0: string,
    token1: string,
    fee: number
  ): string {
    const poolInitCodeHash = '0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54';
    const types = ['address', 'address', 'uint24'];
    const values = [token0.toLowerCase(), token1.toLowerCase(), fee];
    
    const sortedTokens = [values[0], values[1]].sort();
    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(types, sortedTokens);
    const salt = ethers.keccak256(encoded).slice(2);
    
    // RLP encode manually
    const rlpEncode = (items: any[]): string => {
      const encodeItem = (item: any): string => {
        if (typeof item === 'string' && item.startsWith('0x')) {
          const len = (item.length - 2) / 2;
          if (len <= 55) {
            return (128 + len).toString(16) + item.slice(2);
          } else {
            const lenStr = (183 + len).toString(16);
            const lenBytes = len.toString(16).padStart(Math.ceil(len.toString(16).length / 2) * 2, '0');
            return lenStr + lenBytes + item.slice(2);
          }
        }
        return item;
      };
      const encoded = items.map(encodeItem).join('');
      const totalLen = encoded.length / 2;
      if (totalLen <= 55) {
        return (192 + totalLen).toString(16) + encoded;
      } else {
        const lenStr = (247 + totalLen).toString(16);
        const lenBytes = totalLen.toString(16).padStart(Math.ceil(totalLen.toString(16).length / 2) * 2, '0');
        return lenStr + lenBytes + encoded;
      }
    };
    const rlpEncoded = rlpEncode([
      '0xff',
      factory,
      '0x' + salt,
      poolInitCodeHash,
    ]);
    const poolAddress = '0x' + ethers.keccak256('0x' + rlpEncoded).slice(-40);
    return `0x${poolAddress}`;
  }
}