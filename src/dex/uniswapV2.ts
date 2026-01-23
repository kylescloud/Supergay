import { ethers } from 'ethers';
import { PoolState, Token } from '../types';
import { DEX_CONFIG } from '../config/constants';

// Uniswap V2 Pair ABI (minimal)
const PAIR_ABI = [
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
];

// Uniswap V2 Router ABI (minimal)
const ROUTER_ABI = [
  'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)',
];

/**
 * Uniswap V2 Pair Interface
 */
export class UniswapV2Pair {
  private provider: ethers.JsonRpcProvider;
  private pairAddress: string;
  private pairContract: ethers.Contract;
  private routerContract: ethers.Contract;

  constructor(provider: ethers.JsonRpcProvider, pairAddress: string) {
    this.provider = provider;
    this.pairAddress = pairAddress;
    this.pairContract = new ethers.Contract(pairAddress, PAIR_ABI, provider);
    this.routerContract = new ethers.Contract(
      DEX_CONFIG.uniswapV2.router,
      ROUTER_ABI,
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
      dex: 'uniswap-v2',
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
      fee: 3000, // 0.3% standard fee
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
      console.error('Quote swap error:', error);
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
    fee: number = 0.003
  ): bigint {
    // Constant product formula with fee
    // amountOut = (reserveOut * amountIn * (1 - fee)) / (reserveIn + amountIn * (1 - fee))
    
    const feeMultiplier = (1 - fee) * 1000000;
    const amountInWithFee = (amountIn * BigInt(Math.floor(feeMultiplier))) / BigInt(1000000);
    const numerator = reserveOut * amountInWithFee;
    const denominator = reserveIn + amountInWithFee;
    
    return numerator / denominator;
  }

  /**
   * Get pair address from token pair
   */
  static getPairAddress(
    factory: string,
    token0: string,
    token1: string
  ): string {
    // Uniswap V2 pair address is computed as keccak256(abi.encodePacked(token0, token1, salt))
    const initCodeHash = '0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f';
    const types = ['address', 'address'];
    
    // Sort tokens
    const sortedTokens = [token0.toLowerCase(), token1.toLowerCase()].sort();
    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(types, sortedTokens);
    const salt = ethers.keccak256(encoded).slice(2);
    
    // Compute address: keccak256(rlp encode [0xff, factory, salt, initCodeHash])
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
      initCodeHash,
    ]);
    const pairAddress = '0x' + ethers.keccak256('0x' + rlpEncoded).slice(-40);
    return `0x${pairAddress}`;
  }
}

/**
 * Uniswap V2 Factory Interface
 */
export class UniswapV2Factory {
  private provider: ethers.JsonRpcProvider;
  private factoryAddress: string;
  private factoryContract: ethers.Contract;

  constructor(provider: ethers.JsonRpcProvider, factoryAddress?: string) {
    this.provider = provider;
    this.factoryAddress = factoryAddress || DEX_CONFIG.uniswapV2.factory;
    
    const FACTORY_ABI = [
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

  /**
   * Get all pairs (paginated)
   */
  async getAllPairs(start: number = 0, end?: number): Promise<string[]> {
    const pairsLength = await this.factoryContract.allPairsLength();
    const limit = end ?? pairsLength;
    
    const pairs: string[] = [];
    for (let i = start; i < limit; i++) {
      const pair = await this.factoryContract.allPairs(i);
      pairs.push(pair);
    }
    
    return pairs;
  }
}