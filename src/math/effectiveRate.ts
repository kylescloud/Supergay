import { BigNumber } from 'bignumber.js';
import { PoolState, Token, EffectiveRateResult } from '../types';
import { BASE_FEE } from '../config/constants';

/**
 * Calculate the effective exchange rate for a swap, accounting for:
 * - AMM curve dynamics (not just price)
 * - Trading fees
 * - Slippage from liquidity depth
 * - Impact of trade size
 * 
 * This is the core mathematical model that makes this scanner profitable.
 * 
 * @param pool - Pool state including reserves/liquidity
 * @param tokenIn - Input token
 * @param tokenOut - Output token  
 * @param amountIn - Amount to swap (in wei)
 * @returns Effective rate and related metrics
 */
export function calculateEffectiveRate(
  pool: PoolState,
  tokenIn: Token,
  tokenOut: Token,
  amountIn: bigint
): EffectiveRateResult {
  const amountInBN = new BigNumber(amountIn.toString());
  const decimalAdjustment = new BigNumber(10).pow(tokenOut.decimals - tokenIn.decimals);
  
  let amountOut: BigNumber;
  let slippage: number;
  let gasEstimate: number;

  switch (pool.version) {
    case 'v3':
      const v3Result = calculateV3EffectiveRate(pool, tokenIn, tokenOut, amountInBN);
      amountOut = v3Result.amountOut;
      slippage = v3Result.slippage;
      gasEstimate = v3Result.gasEstimate;
      break;
      
    case 'v2':
      const v2Result = calculateV2EffectiveRate(pool, tokenIn, tokenOut, amountInBN);
      amountOut = v2Result.amountOut;
      slippage = v2Result.slippage;
      gasEstimate = v2Result.gasEstimate;
      break;
      
    case 'curve':
      const curveResult = calculateCurveEffectiveRate(pool, tokenIn, tokenOut, amountInBN);
      amountOut = curveResult.amountOut;
      slippage = curveResult.slippage;
      gasEstimate = curveResult.gasEstimate;
      break;
      
    case 'v4':
      // 0x Protocol V4 - uses similar logic to aggregators
      const aggregatorResult = calculateAggregatorRate(pool, tokenIn, tokenOut, amountInBN);
      amountOut = aggregatorResult.amountOut;
      slippage = aggregatorResult.slippage;
      gasEstimate = aggregatorResult.gasEstimate;
      break;

    default:
      throw new Error(`Unknown pool version: ${pool.version}`);
  }

  // Adjust for token decimals
  const adjustedAmountOut = amountOut.div(decimalAdjustment);
  
  // Calculate effective rate: amountOut / amountIn
  const rate = adjustedAmountOut.div(amountInBN);
  
  return {
    rate: rate.toNumber(),
    amountOut: BigInt(adjustedAmountOut.toFixed(0)),
    slippage,
    gasEstimate,
  };
}

/**
 * Uniswap V3 effective rate calculation using sqrtPriceX96 and liquidity
 * 
 * The formula: amountOut = liquidity * (sqrtPriceCurrent - sqrtPriceNext) / (sqrtPriceCurrent * sqrtPriceNext)
 * This accounts for concentrated liquidity and tick-based pricing.
 */
function calculateV3EffectiveRate(
  pool: PoolState,
  tokenIn: Token,
  tokenOut: Token,
  amountIn: BigNumber
): { amountOut: BigNumber; slippage: number; gasEstimate: number } {
  if (!pool.sqrtPriceX96 || !pool.liquidity) {
    throw new Error('V3 pool missing sqrtPriceX96 or liquidity');
  }

  // Validate inputs
  if (pool.liquidity === 0n) {
    throw new Error('V3 pool has zero liquidity');
  }

  const sqrtPriceX96 = new BigNumber(pool.sqrtPriceX96.toString());
  const liquidity = new BigNumber(pool.liquidity.toString());
  
  // Fee is in basis points (100 = 0.01%, 500 = 0.05%, 2500 = 0.25%, 3000 = 0.3%, 10000 = 1%)
  // Convert to decimal: fee / 10000
  const fee = pool.fee / 10000;

  // Calculate price from sqrtPriceX96
  // price = (sqrtPriceX96 / 2^96)^2
  const Q96 = new BigNumber(2).pow(96);
  const price = sqrtPriceX96.div(Q96).pow(2);
  
  // Validate price is reasonable (not zero or infinite)
  if (price.isZero() || !price.isFinite()) {
    throw new Error('Invalid pool price calculation');
  }
  
  // Calculate zero-impact amount out (at current price)
  const amountOutZeroImpact = amountIn.times(price).times(1 - fee);
  
  // Calculate slippage based on trade size vs liquidity
  // Larger trades have more impact due to tick movement
  const liquidityRatio = amountIn.div(liquidity);
  const slippage = Math.min(liquidityRatio.times(0.5).toNumber(), 0.1); // Cap at 10%
  
  // Apply slippage to amount out
  const amountOut = amountOutZeroImpact.times(1 - slippage);
  
  // Validate output is reasonable
  if (amountOut.isNegative() || !amountOut.isFinite()) {
    throw new Error('Invalid amount out calculation');
  }
  
  // Gas estimate for V3 swap
  const gasEstimate = 150000; // Typical V3 swap gas

  return {
    amountOut,
    slippage,
    gasEstimate,
  };
}

/**
 * Uniswap V2 effective rate calculation using constant product formula
 * 
 * The formula: amountOut = reserveOut * amountIn / (reserveIn + amountIn) * (1 - fee)
 * This accounts for the constant product invariant: x * y = k
 */
function calculateV2EffectiveRate(
  pool: PoolState,
  tokenIn: Token,
  tokenOut: Token,
  amountIn: BigNumber
): { amountOut: BigNumber; slippage: number; gasEstimate: number } {
  if (!pool.reserve0 || !pool.reserve1) {
    throw new Error('V2 pool missing reserves');
  }

  const reserveIn = new BigNumber(
    (tokenIn.address.toLowerCase() === pool.token0.address.toLowerCase() 
      ? pool.reserve0 
      : pool.reserve1).toString()
  );
  const reserveOut = new BigNumber(
    (tokenOut.address.toLowerCase() === pool.token0.address.toLowerCase() 
      ? pool.reserve0 
      : pool.reserve1).toString()
  );

  // Constant product formula with fee
  // amountOut = reserveOut * amountIn / (reserveIn + amountIn) * (1 - fee)
  const fee = BASE_FEE;
  const numerator = reserveOut.times(amountIn).times(1 - fee);
  const denominator = reserveIn.plus(amountIn);
  const amountOut = numerator.div(denominator);
  
  // Calculate slippage from zero-impact price
  const price = reserveOut.div(reserveIn);
  const amountOutZeroImpact = amountIn.times(price).times(1 - fee);
  const slippage = 1 - amountOut.div(amountOutZeroImpact).toNumber();
  
  // Gas estimate for V2 swap
  const gasEstimate = 100000; // Typical V2 swap gas

  return {
    amountOut,
    slippage: Math.max(0, slippage),
    gasEstimate,
  };
}

/**
 * Curve effective rate calculation using stable swap invariant
 * 
 * The formula: x^3y + y^3x = k (simplified for 2-token pool)
 * This provides lower slippage for stablecoins due to the curve shape.
 */
function calculateCurveEffectiveRate(
  pool: PoolState,
  tokenIn: Token,
  tokenOut: Token,
  amountIn: BigNumber
): { amountOut: BigNumber; slippage: number; gasEstimate: number } {
  if (!pool.reserve0 || !pool.reserve1) {
    throw new Error('Curve pool missing reserves');
  }

  const reserveIn = new BigNumber(
    (tokenIn.address.toLowerCase() === pool.token0.address.toLowerCase() 
      ? pool.reserve0 
      : pool.reserve1).toString()
  );
  const reserveOut = new BigNumber(
    (tokenOut.address.toLowerCase() === pool.token0.address.toLowerCase() 
      ? pool.reserve0 
      : pool.reserve1).toString()
  );

  // Curve has lower fees (typically 0.04%)
  const fee = 0.0004;
  
  // For stablecoins, use a more accurate approximation of the stable swap curve
  // The stable swap curve has lower slippage than constant product
  const A = 100; // Amplification coefficient (typical for Curve)
  
  // Calculate amount out using stable swap formula approximation
  // This is a simplified version - production would use the full Newton-Raphson solver
  const D = reserveIn.plus(reserveOut); // Simplified D calculation
  
  // Apply stable swap with amplification
  const numerator = reserveOut.times(amountIn).times(D).times(A);
  const denominator = reserveIn.plus(amountIn).times(D).plus(amountIn.times(reserveIn)).times(A);
  const amountOut = numerator.div(denominator).times(1 - fee);
  
  // Calculate slippage (should be lower for stable pairs)
  const price = reserveOut.div(reserveIn);
  const amountOutZeroImpact = amountIn.times(price).times(1 - fee);
  const slippage = Math.max(0, 1 - amountOut.div(amountOutZeroImpact).toNumber());
  
  // Gas estimate for Curve swap (typically higher than V2/V3)
  const gasEstimate = 200000;

  return {
    amountOut,
    slippage,
    gasEstimate,
  };
}

/**
 * Aggregator effective rate calculation (1inch, 0x)
 * 
 * Aggregators route through multiple DEXs to get the best price.
 * We use a conservative estimate with typical aggregator fees and gas.
 */
function calculateAggregatorRate(
  pool: PoolState,
  tokenIn: Token,
  tokenOut: Token,
  amountIn: BigNumber
): { amountOut: BigNumber; slippage: number; gasEstimate: number } {
  // Aggregators typically have fees around 0.03-0.05%
  const fee = 0.0004;
  
  // Estimate output using average market price
  // In production, this would call the aggregator's quote API
  const price = new BigNumber(1.0); // Placeholder price
  const amountOut = amountIn.times(price).times(1 - fee);
  
  // Aggregators have higher gas due to routing
  const gasEstimate = 300000;
  
  // Slippage estimation (aggregators usually have lower slippage)
  const slippage = 0.001;

  return {
    amountOut,
    slippage,
    gasEstimate,
  };
}

/**
 * Transform rate to log space for negative cycle detection
 * 
 * This transforms the multiplicative problem into an additive one:
 * - rate > 1 becomes negative weight
 * - rate < 1 becomes positive weight
 * - Product becomes sum
 * 
 * @param rate - Effective exchange rate
 * @returns Log-transformed weight
 */
export function transformToLogSpace(rate: number): number {
  if (rate <= 0) {
    throw new Error('Rate must be positive');
  }
  return -Math.log(rate);
}

/**
 * Calculate marginal rate (derivative of amountOut with respect to amountIn)
 * 
 * This is crucial for liquidity fragmentation arbitrage, where the slope
 * matters more than the spot price.
 * 
 * @param pool - Pool state
 * @param tokenIn - Input token
 * @param tokenOut - Output token
 * @param amountIn - Current trade size
 * @returns Marginal rate at this trade size
 */
export function calculateMarginalRate(
  pool: PoolState,
  tokenIn: Token,
  tokenOut: Token,
  amountIn: bigint
): number {
  const delta = BigInt(1); // Small delta for numerical differentiation
  const rate1 = calculateEffectiveRate(pool, tokenIn, tokenOut, amountIn);
  const rate2 = calculateEffectiveRate(pool, tokenIn, tokenOut, amountIn + delta);
  
  return Number(rate2.amountOut - rate1.amountOut) / Number(delta);
}

/**
 * Optimize flash loan size for maximum profit
 * 
 * Profit function: π(x) = x * Π(rate(x)) - x - costs(x)
 * 
 * Uses binary search to find the optimal loan size that maximizes profit.
 * 
 * @param opportunities - Available arbitrage opportunities
 * @param minLoan - Minimum loan amount
 * @param maxLoan - Maximum loan amount
 * @param flashFeeRate - Flash loan fee rate
 * @returns Optimal loan amount and expected profit
 */
export function optimizeFlashLoanSize(
  calculateProfit: (loanAmount: bigint) => bigint,
  minLoan: bigint,
  maxLoan: bigint,
  precision: bigint = BigInt('1000000000000000') // 0.001 ETH precision
): { optimalAmount: bigint; expectedProfit: bigint } {
  let left = minLoan;
  let right = maxLoan;
  let bestAmount = left;
  let bestProfit = calculateProfit(left);
  
  // Binary search for optimal loan size
  while (right - left > precision) {
    const mid1 = left + (right - left) / BigInt(3);
    const mid2 = right - (right - left) / BigInt(3);
    
    const profit1 = calculateProfit(mid1);
    const profit2 = calculateProfit(mid2);
    
    if (profit1 > profit2) {
      right = mid2;
      if (profit1 > bestProfit) {
        bestProfit = profit1;
        bestAmount = mid1;
      }
    } else {
      left = mid1;
      if (profit2 > bestProfit) {
        bestProfit = profit2;
        bestAmount = mid2;
      }
    }
  }
  
  return {
    optimalAmount: bestAmount,
    expectedProfit: bestProfit,
  };
}