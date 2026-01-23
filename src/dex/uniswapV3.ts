import { ethers } from 'ethers';
import { PoolState, Token } from '../types';
import { DEX_CONFIG } from '../config/constants';

// Uniswap V3 Pool ABI (minimal)
const POOL_ABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() external view returns (uint128)',
  'function fee() external view returns (uint24)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
];

// Uniswap V3 Quoter ABI
const QUOTER_ABI = [
  'function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)',
];

/**
 * Uniswap V3 Pool Interface
 */
export class UniswapV3Pool {
  private provider: ethers.JsonRpcProvider;
  private poolAddress: string;
  private poolContract: ethers.Contract;
  private quoterContract: ethers.Contract;

  constructor(provider: ethers.JsonRpcProvider, poolAddress: string) {
    this.provider = provider;
    this.poolAddress = poolAddress;
    this.poolContract = new ethers.Contract(poolAddress, POOL_ABI, provider);
    this.quoterContract = new ethers.Contract(
      DEX_CONFIG.uniswapV3.quoter,
      QUOTER_ABI,
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
      dex: 'uniswap-v3',
      address: this.poolAddress,
      token0: {
        address: token0,
        symbol: '', // Will be filled by token metadata
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
      console.error('Quote swap error:', error);
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
    // This is a simplified calculation
    // Production code would use the full tick-based calculation
    
    const Q96 = BigInt(2) ** BigInt(96);
    const price = (sqrtPriceX96 * sqrtPriceX96) / Q96;
    
    if (tokenInIsToken0) {
      // Selling token0 for token1
      const liquidityInvariant = liquidity * Q96 / sqrtPriceX96;
      const newLiquidity = liquidityInvariant - amountIn;
      const newSqrtPriceX96 = liquidity * Q96 / newLiquidity;
      const amountOut = liquidity * (sqrtPriceX96 - newSqrtPriceX96) / Q96;
      return amountOut;
    } else {
      // Selling token1 for token0
      const liquidityInvariant = liquidity * sqrtPriceX96 / Q96;
      const newLiquidity = liquidityInvariant - amountIn;
      const newSqrtPriceX96 = newLiquidity * Q96 / liquidity;
      const amountOut = liquidity * (newSqrtPriceX96 - sqrtPriceX96) / newSqrtPriceX96;
      return amountOut;
    }
  }

  /**
   * Get pool address from token pair and fee tier
   */
  static getPoolAddress(
    factory: string,
    token0: string,
    token1: string,
    fee: number
  ): string {
    // Uniswap V3 pool address is computed as keccak256(abi.encodePacked(token0, token1, fee))
    const poolInitCodeHash = '0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54';
    const types = ['address', 'address', 'uint24'];
    const values = [token0.toLowerCase(), token1.toLowerCase(), fee];
    
    // Sort tokens
    const sortedTokens = [values[0], values[1]].sort();
    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
      types,
      [sortedTokens[0], sortedTokens[1], fee]
    );
    const hash = ethers.keccak256(encoded);
    
    // Compute address: keccak256(rlp encode [0xff, factory, salt, initCodeHash])
    const salt = hash.slice(2);
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

/**
 * Uniswap V3 Factory Interface
 */
export class UniswapV3Factory {
  private provider: ethers.JsonRpcProvider;
  private factoryAddress: string;
  private factoryContract: ethers.Contract;

  constructor(provider: ethers.JsonRpcProvider, factoryAddress?: string) {
    this.provider = provider;
    this.factoryAddress = factoryAddress || DEX_CONFIG.uniswapV3.factory;
    
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