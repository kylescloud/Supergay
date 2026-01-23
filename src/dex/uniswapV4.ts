import { ethers } from 'ethers';
import { DEX_CONFIG } from '../config/constants';

/**
 * Uniswap V4 DEX Integration
 * V4 uses a new architecture with Pool Manager and Hooks
 */
export class UniswapV4 {
  private poolManager: ethers.Contract;
  private universalRouter: ethers.Contract;
  private positionManager: ethers.Contract;
  private quoter: ethers.Contract;
  private provider: ethers.Provider;

  constructor(provider: ethers.Provider, signer?: ethers.Signer) {
    this.provider = provider;
    
    const config = DEX_CONFIG.uniswapV4;
    
    this.poolManager = new ethers.Contract(
      config.poolManager,
      [
        'function swap(address sender, bytes calldata key, tuple(bool zeroForOne, int256 amountSpecified, uint160 sqrtPriceLimitX96) calldata swapParams, bytes calldata hookData) external returns (tuple(int128 delta0, int128 delta1))',
        'function getSlot0(bytes32 poolId) external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
      ],
      signer || provider
    );

    this.universalRouter = new ethers.Contract(
      config.universalRouter,
      [
        'function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable',
      ],
      signer || provider
    );

    this.positionManager = new ethers.Contract(
      config.positionManager,
      [
        'function positions(uint256 tokenId) external view returns (tuple(uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1))',
      ],
      signer || provider
    );

    this.quoter = new ethers.Contract(
      config.quoter,
      [
        'function quoteExactInputSingle(tuple(address tokenIn, address tokenOut, uint256 amountIn, uint160 sqrtPriceLimitX96, bytes hookData) calldata params) external returns (uint256 amountOut, uint160 sqrtPriceX96After, int24 tickAfter, uint24 gasEstimate)',
      ],
      signer || provider
    );
  }

  /**
   * Get pool state from V4 Pool Manager
   */
  async getPoolState(
    token0: string,
    token1: string,
    fee: number
  ): Promise<any> {
    try {
      // In V4, pools are created using Pool Manager with hooks
      // Pool ID is computed as keccak256(abi.encode(PoolKey))
      const poolId = this.computePoolId(token0, token1, fee);
      
      const slot0 = await this.poolManager.getSlot0(poolId);
      
      return {
        sqrtPriceX96: slot0.sqrtPriceX96,
        tick: slot0.tick,
        liquidity: 0, // V4 liquidity is computed differently
        fee: fee,
      };
    } catch (error) {
      console.error('Error fetching V4 pool state:', error);
      throw error;
    }
  }

  /**
   * Compute V4 pool ID from pool key
   */
  private computePoolId(
    token0: string,
    token1: string,
    fee: number
  ): string {
    // Pool key structure for V4
    const poolKey = ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'address', 'uint24', 'int24', 'address'],
      [token0, token1, fee, 60, ethers.ZeroAddress] // 60 is default tick spacing
    );
    
    return ethers.keccak256(poolKey);
  }

  /**
   * Get quote for swap
   */
  async getQuote(
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    fee: number = 3000
  ): Promise<bigint> {
    try {
      const params = {
        tokenIn,
        tokenOut,
        amountIn,
        sqrtPriceLimitX96: 0,
        hookData: '0x',
      };

      const result = await this.quoter.quoteExactInputSingle(params);
      return result.amountOut;
    } catch (error) {
      console.error('Error getting V4 quote:', error);
      return BigInt(0);
    }
  }

  /**
   * Execute swap on Uniswap V4
   */
  async swap(
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    minAmountOut: bigint,
    fee: number = 3000
  ): Promise<bigint> {
    try {
      // Encode V4 swap command for Universal Router
      const commands = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256'],
        [0x10] // V4_SWAP_EXACT_IN command
      );

      const inputs = [
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['address', 'address', 'uint256', 'uint256', 'uint24', 'bool'],
          [tokenIn, tokenOut, amountIn, minAmountOut, fee, true]
        ),
      ];

      const tx = await this.universalRouter.execute(
        commands,
        inputs,
        Math.floor(Date.now() / 1000) + 60 // 1 minute deadline
      );

      const receipt = await tx.wait();
      
      // Parse amount out from logs
      // In production, parse Transfer events
      return amountIn; // Placeholder
    } catch (error) {
      console.error('Error executing V4 swap:', error);
      throw error;
    }
  }

  /**
   * Get effective rate for arbitrage calculation
   */
  getEffectiveRate(
    amountIn: bigint,
    amountOut: bigint
  ): number {
    if (amountIn === 0n) return 0;
    return Number(amountOut) / Number(amountIn);
  }
}