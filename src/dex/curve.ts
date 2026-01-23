import { ethers } from 'ethers';
import { PoolState, Token } from '../types';
import { CURVE_POOLS } from '../config/constants';

// Curve Pool ABI (minimal)
const POOL_ABI = [
  'function get_balances() external view returns (uint256[2] memory)',
  'function coins(uint256) external view returns (address)',
  'function exchange(int128 i, int128 j, uint256 dx, uint256 min_dy) external returns (uint256)',
  'function get_dy(int128 i, int128 j, uint256 dx) external view returns (uint256)',
  'function A() external view returns (uint256)',
  'function fee() external view returns (uint256)',
];

// Curve Registry ABI (minimal)
const REGISTRY_ABI = [
  'function get_pool_from_lp_token(address lp_token) external view returns (address)',
  'function get_coins(address pool) external view returns (address[8] memory)',
  'function get_balances(address pool) external view returns (uint256[8] memory)',
];

/**
 * Curve Pool Interface
 */
export class CurvePool {
  private provider: ethers.JsonRpcProvider;
  private poolAddress: string;
  private poolContract: ethers.Contract;

  constructor(provider: ethers.JsonRpcProvider, poolAddress: string) {
    this.provider = provider;
    this.poolAddress = poolAddress;
    this.poolContract = new ethers.Contract(poolAddress, POOL_ABI, provider);
  }

  /**
   * Get pool state at a specific block
   */
  async getPoolState(blockTag: ethers.BlockTag = 'latest'): Promise<PoolState> {
    const [balances, coin0, coin1, A, fee] = await Promise.all([
      this.poolContract.get_balances({ blockTag }),
      this.poolContract.coins(0, { blockTag }),
      this.poolContract.coins(1, { blockTag }),
      this.poolContract.A({ blockTag }),
      this.poolContract.fee({ blockTag }),
    ]);

    return {
      dex: 'curve',
      address: this.poolAddress,
      token0: {
        address: coin0,
        symbol: '',
        decimals: 18,
        name: '',
      },
      token1: {
        address: coin1,
        symbol: '',
        decimals: 18,
        name: '',
      },
      reserve0: BigInt(balances[0].toString()),
      reserve1: BigInt(balances[1].toString()),
      fee: parseInt(fee.toString()) / 10000000000, // Curve fees are in 1e10
      version: 'curve',
    };
  }

  /**
   * Quote a swap through the pool
   */
  async quoteSwap(
    tokenIn: Token,
    tokenOut: Token,
    amountIn: bigint
  ): Promise<bigint> {
    try {
      // Determine token indices
      const coin0 = await this.poolContract.coins(0);
      const coin1 = await this.poolContract.coins(1);
      
      let i: number, j: number;
      if (tokenIn.address.toLowerCase() === coin0.toLowerCase()) {
        i = 0;
        j = 1;
      } else if (tokenIn.address.toLowerCase() === coin1.toLowerCase()) {
        i = 1;
        j = 0;
      } else {
        throw new Error('Token not in pool');
      }

      const amountOut = await this.poolContract.get_dy(i, j, amountIn);
      return BigInt(amountOut.toString());
    } catch (error) {
      console.error('Quote swap error:', error);
      return 0n;
    }
  }

  /**
   * Calculate output amount using stable swap formula
   */
  calculateOutputAmount(
    amountIn: bigint,
    reserveIn: bigint,
    reserveOut: bigint,
    A: number = 100,
    fee: number = 0.0004
  ): bigint {
    // Stable swap formula approximation
    // This is a simplified version - production would use the full Newton-Raphson solver
    
    const D = reserveIn + reserveOut; // Simplified D calculation
    const feeMultiplier = (1 - fee) * 1000000;
    const amountInWithFee = (amountIn * BigInt(Math.floor(feeMultiplier))) / BigInt(1000000);
    
    // Apply stable swap with amplification
    const numerator = BigInt(D) * reserveOut * BigInt(A) * amountInWithFee;
    const denominator = BigInt(D) * (reserveIn + amountInWithFee) * BigInt(A) + amountInWithFee * reserveIn;
    
    return numerator / denominator;
  }

  /**
   * Get pool address for a token pair
   */
  static getPoolAddress(tokenA: string, tokenB: string): string | null {
    // Check known Curve pools
    const pairKey1 = `${tokenA.toLowerCase()}-${tokenB.toLowerCase()}`;
    const pairKey2 = `${tokenB.toLowerCase()}-${tokenA.toLowerCase()}`;
    
    return CURVE_POOLS[pairKey1 as keyof typeof CURVE_POOLS] || 
           CURVE_POOLS[pairKey2 as keyof typeof CURVE_POOLS] || null;
  }
}

/**
 * Curve Registry Interface
 */
export class CurveRegistry {
  private provider: ethers.JsonRpcProvider;
  private registryAddress: string;
  private registryContract: ethers.Contract | undefined;

  constructor(provider: ethers.JsonRpcProvider, registryAddress?: string) {
    this.provider = provider;
    this.registryAddress = registryAddress || CURVE_POOLS['USDC-DAI'] || ethers.ZeroAddress;
    
    if (this.registryAddress !== ethers.ZeroAddress) {
      this.registryContract! = new ethers.Contract(
        this.registryAddress,
        REGISTRY_ABI,
        provider
      );
    }
  }

  /**
   * Get pool address from LP token
   */
  async getPoolFromLpToken(lpToken: string): Promise<string> {
    if (this.registryAddress === ethers.ZeroAddress) {
      return ethers.ZeroAddress;
    }
    return await this.registryContract!.get_pool_from_lp_token(lpToken);
  }

  /**
   * Get pool coins
   */
  async getCoins(poolAddress: string): Promise<string[]> {
    if (this.registryAddress === ethers.ZeroAddress) {
      return [];
    }
    const coins = await this.registryContract!.get_coins(poolAddress);
    // Filter out zero addresses
    return coins.filter((addr: string) => addr !== ethers.ZeroAddress);
  }

  /**
   * Get pool balances
   */
  async getBalances(poolAddress: string): Promise<bigint[]> {
    if (this.registryAddress === ethers.ZeroAddress) {
      return [];
    }
    const balances = await this.registryContract!.get_balances(poolAddress);
    return balances.map((b: any) => BigInt(b.toString()));
  }
}